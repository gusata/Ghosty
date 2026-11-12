//! The island's host window: cursor poll and click-through, the shrunk host while
//! the island is collapsed, WebView2 zoom correction and memory targets.
//!
//! Techniques adapted from Coucou's Windows port (MIT, see THIRD_PARTY_NOTICES.md):
//! the poll never blocks on the UI thread, slows down when the cursor is far from
//! the island, parks when no island is visible, and only talks to the page near it.

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use windows::core::Interface;
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowRect, IsWindow, IsWindowVisible, SetWindowPos, HWND_TOPMOST,
    SWP_NOACTIVATE,
};

use super::{CursorPosition, Edge, IslandRect};

/// Margin around the island that still counts as hovering it, in logical px.
pub(crate) const CURSOR_HIT_MARGIN: f64 = 14.0;
/// Around the island, how far the cursor is still worth following, in logical px.
/// Past it the page hears once that the cursor left, then nothing.
const NEAR_ZONE: f64 = 240.0;
/// Poll period while the cursor is near an island.
const NEAR_PERIOD: Duration = Duration::from_millis(16);
/// Poll period while the cursor is far from every island.
const FAR_PERIOD: Duration = Duration::from_millis(50);
/// Poll period while no island window is visible.
const PARKED_PERIOD: Duration = Duration::from_millis(250);
/// How often the list of island windows is refreshed.
const WINDOW_REFRESH: Duration = Duration::from_secs(1);
/// Re-send "inside" this often so a hover that lost its DOM event still opens.
const INSIDE_RETRY: Duration = Duration::from_millis(100);
/// Slack around the collapsed body inside the shrunk host, in logical px. The
/// hover margin itself is computed from screen coordinates, so it needs no room.
const HOST_SLACK: f64 = 4.0;

/// Where the full host window sits, as placed by `apply_display_layout`.
#[derive(Clone, Copy)]
pub(crate) struct HostLayout {
    pub edge: Edge,
    pub position_percent: f64,
    pub origin: (i32, i32),
    pub size: (u32, u32),
    pub scale: f64,
}

#[derive(Default)]
pub(crate) struct HitState {
    pub rects: HashMap<String, IslandRect>,
    pub hover_rects: HashMap<String, IslandRect>,
    pub layouts: HashMap<String, HostLayout>,
    /// Logical offset of the shrunk host's origin from the full host's origin.
    pub shrunk: HashMap<String, (f64, f64)>,
}

impl HitState {
    fn translate(&mut self, label: &str, dx: f64, dy: f64) {
        for rects in [&mut self.rects, &mut self.hover_rects] {
            if let Some(rect) = rects.get_mut(label) {
                rect.x += dx;
                rect.y += dy;
            }
        }
    }
}

/// Wakes the poll early when the island changes, instead of waiting a period.
#[derive(Default)]
pub(crate) struct PollWake {
    flag: Mutex<bool>,
    cv: Condvar,
}

impl PollWake {
    pub fn nudge(&self) {
        *self.flag.lock().unwrap() = true;
        self.cv.notify_all();
    }

    fn wait(&self, period: Duration) {
        let guard = self.flag.lock().unwrap();
        let (mut guard, _) = self.cv.wait_timeout_while(guard, period, |woken| !*woken).unwrap();
        *guard = false;
    }
}

#[derive(Default)]
pub(crate) struct CursorState {
    pub hit: Arc<Mutex<HitState>>,
    pub wake: Arc<PollWake>,
    zoom: Mutex<HashMap<String, f64>>,
}

fn is_island_window(label: &str) -> bool {
    label == "main" || label.starts_with("display-")
}

fn hwnd_of(window: &WebviewWindow) -> Option<isize> {
    window.hwnd().ok().map(|hwnd| hwnd.0 as isize).filter(|raw| *raw != 0)
}

fn scale_of(hwnd: HWND) -> f64 {
    let dpi = unsafe { GetDpiForWindow(hwnd) };
    if dpi == 0 { 1.0 } else { f64::from(dpi) / 96.0 }
}

fn contains(rect: &IslandRect, x: f64, y: f64, margin: f64) -> bool {
    x >= rect.x - margin
        && x <= rect.x + rect.width + margin
        && y >= rect.y - margin
        && y <= rect.y + rect.height + margin
}

struct Tracked {
    window: WebviewWindow,
    hwnd: isize,
    ignoring: Option<bool>,
    last: Option<(f64, f64, bool, bool)>,
    last_emit: Option<Instant>,
    far: bool,
}

impl Tracked {
    fn reset(&mut self) {
        self.last = None;
        self.last_emit = None;
        self.far = false;
    }
}

