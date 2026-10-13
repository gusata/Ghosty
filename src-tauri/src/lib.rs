use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::process::Command;
use std::os::windows::process::CommandExt;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::window::Monitor;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use windows::Win32::Foundation::{CloseHandle, GlobalFree, HANDLE, HGLOBAL, POINT};
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eConsole, eRender, AudioSessionStateExpired, IAudioSessionControl2,
    IAudioSessionManager2, IMMDeviceEnumerator, MMDeviceEnumerator, ISimpleAudioVolume,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
};
use windows::Win32::System::Ole::CF_UNICODETEXT;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, GetAsyncKeyState, KEYEVENTF_KEYUP, VK_LBUTTON, VK_MEDIA_NEXT_TRACK,
    VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SW_SHOWNORMAL,
};
use windows::core::{Interface, PCWSTR, PWSTR};

mod codex_hooks;
mod codex_chat;
mod quick_chat_hotkey;
mod credentials;
mod github;
mod vercel;
mod weather;
mod google_workspace;
mod tray;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DisplayInfo {
    id: String,
    name: String,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LayoutUpdate {
    edge: String,
    bar_length: u32,
    bar_thickness: u32,
    position_percent: f64,
    close_delay: u32,
    all_displays: bool,
    selected_display_ids: Vec<String>,
    display_ids: Vec<String>,
    active_label: String,
    expanded: bool,
}

#[derive(Clone, Copy, Default)]
struct IslandRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Serialize)]
struct CursorPosition {
    x: f64,
    y: f64,
    inside: bool,
    dragging: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaInfo {
    title: String,
    artist: String,
    playing: bool,
    source: String,
    track_id: String,
    artwork_data_url: String,
    position_ms: u64,
    duration_ms: u64,
    can_seek: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AudioAppVolume {
    process_id: u32,
    name: String,
    volume: u8,
}

fn default_media_info() -> MediaInfo {
    MediaInfo {
        title: String::new(),
        artist: String::new(),
        playing: false,
        source: String::new(),
        track_id: String::new(),
        artwork_data_url: String::new(),
        position_ms: 0,
        duration_ms: 0,
        can_seek: false,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PocketFileMetadata {
    size_bytes: u64,
}

#[derive(Default)]
struct CursorState {
    rects: Arc<Mutex<HashMap<String, IslandRect>>>,
    hover_rects: Arc<Mutex<HashMap<String, IslandRect>>>,
    ignoring: Arc<Mutex<HashMap<String, bool>>>,
}

const CURSOR_HIT_MARGIN: f64 = 14.0;

#[derive(Clone, Copy)]
enum Edge {
    Left,
    Right,
    Top,
    Bottom,
}

impl Edge {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "left" => Ok(Self::Left),
            "right" => Ok(Self::Right),
            "top" => Ok(Self::Top),
            "bottom" => Ok(Self::Bottom),
            _ => Err(format!("borda desconhecida: {value}")),
        }
    }
}

#[tauri::command]
fn system_volume(value: u8) -> Result<u8, String> {
    let value = value.min(100);
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|error| format!("audio enumerator: {error}"))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|error| format!("default audio device: {error}"))?;
        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|error| format!("audio endpoint: {error}"))?;
        endpoint
            .SetMasterVolumeLevelScalar(value as f32 / 100.0, std::ptr::null())
            .map_err(|error| format!("set volume: {error}"))?;
    }
    Ok(value)
}

#[tauri::command]
fn get_system_volume() -> Result<u8, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|error| format!("audio enumerator: {error}"))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|error| format!("default audio device: {error}"))?;
        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|error| format!("audio endpoint: {error}"))?;
        let scalar = endpoint
            .GetMasterVolumeLevelScalar()
            .map_err(|error| format!("read volume: {error}"))?;
        Ok((scalar * 100.0).round().clamp(0.0, 100.0) as u8)
    }
}

unsafe fn default_audio_session_manager() -> Result<IAudioSessionManager2, String> {
    let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
    let device_enumerator: IMMDeviceEnumerator =
        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|error| format!("audio enumerator: {error}"))?;
    let device = device_enumerator
        .GetDefaultAudioEndpoint(eRender, eConsole)
        .map_err(|error| format!("default audio device: {error}"))?;
    let manager: IAudioSessionManager2 = device
        .Activate(CLSCTX_ALL, None)
        .map_err(|error| format!("audio session manager: {error}"))?;
    Ok(manager)
}

