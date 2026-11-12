/** Stroke icons used across the UI. Prefer these over Unicode glyphs. */

export type MenuIconName = "brand" | "home" | "pet" | "panels" | "shortcuts" | "settings" | "close" | "pocket" | "clipboard" | "search" | "chevron" | "back" | "refresh" | "volume" | "previous" | "play" | "pause" | "next" | "plus" | "file" | "image" | "text" | "now" | "codex" | "github" | "vercel" | "music" | "mail" | "calendar" | "check" | "bell" | "cloud" | "focus";

export function menuIcon(name: MenuIconName) {
  const paths: Record<MenuIconName, string> = {
    brand: '<path d="M12 2.7 13.7 9l6.3 3-6.3 3-1.7 6.3L10.3 15 4 12l6.3-3L12 2.7Z"/><path d="M19 3v4M17 5h4M4 17v4M2 19h4"/>',
    home: '<path d="m3.5 10 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-9Z"/><path d="M9 20v-6h6v6"/>',
    pet: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/>',
    panels: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>',
    shortcuts: '<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    pocket: '<path d="M3 7.5h7l2 2h9v8.7a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 18.2V7.5Z"/><path d="M3 10h18"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 9h6M9 13h6M9 17h3"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6.8L20 12M4 12l2 5.2A7 7 0 0 0 18.4 15"/>',
    volume: '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a5 5 0 0 1 0 6M19 6a9 9 0 0 1 0 12"/>',
    previous: '<path d="M6 5v14M19 6l-9 6 9 6V6Z"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    next: '<path d="M18 5v14M5 6l9 6-9 6V6Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    file: '<path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h8M8 17h8"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5L5 20"/>',
    text: '<path d="M5 5h14M5 10h14M5 15h9M5 20h12"/>',
    now: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    codex: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    vercel: '<path d="M12 4 21 19.5H3L12 4Z"/>',
    music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.2 3.2 0 0 0 7 18.5Z"/>',
    focus: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 1.6M10 2.8h4"/>',
  };
  return `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