/// Reads the cursor with plain Win32 calls (no UI-thread round trips), flips
/// click-through when the cursor crosses the island and reports it to the page.
pub(crate) fn spawn_cursor_poll(app: AppHandle, hit: Arc<Mutex<HitState>>, wake: Arc<PollWake>) {
    thread::spawn(move || {
        let mut tracked: HashMap<String, Tracked> = HashMap::new();
        let mut refreshed_at: Option<Instant> = None;
        let mut period = NEAR_PERIOD;
        loop {
            wake.wait(period);

            if refreshed_at.map_or(true, |at| at.elapsed() >= WINDOW_REFRESH) {
                refreshed_at = Some(Instant::now());
                let windows = app.webview_windows();
                tracked.retain(|label, entry| {
                    windows.contains_key(label) && unsafe { IsWindow(Some(HWND(entry.hwnd as *mut _))) }.as_bool()
                });
                for (label, window) in windows {
                    if !is_island_window(&label) || tracked.contains_key(&label) {
                        continue;
                    }
                    let Some(hwnd) = hwnd_of(&window) else { continue };
                    tracked.insert(label, Tracked { window, hwnd, ignoring: None, last: None, last_emit: None, far: false });
                }
            }

            let mut cursor = POINT::default();
            if unsafe { GetCursorPos(&mut cursor) }.is_err() {
                period = NEAR_PERIOD;
                continue;
            }
            let dragging = unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } < 0;

            let mut any_visible = false;
            let mut any_near = false;
            for (label, entry) in tracked.iter_mut() {
                let hwnd = HWND(entry.hwnd as *mut _);
                if !unsafe { IsWindowVisible(hwnd) }.as_bool() {
                    entry.reset();
                    continue;
                }
                any_visible = true;

                // Rects and origin are read together: the host may be resized and
                // its rects translated by set_host_collapsed under the same lock.
                let (rect, hover, origin) = {
                    let state = hit.lock().unwrap();
                    let mut origin = RECT::default();
                    let ok = unsafe { GetWindowRect(hwnd, &mut origin) }.is_ok();
                    (
                        state.rects.get(label).copied(),
                        state.hover_rects.get(label).copied(),
                        ok.then_some(origin),
                    )
                };
                let Some(origin) = origin else { continue };

                let Some(rect) = rect else {
                    if entry.ignoring != Some(true) && entry.window.set_ignore_cursor_events(true).is_ok() {
                        let _ = entry.window.set_always_on_top(true);
                        entry.ignoring = Some(true);
                    }
                    entry.reset();
                    continue;
                };

                let scale = scale_of(hwnd);
                let x = f64::from(cursor.x - origin.left) / scale;
                let y = f64::from(cursor.y - origin.top) / scale;
                let inside_body = contains(&rect, x, y, 0.0);
                let inside_hover = !dragging && hover.is_some_and(|hover| contains(&hover, x, y, CURSOR_HIT_MARGIN));
                let inside = inside_body || inside_hover;
                let near = dragging
                    || contains(&rect, x, y, NEAR_ZONE)
                    || hover.is_some_and(|hover| contains(&hover, x, y, NEAR_ZONE));
                any_near |= near;

                // The hover margin can open the menu but remains click-through.
                let ignore = !inside_body;
                if entry.ignoring != Some(ignore) && entry.window.set_ignore_cursor_events(ignore).is_ok() {
                    let _ = entry.window.set_always_on_top(true);
                    entry.ignoring = Some(ignore);
                }

                let changed = entry.last.map_or(true, |last| last.2 != inside || last.3 != dragging);
                let moved = entry.last.map_or(true, |last| (x - last.0).abs() >= 1.0 || (y - last.1).abs() >= 1.0);
                entry.last = Some((x, y, inside, dragging));
                let position = CursorPosition { x, y, inside, dragging };

                if !near && !changed {
                    // Far away: the page hears it once, then nothing.
                    if !entry.far {
                        entry.far = true;
                        let _ = app.emit_to(label.as_str(), "edge-ghosty-cursor", position);
                        entry.last_emit = Some(Instant::now());
                    }
                    continue;
                }
                entry.far = !near;
                let retry = inside && entry.last_emit.map_or(true, |at| at.elapsed() >= INSIDE_RETRY);
                if moved || changed || retry {
                    let _ = app.emit_to(label.as_str(), "edge-ghosty-cursor", position);
                    entry.last_emit = Some(Instant::now());
                }
            }

            period = if !any_visible {
                PARKED_PERIOD
            } else if any_near {
                NEAR_PERIOD
            } else {
                FAR_PERIOD
            };
        }
    });
}