fn audio_process_name(process_id: u32) -> String {
    let process = match unsafe {
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
    } {
        Ok(process) => process,
        Err(_) => return format!("Aplicativo {process_id}"),
    };
    let mut path_buffer = vec![0u16; 32_768];
    let mut path_length = path_buffer.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_FORMAT(0),
            PWSTR(path_buffer.as_mut_ptr()),
            &mut path_length,
        )
    };
    let _ = unsafe { CloseHandle(process) };
    if result.is_err() {
        return format!("Aplicativo {process_id}");
    }
    let path = String::from_utf16_lossy(&path_buffer[..path_length as usize]);
    let executable = Path::new(&path)
        .file_stem()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_else(|| format!("app-{process_id}"));
    match executable.as_str() {
        "spotify" => "Spotify".to_string(),
        "chrome" => "Google Chrome".to_string(),
        "msedge" => "Microsoft Edge".to_string(),
        "firefox" => "Firefox".to_string(),
        "vlc" => "VLC media player".to_string(),
        "discord" => "Discord".to_string(),
        "teams" | "ms-teams" => "Microsoft Teams".to_string(),
        "zoom" => "Zoom".to_string(),
        "spotifywebhelper" => "Spotify".to_string(),
        _ => {
            let mut characters = executable.chars();
            characters
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                .unwrap_or_else(|| format!("Aplicativo {process_id}"))
        }
    }
}

#[tauri::command]
fn get_app_volumes() -> Result<Vec<AudioAppVolume>, String> {
    unsafe {
        let manager = default_audio_session_manager()?;
        let sessions = manager
            .GetSessionEnumerator()
            .map_err(|error| format!("audio session list: {error}"))?;
        let count = sessions
            .GetCount()
            .map_err(|error| format!("audio session count: {error}"))?;
        let mut apps = BTreeMap::<u32, AudioAppVolume>::new();
        for index in 0..count {
            let Ok(control) = sessions.GetSession(index) else { continue };
            let Ok(state) = control.GetState() else { continue };
            if state == AudioSessionStateExpired { continue; }
            let Ok(control2) = control.cast::<IAudioSessionControl2>() else { continue };
            let Ok(process_id) = control2.GetProcessId() else { continue };
            if process_id == 0 || process_id == std::process::id() { continue; }
            let name = audio_process_name(process_id);
            if name.eq_ignore_ascii_case("Msedgewebview2") { continue; }
            let Ok(audio_volume) = control.cast::<ISimpleAudioVolume>() else { continue };
            let Ok(level) = audio_volume.GetMasterVolume() else { continue };
            apps.entry(process_id).or_insert(AudioAppVolume {
                process_id,
                name,
                volume: (level * 100.0).round().clamp(0.0, 100.0) as u8,
            });
        }
        let mut result = apps.into_values().collect::<Vec<_>>();
        result.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        Ok(result)
    }
}

#[tauri::command]
fn set_app_volume(process_id: u32, value: u8) -> Result<u8, String> {
    if process_id == 0 || process_id == std::process::id() {
        return Err("Esse processo não pode ser ajustado pelo mixer.".to_string());
    }
    unsafe {
        let manager = default_audio_session_manager()?;
        let sessions = manager
            .GetSessionEnumerator()
            .map_err(|error| format!("audio session list: {error}"))?;
        let count = sessions
            .GetCount()
            .map_err(|error| format!("audio session count: {error}"))?;
        let mut matched = false;
        for index in 0..count {
            let Ok(control) = sessions.GetSession(index) else { continue };
            let Ok(state) = control.GetState() else { continue };
            if state == AudioSessionStateExpired { continue; }
            let Ok(control2) = control.cast::<IAudioSessionControl2>() else { continue };
            if control2.GetProcessId().ok() != Some(process_id) { continue; }
            let Ok(audio_volume) = control.cast::<ISimpleAudioVolume>() else { continue };
            if audio_volume
                .SetMasterVolume(value.min(100) as f32 / 100.0, std::ptr::null())
                .is_ok()
            {
                matched = true;
            }
        }
        if !matched {
            return Err("O aplicativo não está com uma sessão de áudio ativa.".to_string());
        }
        Ok(value.min(100))
    }
}

#[tauri::command]
fn read_clipboard_text() -> Result<String, String> {
    unsafe { OpenClipboard(None) }.map_err(|error| format!("abrir prancheta: {error}"))?;
    let result = unsafe { GetClipboardData(CF_UNICODETEXT.0 as u32) }
        .map_err(|error| format!("ler prancheta: {error}"))
        .and_then(|handle| {
            let memory = HGLOBAL(handle.0);
            let pointer = unsafe { GlobalLock(memory) } as *const u16;
            if pointer.is_null() {
                return Err("não foi possível acessar o texto copiado".to_string());
            }
            let mut length = 0usize;
            while length < 1_000_000 && unsafe { *pointer.add(length) } != 0 {
                length += 1;
            }
            let text = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(pointer, length) });
            let _ = unsafe { GlobalUnlock(memory) };
            Ok(text)
        });
    let _ = unsafe { CloseClipboard() };
    result
}