#[tauri::command]
pub(crate) fn set_island_rect(
    window: WebviewWindow,
    state: State<CursorState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    hover_x: f64,
    hover_y: f64,
    hover_width: f64,
    hover_height: f64,
) -> Result<(), String> {
    if ![x, y, width, height, hover_x, hover_y, hover_width, hover_height].iter().all(|value| value.is_finite()) {
        return Err("geometria do notch inválida".to_string());
    }
    let label = window.label().to_string();
    {
        let mut hit = state.hit.lock().unwrap();
        hit.rects.insert(label.clone(), IslandRect { x, y, width, height });
        hit.hover_rects.insert(label, IslandRect { x: hover_x, y: hover_y, width: hover_width, height: hover_height });
    }
    state.wake.nudge();
    Ok(())
}

/// The shrunk host's physical rect: the collapsed body plus a little slack, at
/// the same place on screen. The body is laid out as `(host - body) * position`
/// along the edge, so the shrunk host is placed where that same formula puts the
/// body on the same screen pixels; nothing in the page has to move.
fn shrunk_host_rect(layout: HostLayout, width: f64, height: f64) -> (i32, i32, i32, i32) {
    let scale = layout.scale;
    let slack = (HOST_SLACK * scale).round() as i32;
    let position = layout.position_percent.clamp(0.0, 100.0) / 100.0;
    let (full_x, full_y) = layout.origin;
    let (full_w, full_h) = (layout.size.0 as i32, layout.size.1 as i32);
    let body_w = ((width * scale).round() as i32).clamp(1, full_w.max(1));
    let body_h = ((height * scale).round() as i32).clamp(1, full_h.max(1));

    let along = |origin: i32, full: i32, body: i32| {
        let len = (body + 2 * slack).min(full);
        let start = origin + (f64::from(full - body) * position).round() as i32
            - (f64::from(len - body) * position).round() as i32;
        (start, len)
    };
    let across_start = |origin: i32, full: i32, body: i32| (origin, (body + slack).min(full));
    let across_end = |origin: i32, full: i32, body: i32| {
        let len = (body + slack).min(full);
        (origin + full - len, len)
    };

    let ((x, w), (y, h)) = match layout.edge {
        Edge::Top => (along(full_x, full_w, body_w), across_start(full_y, full_h, body_h)),
        Edge::Bottom => (along(full_x, full_w, body_w), across_end(full_y, full_h, body_h)),
        Edge::Left => (across_start(full_x, full_w, body_w), along(full_y, full_h, body_h)),
        Edge::Right => (across_end(full_x, full_w, body_w), along(full_y, full_h, body_h)),
    };
    (x, y, w, h)
}

/// Shrinks the host window around the collapsed island, or gives it back its
/// full size before the island opens. Runs on the UI thread (sync command).
/// Returns whether the window changed.
#[tauri::command]
pub(crate) fn set_host_collapsed(
    window: WebviewWindow,
    state: State<CursorState>,
    collapsed: bool,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<bool, String> {
    let label = window.label().to_string();
    if !is_island_window(&label) {
        return Ok(false);
    }
    let hwnd = window.hwnd().map_err(|error| error.to_string())?;
    let changed = {
        let mut hit = state.hit.lock().unwrap();
        let Some(layout) = hit.layouts.get(&label).copied() else { return Ok(false) };
        if collapsed {
            let (Some(width), Some(height)) = (width, height) else {
                return Err("tamanho da ilha recolhida ausente".to_string());
            };
            if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
                return Err("tamanho da ilha recolhida inválido".to_string());
            }
            let (x, y, w, h) = shrunk_host_rect(layout, width, height);
            unsafe { SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, w, h, SWP_NOACTIVATE) }
                .map_err(|error| error.to_string())?;
            let offset = (
                f64::from(x - layout.origin.0) / layout.scale,
                f64::from(y - layout.origin.1) / layout.scale,
            );
            let previous = hit.shrunk.insert(label.clone(), offset).unwrap_or((0.0, 0.0));
            hit.translate(&label, previous.0 - offset.0, previous.1 - offset.1);
            true
        } else if let Some(offset) = hit.shrunk.remove(&label) {
            unsafe {
                SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    layout.origin.0,
                    layout.origin.1,
                    layout.size.0 as i32,
                    layout.size.1 as i32,
                    SWP_NOACTIVATE,
                )
            }
            .map_err(|error| error.to_string())?;
            hit.translate(&label, offset.0, offset.1);
            true
        } else {
            false
        }
    };
    state.wake.nudge();
    Ok(changed)
}

/// WebView2 can report a devicePixelRatio other than the window's scale (Windows
/// text size, monitors with different DPI). The island is laid out in CSS px
/// that Rust reads as logical px, so the zoom is corrected until both agree.
/// Returns whether the zoom changed.
#[tauri::command]
pub(crate) fn fit_webview_zoom(
    window: WebviewWindow,
    state: State<CursorState>,
    device_pixel_ratio: f64,
) -> Result<bool, String> {
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let mut zooms = state.zoom.lock().unwrap();
    let current = zooms.get(window.label()).copied().unwrap_or(1.0);
    let Some(next) = zoom_correction(current, scale, device_pixel_ratio) else { return Ok(false) };
    window.set_zoom(next).map_err(|error| error.to_string())?;
    zooms.insert(window.label().to_string(), next);
    Ok(true)
}

fn zoom_correction(current: f64, scale: f64, device_pixel_ratio: f64) -> Option<f64> {
    if !current.is_finite() || current <= 0.0
        || !scale.is_finite() || scale <= 0.0
        || !device_pixel_ratio.is_finite() || device_pixel_ratio <= 0.0
    {
        return None;
    }
    if (device_pixel_ratio - scale).abs() / scale < 0.02 {
        return None;
    }
    Some((current * scale / device_pixel_ratio).clamp(0.25, 4.0))
}

/// Asks WebView2 to keep a hidden window's memory low, or back to normal before
/// it shows. Best effort: an old runtime without the setting is left as is.
pub(crate) fn set_webview_memory_low(window: &WebviewWindow, low: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };
    let level = if low {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
    } else {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
    };
    let _ = window.with_webview(move |webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(core) = core.cast::<ICoreWebView2_19>() else { return };
        let _ = core.SetMemoryUsageTargetLevel(level);
    });
}

/// Hides an auxiliary window (popup, settings) and lets WebView2 trim it.
#[tauri::command]
pub(crate) fn hide_auxiliary_window(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())?;
    if !is_island_window(window.label()) {
        set_webview_memory_low(&window, true);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout(edge: Edge, position_percent: f64) -> HostLayout {
        HostLayout { edge, position_percent, origin: (100, 0), size: (1100, 420), scale: 1.0 }
    }

    /// Where `(host - body) * position` puts the body, in screen px.
    fn body_start(host_start: i32, host_len: i32, body_len: i32, position: f64) -> f64 {
        f64::from(host_start) + f64::from(host_len - body_len) * position
    }

    #[test]
    fn the_shrunk_host_keeps_the_body_on_the_same_pixels() {
        for position in [0.0, 25.0, 50.0, 73.0, 100.0] {
            let full = layout(Edge::Top, position);
            let (x, y, w, h) = shrunk_host_rect(full, 180.0, 8.0);
            let p = position / 100.0;
            let before = body_start(100, 1100, 180, p);
            let after = body_start(x, w, 180, p);
            assert!((before - after).abs() <= 1.0, "position {position}: {before} vs {after}");
            assert_eq!(y, 0);
            assert_eq!(h, 12);
            assert!(x >= 100 && x + w <= 1200);
        }
    }

    #[test]
    fn edges_anchor_the_shrunk_host_to_the_screen_side() {
        let (_, y, _, h) = shrunk_host_rect(layout(Edge::Bottom, 50.0), 180.0, 8.0);
        assert_eq!(y + h, 420);
        let (x, _, w, _) = shrunk_host_rect(layout(Edge::Left, 50.0), 8.0, 180.0);
        assert_eq!((x, w), (100, 12));
        let (x, _, w, _) = shrunk_host_rect(layout(Edge::Right, 50.0), 8.0, 180.0);
        assert_eq!(x + w, 1200);
    }

    #[test]
    fn the_shrunk_host_never_outgrows_the_full_host() {
        let (x, _, w, _) = shrunk_host_rect(layout(Edge::Top, 50.0), 5000.0, 8.0);
        assert_eq!((x, w), (100, 1100));
    }

    #[test]
    fn zoom_is_corrected_only_when_ratio_and_scale_disagree() {
        assert_eq!(zoom_correction(1.0, 1.25, 1.25), None);
        assert_eq!(zoom_correction(1.0, 1.0, 1.01), None);
        assert_eq!(zoom_correction(1.0, 1.0, 1.25), Some(0.8));
        assert_eq!(zoom_correction(1.0, 1.5, 1.0), Some(1.5));
        assert_eq!(zoom_correction(1.0, 0.0, 1.0), None);
        assert_eq!(zoom_correction(1.0, 1.0, f64::NAN), None);
    }
}