#[tauri::command]
fn write_clipboard_text(text: String) -> Result<(), String> {
    if text.len() > 1_000_000 {
        return Err("o texto é grande demais para a prancheta do Ghosty".to_string());
    }
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe { OpenClipboard(None) }.map_err(|error| format!("abrir prancheta: {error}"))?;
    if let Err(error) = unsafe { EmptyClipboard() } {
        let _ = unsafe { CloseClipboard() };
        return Err(format!("limpar prancheta: {error}"));
    }
    let memory = match unsafe { GlobalAlloc(GMEM_MOVEABLE, wide.len() * std::mem::size_of::<u16>()) } {
        Ok(memory) => memory,
        Err(error) => {
            let _ = unsafe { CloseClipboard() };
            return Err(format!("reservar texto da prancheta: {error}"));
        }
    };
    let pointer = unsafe { GlobalLock(memory) } as *mut u16;
    if pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(memory)) };
        let _ = unsafe { CloseClipboard() };
        return Err("não foi possível gravar na prancheta".to_string());
    }
    unsafe { std::ptr::copy_nonoverlapping(wide.as_ptr(), pointer, wide.len()) };
    let _ = unsafe { GlobalUnlock(memory) };
    let result = unsafe { SetClipboardData(CF_UNICODETEXT.0 as u32, Some(HANDLE(memory.0))) }
        .map(|_| ())
        .map_err(|error| {
            let _ = unsafe { GlobalFree(Some(memory)) };
            format!("copiar para a prancheta: {error}")
        });
    let _ = unsafe { CloseClipboard() };
    result
}

#[tauri::command]
fn media_control(action: String) -> Result<(), String> {
    let key = match action.as_str() {
        "play-pause" => VK_MEDIA_PLAY_PAUSE,
        "next" => VK_MEDIA_NEXT_TRACK,
        "previous" => VK_MEDIA_PREV_TRACK,
        _ => return Err(format!("controle de mídia desconhecido: {action}")),
    };
    unsafe {
        keybd_event(key.0 as u8, 0, Default::default(), 0);
        keybd_event(key.0 as u8, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[tauri::command]
fn get_media_info(known_track_id: Option<String>) -> MediaInfo {
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$knownTrackId = $env:EDGE_GHOSTY_KNOWN_TRACK_ID
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Await-WinRT($operation, $resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$managerRequest = $managerType.GetMethod('RequestAsync').Invoke($null, @())
$manager = Await-WinRT $managerRequest $managerType
$session = $manager.GetCurrentSession()
if ($null -eq $session) { [pscustomobject]@{ title = ''; artist = ''; playing = $false; source = ''; trackId = ''; artworkDataUrl = ''; positionMs = 0; durationMs = 0; canSeek = $false } | ConvertTo-Json -Compress; exit }
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$props = Await-WinRT ($session.TryGetMediaPropertiesAsync()) $propsType
$playback = $session.GetPlaybackInfo()
$timeline = $session.GetTimelineProperties()
$source = [string]$session.SourceAppUserModelId
$startTicks = [long]$timeline.StartTime.Ticks
$durationMs = [Math]::Max(0, [long][Math]::Floor(([long]$timeline.EndTime.Ticks - $startTicks) / 10000))
$positionMs = [Math]::Max(0, [long][Math]::Floor(([long]$timeline.Position.Ticks - $startTicks) / 10000))
if ($durationMs -gt 0) { $positionMs = [Math]::Min($positionMs, $durationMs) }
$trackId = $source + '|' + [string]$props.Title + '|' + [string]$props.Artist + '|' + [string]$props.AlbumTitle
$artworkDataUrl = ''
if ($knownTrackId -ne $trackId -and $null -ne $props.Thumbnail) {
  try {
    $artStreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $artStream = Await-WinRT ($props.Thumbnail.OpenReadAsync()) $artStreamType
    $asStreamMethod = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() |
      Where-Object { $_.Name -eq 'AsStream' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IRandomAccessStream' } |
      Select-Object -First 1
    if ($null -eq $asStreamMethod) { throw 'Conversor de stream do Windows indisponível' }
    $managedStream = $asStreamMethod.Invoke($null, @($artStream))
    $memoryStream = [System.IO.MemoryStream]::new()
    $managedStream.CopyTo($memoryStream)
    $mime = [string]$artStream.ContentType
    $artworkBytes = $memoryStream.ToArray()
    if (-not $mime.StartsWith('image/')) {
      $mime = 'image/jpeg'
      if ($artworkBytes.Length -ge 8 -and $artworkBytes[0] -eq 137 -and $artworkBytes[1] -eq 80 -and $artworkBytes[2] -eq 78 -and $artworkBytes[3] -eq 71) { $mime = 'image/png' }
      elseif ($artworkBytes.Length -ge 3 -and $artworkBytes[0] -eq 255 -and $artworkBytes[1] -eq 216) { $mime = 'image/jpeg' }
      elseif ($artworkBytes.Length -ge 6 -and [System.Text.Encoding]::ASCII.GetString($artworkBytes, 0, 4) -eq 'GIF8') { $mime = 'image/gif' }
      elseif ($artworkBytes.Length -ge 12 -and [System.Text.Encoding]::ASCII.GetString($artworkBytes, 0, 4) -eq 'RIFF' -and [System.Text.Encoding]::ASCII.GetString($artworkBytes, 8, 4) -eq 'WEBP') { $mime = 'image/webp' }
    }
    $artworkDataUrl = 'data:' + $mime + ';base64,' + [Convert]::ToBase64String($artworkBytes)
    $managedStream.Dispose()
    $memoryStream.Dispose()
  } catch { $artworkDataUrl = '' }
}
$canSeek = $false
if ($null -ne $playback.Controls) { $canSeek = [bool]$playback.Controls.IsPlaybackPositionEnabled }
[pscustomobject]@{
  title = [string]$props.Title
  artist = [string]$props.Artist
  playing = ([string]$playback.PlaybackStatus -eq 'Playing')
  source = $source
  trackId = $trackId
  artworkDataUrl = $artworkDataUrl
  positionMs = $positionMs
  durationMs = $durationMs
  canSeek = $canSeek
} | ConvertTo-Json -Compress
"#;
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", SCRIPT])
        .env("EDGE_GHOSTY_KNOWN_TRACK_ID", known_track_id.unwrap_or_default())
        .creation_flags(CREATE_NO_WINDOW);
    let output = command.output();
    if let Ok(output) = output {
        if output.status.success() {
            if let Ok(info) = serde_json::from_slice::<MediaInfo>(&output.stdout) {
                return info;
            }
        }
    }
    default_media_info()
}

#[tauri::command]
fn seek_media_position(position_ms: u64) -> Result<(), String> {
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Await-WinRT($operation, $resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$managerRequest = $managerType.GetMethod('RequestAsync').Invoke($null, @())
$manager = Await-WinRT $managerRequest $managerType
$session = $manager.GetCurrentSession()
if ($null -eq $session) { exit 2 }
$timeline = $session.GetTimelineProperties()
$playback = $session.GetPlaybackInfo()
if ($null -eq $playback.Controls -or -not $playback.Controls.IsPlaybackPositionEnabled) { exit 3 }
$durationMs = [Math]::Max(0, [long][Math]::Floor(([long]$timeline.EndTime.Ticks - [long]$timeline.StartTime.Ticks) / 10000))
$requestedMs = [Math]::Max(0, [long]$env:EDGE_GHOSTY_POSITION_MS)
if ($durationMs -gt 0) { $requestedMs = [Math]::Min($requestedMs, $durationMs) }
$requestedTicks = [long]$timeline.StartTime.Ticks + ($requestedMs * 10000)
$success = Await-WinRT ($session.TryChangePlaybackPositionAsync([long]$requestedTicks)) ([System.Boolean])
if (-not $success) { exit 4 }
"#;
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", SCRIPT])
        .env("EDGE_GHOSTY_POSITION_MS", position_ms.to_string())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("iniciar busca da faixa: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err("O player atual não permite buscar nessa faixa.".to_string())
    }
}

#[tauri::command]
fn open_targets(targets: Vec<String>) -> Result<(), String> {
    if targets.is_empty() {
        return Err("adicione pelo menos um aplicativo, arquivo ou endereço".to_string());
    }
    for target in targets.iter().map(|target| target.trim()).filter(|target| !target.is_empty()) {
        let operation: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
        let file: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                None,
                PCWSTR(operation.as_ptr()),
                PCWSTR(file.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if result.0 as isize <= 32 {
            return Err(format!("não foi possível abrir: {target}"));
        }
    }
    Ok(())
}

#[tauri::command]
fn pocket_file_metadata(path: String) -> Result<PocketFileMetadata, String> {
    if path.encode_utf16().count() > 32_767 {
        return Err("O caminho do arquivo excede o limite do Windows.".to_string());
    }
    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("NÃ£o consegui consultar o tamanho do arquivo: {error}"))?;
    if !metadata.is_file() {
        return Err("O item guardado nÃ£o Ã© um arquivo comum.".to_string());
    }
    Ok(PocketFileMetadata { size_bytes: metadata.len() })
}

#[tauri::command]
fn run_shortcut(name: String) -> Result<(), String> {
    let target = match name.as_str() {
        "Terminal" => ("wt.exe", ""),
        "Captura" => ("explorer.exe", "ms-screenclip:"),
        "Foco" => ("explorer.exe", "ms-settings:quiethours"),
        _ => return Err(format!("atalho desconhecido: {name}")),
    };
    let mut command = Command::new(target.0);
    if !target.1.is_empty() {
        command.arg(target.1);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

const AUTOSTART_REGISTRY_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
const AUTOSTART_REGISTRY_VALUE: &str = "Edge Ghosty";

#[tauri::command]
fn is_autostart_enabled() -> Result<bool, String> {
    let output = Command::new("reg.exe")
        .args(["query", AUTOSTART_REGISTRY_KEY, "/v", AUTOSTART_REGISTRY_VALUE])
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("não consegui consultar a inicialização do Windows: {error}"))?;
    Ok(output.status.success())
}

#[tauri::command]
fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    if !enabled {
        if !is_autostart_enabled()? {
            return Ok(());
        }
        let output = Command::new("reg.exe")
            .args(["delete", AUTOSTART_REGISTRY_KEY, "/v", AUTOSTART_REGISTRY_VALUE, "/f"])
            .creation_flags(0x08000000)
            .output()
            .map_err(|error| format!("não consegui remover a inicialização do Windows: {error}"))?;
        if output.status.success() {
            return Ok(());
        }
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() { "o Windows recusou a alteração".to_string() } else { detail });
    }

    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let command_line = format!("\"{}\"", executable.display());
    let output = Command::new("reg.exe")
        .args(["add", AUTOSTART_REGISTRY_KEY, "/v", AUTOSTART_REGISTRY_VALUE, "/t", "REG_SZ", "/d"])
        .arg(command_line)
        .args(["/f"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("não consegui configurar a inicialização do Windows: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if detail.is_empty() { "o Windows recusou a alteração".to_string() } else { detail })
}

fn display_id(monitor: &Monitor) -> String {
    let position = monitor.position();
    format!(
        "{}:{}:{}",
        monitor.name().map(String::as_str).unwrap_or("display"),
        position.x,
        position.y
    )
}

fn is_primary_monitor(monitor: &Monitor, primary: Option<&Monitor>) -> bool {
    primary.is_some_and(|primary| display_id(monitor) == display_id(primary))
}

#[tauri::command]
fn list_displays(window: WebviewWindow) -> Result<Vec<DisplayInfo>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary = window
        .primary_monitor()
        .map_err(|error| error.to_string())?;
    let mut displays: Vec<_> = monitors
        .iter()
        .map(|monitor| {
            let size = monitor.size();
            DisplayInfo {
                id: display_id(monitor),
                name: monitor
                    .name()
                    .cloned()
                    .unwrap_or_else(|| "Monitor".to_string()),
                width: size.width,
                height: size.height,
                is_primary: is_primary_monitor(monitor, primary.as_ref()),
            }
        })
        .collect();
    displays.sort_by_key(|display| !display.is_primary);
    Ok(displays)
}

fn logical_to_physical(value: u32, scale_factor: f64) -> u32 {
    (f64::from(value) * scale_factor).round().max(1.0) as u32
}

#[tauri::command]
fn set_island_rect(
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
    if !x.is_finite() || !y.is_finite() || !width.is_finite() || !height.is_finite()
        || !hover_x.is_finite() || !hover_y.is_finite()
        || !hover_width.is_finite() || !hover_height.is_finite()
    {
        return Err("geometria do notch inválida".to_string());
    }
    let label = window.label().to_string();
    state.rects.lock().unwrap().insert(
        label.clone(),
        IslandRect {
            x,
            y,
            width,
            height,
        },
    );
    state.hover_rects.lock().unwrap().insert(
        label,
        IslandRect {
            x: hover_x,
            y: hover_y,
            width: hover_width,
            height: hover_height,
        },
    );
    Ok(())
}

fn spawn_cursor_poll(
    app: AppHandle,
    rects: Arc<Mutex<HashMap<String, IslandRect>>>,
    hover_rects: Arc<Mutex<HashMap<String, IslandRect>>>,
    ignoring: Arc<Mutex<HashMap<String, bool>>>,
) {
    thread::spawn(move || {
        let mut last_positions: HashMap<String, (f64, f64, bool, bool)> = HashMap::new();
        let mut last_cursor_events: HashMap<String, Instant> = HashMap::new();
        loop {
            let mut cursor = POINT::default();
            if unsafe { GetCursorPos(&mut cursor) }.is_err() {
                thread::sleep(Duration::from_millis(16));
                continue;
            }

            for (label, window) in app.webview_windows() {
                if label != "main" && !label.starts_with("display-") {
                    continue;
                }
                if window.is_visible().ok() != Some(true) {
                    last_positions.remove(&label);
                    last_cursor_events.remove(&label);
                    continue;
                }
                let rect = rects.lock().unwrap().get(&label).copied();
                let hover_rect = hover_rects.lock().unwrap().get(&label).copied();
                let Some(rect) = rect else {
                    if ignoring.lock().unwrap().get(&label).copied() != Some(true)
                        && window.set_ignore_cursor_events(true).is_ok()
                    {
                        let _ = window.set_always_on_top(true);
                        ignoring.lock().unwrap().insert(label.clone(), true);
                    }
                    last_positions.remove(&label);
                    last_cursor_events.remove(&label);
                    continue;
                };
                let Ok(origin) = window.outer_position() else {
                    continue;
                };
                let scale = window.scale_factor().unwrap_or(1.0);
                let x = (cursor.x - origin.x) as f64 / scale;
                let y = (cursor.y - origin.y) as f64 / scale;
                let dragging = unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } < 0;
                let inside_body = x >= rect.x
                    && x <= rect.x + rect.width
                    && y >= rect.y
                    && y <= rect.y + rect.height;
                let inside_collapsed_hover = !dragging && hover_rect.is_some_and(|hover| {
                    x >= hover.x - CURSOR_HIT_MARGIN
                        && x <= hover.x + hover.width + CURSOR_HIT_MARGIN
                        && y >= hover.y - CURSOR_HIT_MARGIN
                        && y <= hover.y + hover.height + CURSOR_HIT_MARGIN
                });
                let inside = inside_body || inside_collapsed_hover;
                let position = CursorPosition { x, y, inside, dragging };
                // The hover margin can open the menu but remains click-through.
                let ignore = !inside_body;
                if ignoring.lock().unwrap().get(&label).copied() != Some(ignore)
                    && window.set_ignore_cursor_events(ignore).is_ok()
                {
                    let _ = window.set_always_on_top(true);
                    ignoring.lock().unwrap().insert(label.clone(), ignore);
                }

                let moved = last_positions.get(&label).map_or(true, |last| {
                    (position.x - last.0).abs() >= 1.0
                        || (position.y - last.1).abs() >= 1.0
                        || inside != last.2
                        || dragging != last.3
                });
                last_positions.insert(label.clone(), (position.x, position.y, inside, dragging));
                let retry_hover_event = inside
                    && last_cursor_events
                        .get(&label)
                        .map_or(true, |last| last.elapsed() >= Duration::from_millis(100));
                if moved || retry_hover_event {
                    let _ = app.emit_to(label.as_str(), "edge-ghosty-cursor", position);
                    last_cursor_events.insert(label.clone(), Instant::now());
                }
            }
            thread::sleep(Duration::from_millis(16));
        }
    });
}

fn window_geometry(edge: Edge, monitor: &Monitor, position_percent: f64) -> (PhysicalSize<u32>, PhysicalPosition<i32>) {
    let scale = monitor.scale_factor();
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let logical_size = match edge {
        Edge::Left | Edge::Right => (
            900.min((f64::from(monitor_size.width) / scale) as u32),
            720.min((f64::from(monitor_size.height) / scale) as u32),
        ),
        Edge::Top | Edge::Bottom => (
            1100.min((f64::from(monitor_size.width) / scale) as u32),
            420.min((f64::from(monitor_size.height) / scale) as u32),
        ),
    };
    let size = PhysicalSize::new(
        logical_to_physical(logical_size.0, scale),
        logical_to_physical(logical_size.1, scale),
    );
    let remaining_x = monitor_size.width.saturating_sub(size.width);
    let remaining_y = monitor_size.height.saturating_sub(size.height);
    let position = position_percent.clamp(0.0, 100.0) / 100.0;
    let along = |remaining: u32| (f64::from(remaining) * position).round() as u32;
    let x = match edge {
        Edge::Left => monitor_position.x,
        Edge::Right => monitor_position.x + remaining_x as i32,
        Edge::Top | Edge::Bottom => monitor_position.x + along(remaining_x) as i32,
    };
    let y = match edge {
        Edge::Left | Edge::Right => monitor_position.y + along(remaining_y) as i32,
        Edge::Top => monitor_position.y,
        Edge::Bottom => monitor_position.y + remaining_y as i32,
    };
    (size, PhysicalPosition::new(x, y))
}

fn collapsed_island_rect(
    edge: Edge,
    bar_length: u32,
    bar_thickness: u32,
    position_percent: f64,
    monitor: &Monitor,
) -> IslandRect {
    let scale = monitor.scale_factor();
    let (host_size, _) = window_geometry(edge, monitor, position_percent);
    let host_width = f64::from(host_size.width) / scale;
    let host_height = f64::from(host_size.height) / scale;
    let length = f64::from(bar_length);
    let thickness = f64::from(bar_thickness);
    let position = position_percent.clamp(0.0, 100.0) / 100.0;

    match edge {
        Edge::Left => IslandRect {
            x: 0.0,
            y: (host_height - length).max(0.0) * position,
            width: thickness,
            height: length,
        },
        Edge::Right => IslandRect {
            x: host_width - thickness,
            y: (host_height - length).max(0.0) * position,
            width: thickness,
            height: length,
        },
        Edge::Top => IslandRect {
            x: (host_width - length).max(0.0) * position,
            y: 0.0,
            width: length,
            height: thickness,
        },
        Edge::Bottom => IslandRect {
            x: (host_width - length).max(0.0) * position,
            y: host_height - thickness,
            width: length,
            height: thickness,
        },
    }
}

fn place_window(window: &WebviewWindow, edge: Edge, monitor: &Monitor, position_percent: f64) -> Result<(), String> {
    let (size, location) = window_geometry(edge, monitor, position_percent);
    let handle = window.hwnd().map_err(|error| error.to_string())?;
    unsafe {
        SetWindowPos(
            handle,
            Some(HWND_TOPMOST),
            location.x,
            location.y,
            size.width as i32,
            size.height as i32,
            SWP_NOACTIVATE,
        )
        .map_err(|error| error.to_string())?;
    }
    window
        .set_always_on_top(true)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn show_utility_popup(
    app: AppHandle,
    window: WebviewWindow,
    position_x: Option<i32>,
    position_y: Option<i32>,
    dashboard: Option<bool>,
) -> Result<(), String> {
    place_utility_popup(&app, &window, position_x.zip(position_y), false, dashboard.unwrap_or(false))
}

#[tauri::command]
fn show_quick_chat(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    place_utility_popup(&app, &window, None, true, false)
}

#[tauri::command]
fn show_settings_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("settings-window")
        .ok_or_else(|| "janela de configurações não encontrada".to_string())?;
    window.center().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn open_onboarding(app: AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "janela principal não encontrada".to_string())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())?;
    app.emit_to("main", "edge-ghosty-open-onboarding", ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn replay_onboarding_greeting(app: AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "janela principal não encontrada".to_string())?;
    main.show().map_err(|error| error.to_string())?;
    main.set_focus().map_err(|error| error.to_string())?;
    app.emit_to("main", "edge-ghosty-replay-onboarding-greeting", ())
        .map_err(|error| error.to_string())
}

fn place_utility_popup(
    app: &AppHandle,
    window: &WebviewWindow,
    saved_position: Option<(i32, i32)>,
    quick_chat: bool,
    dashboard: bool,
) -> Result<(), String> {
    let fallback_monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "nenhum monitor disponÃ­vel para o popup".to_string())?;
    let saved_position = if quick_chat { None } else { saved_position };
    let monitor = saved_position
        .and_then(|(x, y)| {
            app.available_monitors().ok()?.into_iter().find(|monitor| {
                let origin = monitor.position();
                let size = monitor.size();
                x >= origin.x
                    && y >= origin.y
                    && x < origin.x.saturating_add(size.width as i32)
                    && y < origin.y.saturating_add(size.height as i32)
            })
        })
        .unwrap_or(fallback_monitor);
    let popup = app
        .get_webview_window("utility-popup")
        .ok_or_else(|| "janela do popup nÃ£o encontrada".to_string())?;

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();
    let logical_width = if quick_chat {
        (f64::from(monitor_size.width) / scale - 32.0).clamp(320.0, 560.0)
    } else if dashboard {
        (f64::from(monitor_size.width) / scale - 48.0).clamp(420.0, 760.0)
    } else {
        (f64::from(monitor_size.width) / scale - 32.0).clamp(240.0, 400.0)
    };
    let logical_height = if quick_chat {
        (f64::from(monitor_size.height) / scale - 104.0).clamp(260.0, 472.0)
    } else if dashboard {
        (f64::from(monitor_size.height) / scale - 40.0).clamp(480.0, 760.0)
    } else {
        (f64::from(monitor_size.height) / scale - 32.0).clamp(300.0, 500.0)
    };
    let size = PhysicalSize::new(
        logical_to_physical(logical_width.round() as u32, scale),
        logical_to_physical(logical_height.round() as u32, scale),
    );
    let max_x = monitor_position
        .x
        .saturating_add(monitor_size.width as i32)
        .saturating_sub(size.width as i32)
        .max(monitor_position.x);
    let max_y = monitor_position
        .y
        .saturating_add(monitor_size.height as i32)
        .saturating_sub(size.height as i32)
        .max(monitor_position.y);
    let centered_x = monitor_position.x + monitor_size.width.saturating_sub(size.width) as i32 / 2;
    let centered_y = monitor_position.y + monitor_size.height.saturating_sub(size.height) as i32 / 2;
    let chat_bottom_gap = logical_to_physical(72, scale) as i32;
    let chat_y = monitor_position.y
        .saturating_add(monitor_size.height as i32)
        .saturating_sub(size.height as i32)
        .saturating_sub(chat_bottom_gap);
    let (desired_x, desired_y) = saved_position.unwrap_or((centered_x, if quick_chat { chat_y } else { centered_y }));
    let position = PhysicalPosition::new(
        desired_x.clamp(monitor_position.x, max_x),
        desired_y.clamp(monitor_position.y, max_y),
    );

    popup
        .set_size(size)
        .map_err(|error| error.to_string())?;
    popup
        .set_position(position)
        .map_err(|error| error.to_string())?;
    popup
        .set_always_on_top(true)
        .map_err(|error| error.to_string())?;
    popup.show().map_err(|error| error.to_string())?;
    popup
        .set_skip_taskbar(true)
        .map_err(|error| error.to_string())?;
    popup.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
async fn apply_display_layout(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, CursorState>,
    edge: String,
    bar_length: u32,
    bar_thickness: u32,
    display_ids: Vec<String>,
    selected_display_ids: Vec<String>,
    all_displays: bool,
    close_delay: u32,
    position_percent: f64,
    expanded: bool,
) -> Result<(), String> {
    let edge = Edge::parse(&edge)?;
    let _legacy_all_displays = all_displays;
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let primary = app.primary_monitor().map_err(|error| error.to_string())?;
    let mut selected: Vec<_> = monitors
        .iter()
        .filter(|monitor| {
            display_ids.contains(&display_id(monitor))
                || (display_ids.is_empty() && selected_display_ids.contains(&display_id(monitor)))
        })
        .collect();
    selected.sort_by_key(|monitor| !is_primary_monitor(monitor, primary.as_ref()));
    if selected.is_empty() {
        selected = monitors
            .iter()
            .filter(|monitor| is_primary_monitor(monitor, primary.as_ref()))
            .collect();
    }
    if selected.is_empty() {
        return Err("nenhum monitor disponível".to_string());
    }

    selected.truncate(1);
    let selected_display_ids = vec![display_id(selected[0])];
    let display_ids = selected_display_ids.clone();

    let mut windows: Vec<_> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label == "main" || label.starts_with("display-"))
        .collect();
    windows.sort_by_key(|(label, _)| {
        if label == "main" {
            0
        } else {
            label
                .strip_prefix("display-")
                .and_then(|number| number.parse::<usize>().ok())
                .unwrap_or(usize::MAX)
        }
    });

    let active_label = window.label().to_string();
    for (index, (_, target_window)) in windows.iter().enumerate() {
        if let Some(monitor) = selected.get(index) {
            place_window(target_window, edge, monitor, position_percent)?;
            target_window.show().map_err(|error| error.to_string())?;
            target_window
                .set_skip_taskbar(true)
                .map_err(|error| error.to_string())?;
            target_window
                .set_always_on_top(true)
                .map_err(|error| error.to_string())?;
            let label = target_window.label().to_string();
            let collapsed = collapsed_island_rect(edge, bar_length, bar_thickness, position_percent, monitor);
            state.rects.lock().unwrap().insert(label.clone(), collapsed);
            state.hover_rects.lock().unwrap().insert(label, collapsed);
        } else {
            target_window.hide().map_err(|error| error.to_string())?;
            state.rects.lock().unwrap().remove(target_window.label());
            state.hover_rects.lock().unwrap().remove(target_window.label());
        }
    }
    app.emit(
        "edge-ghosty-layout-updated",
        LayoutUpdate {
            edge: match edge {
                Edge::Left => "left",
                Edge::Right => "right",
                Edge::Top => "top",
                Edge::Bottom => "bottom",
            }
            .to_string(),
            bar_length,
            bar_thickness,
            position_percent: position_percent.clamp(0.0, 100.0),
            close_delay,
            all_displays: false,
            selected_display_ids,
            display_ids,
            active_label,
            expanded,
        },
    )
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(CursorState::default())
        .manage(codex_chat::CodexChatState::default())
        .manage(github::GithubCache::default())
        .manage(vercel::VercelCache::default())
        .manage(google_workspace::GoogleWorkspaceState::default())
        .manage(tray::AppPauseState::default())
        .setup(|app| {
            tray::install(app.handle()).map_err(std::io::Error::other)?;
            quick_chat_hotkey::start(app.handle().clone());
            let cursor_state = app.state::<CursorState>();
            spawn_cursor_poll(
                app.handle().clone(),
                cursor_state.rects.clone(),
                cursor_state.hover_rects.clone(),
                cursor_state.ignoring.clone(),
            );
            if let Some(window) = app.get_webview_window("main") {
                if let Some(monitor) = window.primary_monitor()? {
                    window.set_ignore_cursor_events(true)?;
                    window.set_always_on_top(true)?;
                    place_window(&window, Edge::Top, &monitor, 50.0).map_err(std::io::Error::other)?;
                }
                window.set_skip_taskbar(true)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            system_volume,
            get_system_volume,
            get_app_volumes,
            set_app_volume,
            read_clipboard_text,
            write_clipboard_text,
            media_control,
            get_media_info,
            seek_media_position,
            open_targets,
            pocket_file_metadata,
            run_shortcut,
            is_autostart_enabled,
            set_autostart_enabled,
            tray::is_updates_paused,
            github::github_token_status,
            github::github_save_token,
            github::github_clear_token,
            github::github_cached_snapshot,
            github::github_refresh,
            vercel::vercel_token_status,
            vercel::vercel_save_token,
            vercel::vercel_clear_token,
            vercel::vercel_cached_snapshot,
            vercel::vercel_refresh,
            weather::weather_search_locations,
            weather::weather_get_forecast,
            google_workspace::google_auth_begin,
            google_workspace::google_auth_poll,
            google_workspace::google_auth_cancel,
            google_workspace::google_account_status,
            google_workspace::google_cached_snapshot,
            google_workspace::google_refresh,
            google_workspace::google_mark_message,
            google_workspace::google_complete_task,
            google_workspace::google_add_task,
            google_workspace::google_clear_account,
            list_displays,
            set_island_rect,
            apply_display_layout,
            show_utility_popup,
            show_quick_chat,
            show_settings_window,
            open_onboarding,
            replay_onboarding_greeting,
            codex_chat::quick_chat_start,
            codex_chat::quick_chat_status,
            codex_chat::quick_chat_login,
            codex_chat::quick_chat_send,
            codex_chat::quick_chat_resolve_website,
            codex_chat::quick_chat_cancel,
            codex_chat::quick_chat_respond,
            codex_chat::quick_chat_close,
            codex_hooks::codex_hooks_enabled,
            codex_hooks::codex_hooks_review_state,
            codex_hooks::codex_hooks_preview,
            codex_hooks::apply_codex_hooks_change,
            codex_hooks::drain_codex_events,
            codex_hooks::resolve_codex_approval
        ])
        .run(tauri::generate_context!())
        .expect("error while running Edge Ghosty");
}
