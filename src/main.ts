import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check as checkAppUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Tracked } from "./anim";
import { PetMotionEngine, type PetState } from "./pet-motion";
import { LaunchGreeting } from "./launch-greeting";
import { playGhostySound, setGhostySoundEnabled, setGhostySoundVolume } from "./sounds";

type Shortcut = { id: string; name: string; glyph: string; targets: string[]; action?: "focus"; custom?: boolean };
type PocketItem = { id: string; name: string; kind: "file" | "image" | "text"; value: string; addedAt: number; truncated?: boolean };
type ClipboardEntry = { id: string; text: string; addedAt: number; pinned?: boolean };
type PetSkin = "pearl" | "smoke" | "midnight" | "mint" | "coral" | "lavender";
type PetAccessory = "none" | "star" | "bow" | "halo" | "leaf" | "crown";
type FocusState = { durationMs: number; remainingMs: number; endsAt: number; running: boolean; startedAt: number };
type FocusHistoryEntry = { id: string; startedAt: number; endedAt: number; durationMs: number; completed: boolean };
type MediaInfo = {
  title: string;
  artist: string;
  playing: boolean;
  source: string;
  trackId: string;
  artworkDataUrl: string;
  positionMs: number;
  durationMs: number;
  canSeek: boolean;
};
type AudioAppVolume = { processId: number; name: string; volume: number };
type Edge = "left" | "right" | "top" | "bottom";
type MenuTab = "home" | "pet" | "panels";
type SettingsTab = "general" | "shortcuts" | "panels";
type InteractionMode = "hover" | "click";
type HomeView = "now" | "activity" | "github" | "vercel" | "media";
type UtilityPopupMode = "focus" | "focus-summary" | "codex-activity" | "pocket" | "customize" | "clipboard" | "dashboard" | "chat";
type DashboardView = "overview" | "email" | "calendar" | "tasks" | "notifications" | "weather";
type WeatherLocation = {
  id: number | null;
  name: string;
  admin1: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
};
type WeatherDay = { date: string; weatherCode: number; minC: number; maxC: number; precipitationProbability: number | null };
type WeatherSnapshot = {
  location: WeatherLocation;
  current: { temperatureC: number; feelsLikeC: number; relativeHumidity: number; weatherCode: number; windSpeedKmh: number; precipitationMm: number; isDay: boolean };
  days: WeatherDay[];
  checkedAt: number;
};
type GoogleEmailMessage = { id: string; threadId: string; subject: string; sender: string; receivedAt: number; webUrl: string };
type GoogleCalendarEvent = { id: string; title: string; startsAt: string; endsAt: string | null; allDay: boolean; location: string | null; webUrl: string | null; joinUrl: string | null };
type GoogleTask = { id: string; listId: string; listTitle: string; title: string; dueAt: string | null };
type GoogleSnapshot = { email: string; checkedAt: number; unreadCount: number; messages: GoogleEmailMessage[]; events: GoogleCalendarEvent[]; tasks: GoogleTask[] };
type GoogleAccountStatus = { connected: boolean; email: string | null; configured: boolean };
type GoogleAuthProgress = { status: "idle" | "waiting" | "connected" | "error"; email: string | null; message: string | null };
type DashboardNotification = {
  id: string;
  kind: "email" | "calendar" | "task" | "weather" | "system";
  title: string;
  body: string;
  occurredAt: number;
  read: boolean;
  target?: string;
};
type PetReactionSignal = { id: string; state: PetState; detail: string; until: number };
type UtilityPopupPosition = { x: number; y: number };
type QuickChatMessage = { id: string; role: "user" | "assistant"; text: string; pending?: boolean };
type QuickChatApproval = { requestId: number | string; method: string; params: Record<string, unknown>; preview?: string };
type QuickChatReasoning = { reasoningEffort: string; description?: string };
type QuickChatModel = { id: string; displayName: string; supportedReasoningEfforts: QuickChatReasoning[]; defaultReasoningEffort?: string };
type QuickChatCatalog = { authenticated: boolean; models: QuickChatModel[] };
type QuickChatEvent = { method: string; params?: Record<string, unknown>; requestId?: number | string };
type QuickChatWebsiteRequest = { siteName: string; url: string | null; continuation?: string };
type DisplayInfo = {
  id: string;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
};
type CursorPosition = { x: number; y: number; inside: boolean; dragging: boolean };
type LayoutUpdate = {
  edge: Edge;
  barLength: number;
  barThickness: number;
  positionPercent: number;
  closeDelay: number;
  allDisplays: boolean;
  selectedDisplayIds: string[];
  displayIds: string[];
  activeLabel: string;
  expanded: boolean;
};
type CodexHookEvent = {
  eventName: string;
  occurredAt: number;
  toolName: string | null;
  agentType: string | null;
  approvalId: string | null;
  approvalDescription: string | null;
  approvalExpiresAt: number | null;
  sessionId?: string | null;
};
type CodexApproval = { requestId: string; toolName: string; description: string; expiresAt: number };
type CodexApprovalDecision = "allow" | "deny";
type CodexActivityDay = { sessions: number; completed: number; interrupted: number; toolCalls: number; approvals: number; activeMs: number };
type CodexActivity = Record<string, CodexActivityDay>;
type CodexRecentActivity = { eventName: string; occurredAt: number; toolName: string | null; agentType: string | null };
type GithubPullRequest = { title: string; repository: string; number: number; url: string; draft: boolean; ciStatus: string | null };
type GithubSnapshot = { login: string; checkedAt: number; authored: GithubPullRequest[]; reviewRequested: GithubPullRequest[] };
type VercelDeployment = { id: string; name: string; url: string; state: string; target: string | null; branch: string | null; commitMessage: string | null; createdAt: number };
type VercelSnapshot = { username: string; checkedAt: number; deployments: VercelDeployment[] };
type CodexHookPreview = { enabled: boolean; configPath: string; fingerprint: string; configChanged: boolean; backupWillBeCreated: boolean; changes: Array<{ eventName: string; before: unknown[]; after: unknown[] }> };

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "terminal", name: "Terminal", glyph: "⌘", targets: ["wt.exe"] },
  { id: "capture", name: "Captura", glyph: "⌁", targets: ["ms-screenclip:"] },
  { id: "focus", name: "Foco", glyph: "◉", targets: [], action: "focus" },
  { id: "files", name: "Arquivos", glyph: "▣", targets: ["explorer.exe"] },
];
const LAUNCHER_DEFAULTS: Shortcut[] = [
  { id: "launcher-explorer", name: "Explorador", glyph: "▣", targets: ["explorer.exe"] },
  { id: "launcher-notepad", name: "Bloco de notas", glyph: "▤", targets: ["notepad.exe"] },
  { id: "launcher-settings", name: "Configurações", glyph: "⚙", targets: ["ms-settings:"] },
  { id: "launcher-browser", name: "Pesquisar na web", glyph: "⌕", targets: ["https://www.google.com"] },
];

const KEYS = {
  length: "edge-ghosty.bar-height",
  thickness: "edge-ghosty.bar-width",
  barPosition: "edge-ghosty.bar-position",
  interactionMode: "edge-ghosty.interaction-mode",
  settingsTab: "edge-ghosty.settings-tab",
  edge: "edge-ghosty.edge",
  closeDelay: "edge-ghosty.close-delay",
  displays: "edge-ghosty.display-ids",
  allDisplays: "edge-ghosty.all-displays",
  shortcuts: "edge-ghosty.shortcuts",
  pocket: "edge-ghosty.pocket",
  clipboard: "edge-ghosty.clipboard",
  petName: "edge-ghosty.pet-name",
  petSkin: "edge-ghosty.pet-skin",
  petAccessory: "edge-ghosty.pet-accessory",
  focus: "edge-ghosty.focus",
  focusHistory: "edge-ghosty.focus-history",
  onboardingComplete: "edge-ghosty.onboarding-complete",
  utilityPopup: "edge-ghosty.utility-popup",
  utilityPopupPosition: "edge-ghosty.utility-popup-position",
  quickChatModel: "edge-ghosty.quick-chat-model",
  quickChatReasoning: "edge-ghosty.quick-chat-effort",
  quickChatEntry: "edge-ghosty.quick-chat-entry",
  quickChatWebsiteCache: "edge-ghosty.quick-chat-website-cache.v1",
  quickChatDraft: "edge-ghosty.quick-chat-draft",
  codexActivity: "edge-ghosty.codex-activity.v1",
  vercelTeamId: "edge-ghosty.vercel-team-id",
  soundsEnabled: "edge-ghosty.sounds-enabled",
  soundVolume: "edge-ghosty.sound-volume",
  weatherLocation: "edge-ghosty.weather-location",
  weatherSnapshot: "edge-ghosty.weather-snapshot.v1",
  dashboardView: "edge-ghosty.dashboard-view",
  dashboardNotifications: "edge-ghosty.dashboard-notifications.v1",
  openPanelsRequest: "edge-ghosty.open-panels-request",
};
const LEGACY_KEYS = {
  length: "edge-mochi.bar-height",
  thickness: "edge-mochi.bar-width",
  barPosition: "edge-mochi.bar-position",
  interactionMode: "edge-mochi.interaction-mode",
  settingsTab: "edge-mochi.settings-tab",
  edge: "edge-mochi.edge",
  closeDelay: "edge-mochi.close-delay",
  displays: "edge-mochi.display-ids",
  allDisplays: "edge-mochi.all-displays",
  shortcuts: "edge-mochi.shortcuts",
  pocket: "edge-mochi.pocket",
  clipboard: "edge-mochi.clipboard",
  petName: "edge-mochi.pet-name",
  petSkin: "edge-mochi.pet-skin",
  petAccessory: "edge-mochi.pet-accessory",
  focus: "edge-mochi.focus",
  focusHistory: "edge-mochi.focus-history",
  onboardingComplete: "edge-mochi.onboarding-complete",
  utilityPopup: "edge-mochi.utility-popup",
  utilityPopupPosition: "edge-mochi.utility-popup-position",
  quickChatModel: "edge-mochi.quick-chat-model",
  quickChatReasoning: "edge-mochi.quick-chat-effort",
  quickChatEntry: "edge-mochi.quick-chat-entry",
  quickChatWebsiteCache: "edge-mochi.quick-chat-website-cache.v1",
  quickChatDraft: "edge-mochi.quick-chat-draft",
  codexActivity: "edge-mochi.codex-activity.v1",
  vercelTeamId: "edge-mochi.vercel-team-id",
  soundsEnabled: "edge-mochi.sounds-enabled",
  soundVolume: "edge-mochi.sound-volume",
  weatherLocation: "edge-mochi.weather-location",
  weatherSnapshot: "edge-mochi.weather-snapshot.v1",
  dashboardView: "edge-mochi.dashboard-view",
  dashboardNotifications: "edge-mochi.dashboard-notifications.v1",
  openPanelsRequest: "edge-mochi.open-panels-request",
};
for (const name of Object.keys(KEYS) as Array<keyof typeof KEYS>) {
  const legacyValue = localStorage.getItem(LEGACY_KEYS[name]);
  if (localStorage.getItem(KEYS[name]) === null && legacyValue !== null) {
    localStorage.setItem(KEYS[name], name === "petName" && legacyValue === "Mochi" ? "Ghosty" : legacyValue);
  }
}
localStorage.removeItem("edge-ghosty.google-client-id");
localStorage.removeItem("edge-mochi.google-client-id");
if (localStorage.getItem(KEYS.petName) === "Mochi") localStorage.setItem(KEYS.petName, "Ghosty");
if (!["focus", "focus-summary", "codex-activity", "pocket", "customize", "clipboard", "dashboard", "chat"].includes(localStorage.getItem(KEYS.utilityPopup) ?? "")) {
  localStorage.removeItem(KEYS.utilityPopup);
}
if (localStorage.getItem(KEYS.onboardingComplete) === null
  && [KEYS.shortcuts, KEYS.focus, KEYS.displays, KEYS.petName].some((key) => localStorage.getItem(key) !== null)) {
  localStorage.setItem(KEYS.onboardingComplete, "true");
}
const currentWindowLabel = getCurrentWindow().label;
let onboardingOpen = currentWindowLabel === "main" && localStorage.getItem(KEYS.onboardingComplete) !== "true";
let onboardingStep: "welcome" | "choices" = "welcome";
let onboardingIntroStarted = false;
let onboardingLaunchGreetingActive = onboardingOpen;
let onboardingLaunchDocking = false;
let onboardingWelcomeOptionsRevealing = false;
let launchGreetingStartedAt: number | null = null;
let launchGreetingRenderer: LaunchGreeting | null = null;
let onboardingLaunchDockTimer: number | undefined;
let onboardingWelcomeRevealTimer: number | undefined;
let onboardingLaunchDockOffset: { x: number; y: number; scale: number } | null = null;
let launchGreetingReplayRestore: { edge: Edge; barPosition: number; onboardingIntroStarted: boolean } | null = null;
const QUICK_CHAT_SITE_CACHE_LIMIT = 256;
const QUICK_CHAT_SITE_ALIASES: Readonly<Record<string, string>> = {
  github: "https://github.com",
  "github com": "https://github.com",
  youtube: "https://www.youtube.com",
  "you tube": "https://www.youtube.com",
  google: "https://www.google.com",
  reddit: "https://www.reddit.com",
  wikipedia: "https://www.wikipedia.org",
  x: "https://x.com",
  twitter: "https://x.com",
  instagram: "https://www.instagram.com",
  linkedin: "https://www.linkedin.com",
  discord: "https://discord.com/app",
  twitch: "https://www.twitch.tv",
  spotify: "https://open.spotify.com",
  chatgpt: "https://chatgpt.com",
  gmail: "https://mail.google.com",
  notion: "https://www.notion.so",
  stackoverflow: "https://stackoverflow.com",
};

function normalizeQuickChatSiteName(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function safeQuickChatWebsiteUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readQuickChatWebsiteCache() {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEYS.quickChatWebsiteCache) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return new Map<string, string>();
    const entries = Object.entries(stored as Record<string, unknown>)
      .map(([name, url]) => [normalizeQuickChatSiteName(name), safeQuickChatWebsiteUrl(url)] as const)
      .filter((entry): entry is readonly [string, string] => !!entry[0] && !!entry[1])
      .slice(-QUICK_CHAT_SITE_CACHE_LIMIT);
    return new Map(entries);
  } catch {
    return new Map<string, string>();
  }
}

let quickChatWebsiteCache = readQuickChatWebsiteCache();

function saveQuickChatWebsiteResolution(siteName: string, websiteUrl: string) {
  const key = normalizeQuickChatSiteName(siteName);
  const url = safeQuickChatWebsiteUrl(websiteUrl);
  if (!key || !url) return;
  const next = new Map(quickChatWebsiteCache);
  next.delete(key);
  next.set(key, url);
  while (next.size > QUICK_CHAT_SITE_CACHE_LIMIT) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  quickChatWebsiteCache = next;
  try {
    localStorage.setItem(KEYS.quickChatWebsiteCache, JSON.stringify(Object.fromEntries(next)));
  } catch (error) {
    console.warn("Não consegui persistir o cache de sites; os próximos acessos desta sessão continuam rápidos.", error);
  }
}

const DEFAULTS = {
  length: 80,
  thickness: 10,
  barPosition: 50,
  edge: "top" as Edge,
  closeDelay: 200,
  interactionMode: "hover" as InteractionMode,
};
const MIN_LENGTH = 48;
const MAX_LENGTH = 240;
const LENGTH_STEP = 2;
const MIN_THICKNESS = 6;
const MAX_THICKNESS = 28;
const MIN_CLOSE_DELAY = 0;
const MAX_CLOSE_DELAY = 900;
const MEDIA_CAPSULE_LENGTH = 96;
const MEDIA_CAPSULE_THICKNESS = 20;
const MAX_SAVED_TEXT = 50_000;
const MAX_CHAT_TEXT_CONTEXT_CHARS = 6_000;
const LARGE_CHAT_FILE_WARNING_BYTES = 25 * 1024 * 1024;

function readNumber(key: string, fallback: number, min: number, max: number, step = 1) {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed / step) * step));
}

function readEdge(): Edge {
  const stored = localStorage.getItem(KEYS.edge);
  return stored === "left" || stored === "right" || stored === "bottom" ? stored : "top";
}

function isVerticalEdge(value: Edge = edge) {
  return value === "left" || value === "right";
}

function readDisplayIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEYS.displays) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function readWeatherLocation(): WeatherLocation | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEYS.weatherLocation) ?? "null");
    if (!value || typeof value !== "object") return null;
    const location = value as Partial<WeatherLocation>;
    if (typeof location.name !== "string" || !location.name.trim() || location.name.length > 100
      || typeof location.latitude !== "number" || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
      || typeof location.longitude !== "number" || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) return null;
    return {
      id: typeof location.id === "number" && Number.isSafeInteger(location.id) ? location.id : null,
      name: location.name.trim(),
      admin1: typeof location.admin1 === "string" ? location.admin1.slice(0, 100) : null,
      country: typeof location.country === "string" ? location.country.slice(0, 100) : null,
      countryCode: typeof location.countryCode === "string" ? location.countryCode.slice(0, 2) : null,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: typeof location.timezone === "string" ? location.timezone.slice(0, 80) : null,
    };
  } catch {
    return null;
  }
}

function readWeatherSnapshot(): WeatherSnapshot | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEYS.weatherSnapshot) ?? "null");
    if (!value || typeof value !== "object") return null;
    const snapshot = value as Partial<WeatherSnapshot>;
    const current = snapshot.current;
    if (!snapshot.location || !current || !Array.isArray(snapshot.days)
      || typeof snapshot.checkedAt !== "number" || !Number.isFinite(snapshot.checkedAt)
      || typeof current.temperatureC !== "number" || !Number.isFinite(current.temperatureC)
      || typeof current.weatherCode !== "number" || !Number.isInteger(current.weatherCode)) return null;
    const location = readWeatherLocation();
    if (!location || location.latitude !== snapshot.location.latitude || location.longitude !== snapshot.location.longitude) return null;
    return snapshot as WeatherSnapshot;
  } catch {
    return null;
  }
}

function readDashboardNotifications(): DashboardNotification[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEYS.dashboardNotifications) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is DashboardNotification => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Partial<DashboardNotification>;
      return typeof item.id === "string" && item.id.length <= 120
        && ["email", "calendar", "task", "weather", "system"].includes(item.kind ?? "")
        && typeof item.title === "string" && item.title.length <= 180
        && typeof item.body === "string" && item.body.length <= 260
        && typeof item.occurredAt === "number" && Number.isFinite(item.occurredAt)
        && typeof item.read === "boolean";
    }).slice(0, 50).map((entry) => ({
      ...entry,
      title: entry.title.trim(),
      body: entry.body.trim(),
      target: safeQuickChatWebsiteUrl(entry.target) ?? undefined,
    }));
  } catch {
    return [];
  }
}

function persistDashboardNotifications() {
  dashboardNotifications = dashboardNotifications.slice(0, 50);
  localStorage.setItem(KEYS.dashboardNotifications, JSON.stringify(dashboardNotifications));
}

function addDashboardNotification(notification: Omit<DashboardNotification, "read">) {
  if (dashboardNotifications.some((item) => item.id === notification.id)) return false;
  dashboardNotifications.unshift({ ...notification, read: false });
  persistDashboardNotifications();
  return true;
}

let volume = 62;
let volumeMixerOpen = false;
let audioMixerApps: AudioAppVolume[] = [];
let audioMixerRefreshBusy = false;
let mediaRefreshBusy = false;
let mediaUpdatedAt = 0;
let mediaSeekDragging = false;
let expanded = onboardingOpen && !onboardingLaunchGreetingActive;
let settingsTab: SettingsTab = readChoice(KEYS.settingsTab, ["general", "shortcuts", "panels"], "general");
let onboardingInteractionMode: InteractionMode = readChoice(KEYS.interactionMode, ["hover", "click"], "hover");
let activeTab: MenuTab = "home";
let activeHomeView: HomeView = "now";
let utilityPopupMode: UtilityPopupMode | null = null;
let dashboardView: DashboardView = readChoice(KEYS.dashboardView, ["overview", "email", "calendar", "tasks", "notifications", "weather"], "overview");
let dashboardNotifications: DashboardNotification[] = readDashboardNotifications();
let weatherLocation: WeatherLocation | null = readWeatherLocation();
let weatherSnapshot: WeatherSnapshot | null = readWeatherSnapshot();
let weatherLoading = false;
let weatherError = "";
let weatherSearchBusy = false;
let weatherSearchMessage = "";
let weatherSearchResults: WeatherLocation[] = [];
let weatherQuery = "";
let weatherSearchOpen = false;
let googleAccount: GoogleAccountStatus = { connected: false, email: null, configured: false };
let googleSnapshot: GoogleSnapshot | null = null;
let googleLoading = false;
let googleStatusLoading = true;
let googleStatusMessage = "Verificando conexão com o Google…";
let googleError = "";
let googleAuthPending = false;
let googleAuthPollTimer: number | undefined;
let googleRefreshInterval: number | undefined;
let googlePollBusy = false;
let googleRefreshRequested = false;
let lastPetReactionId = "";
let utilityPopupBlurTimer: number | undefined;
let utilityPopupPositionSaveTimer: number | undefined;
let latestUtilityPopupPosition: UtilityPopupPosition | null = null;
let quickChatMessages: QuickChatMessage[] = [];
let quickChatDraft = localStorage.getItem(KEYS.quickChatDraft) ?? "";
let quickChatApprovals: QuickChatApproval[] = [];
let quickChatApprovalBusy = new Set<string>();
let quickChatFileChangePreviews = new Map<string, string>();
let quickChatAutoApproveSession = false;
let quickChatSessionPermissionNotice = "";
let quickChatModels: QuickChatModel[] = [{ id: "gpt-6-luna", displayName: "GPT-6 Luna", supportedReasoningEfforts: [{ reasoningEffort: "low" }] }];
let quickChatAuthenticated = false;
let quickChatLoading = false;
let quickChatCancelRequested = false;
let quickChatServiceLoading = false;
let quickChatServiceStarted = false;
let quickChatLoginPending = false;
let quickChatLoginFailed = false;
let quickChatLoginCompletedAt = 0;
let quickChatError = "";
let quickChatEntryPending = localStorage.getItem(KEYS.utilityPopup) === "chat"
  && Date.now() - Number(localStorage.getItem(KEYS.quickChatEntry) ?? 0) < 1600;
let quickChatStickToBottom = true;
let quickChatStatusPoll: number | undefined;
let quickChatStatusBusy = false;
let quickChatSelectedModel = localStorage.getItem(KEYS.quickChatModel) || "gpt-6-luna";
let quickChatSelectedReasoning = localStorage.getItem(KEYS.quickChatReasoning) || "low";
let barLength = readNumber(KEYS.length, DEFAULTS.length, MIN_LENGTH, MAX_LENGTH, LENGTH_STEP);
let barThickness = readNumber(KEYS.thickness, DEFAULTS.thickness, MIN_THICKNESS, MAX_THICKNESS);
let barPosition = onboardingOpen ? DEFAULTS.barPosition : readNumber(KEYS.barPosition, 50, 0, 100);
let interactionMode: InteractionMode = readChoice(KEYS.interactionMode, ["hover", "click"], "hover");
let edge: Edge = onboardingOpen ? "top" : readEdge();
if (onboardingOpen) {
  localStorage.setItem(KEYS.edge, "top");
  localStorage.setItem(KEYS.barPosition, String(DEFAULTS.barPosition));
}
let closeDelay = readNumber(KEYS.closeDelay, DEFAULTS.closeDelay, MIN_CLOSE_DELAY, MAX_CLOSE_DELAY, 50);
let allDisplays = localStorage.getItem(KEYS.allDisplays) === "true";
let selectedDisplayIds = readDisplayIds();
let displays: DisplayInfo[] = [];
let mainStartupPromise: Promise<void> | undefined;
let draggedId = "";
let shortcuts = readShortcuts();
let onboardingSelectedShortcutIds = new Set(shortcuts.slice(0, 3).map((shortcut) => shortcut.id));
let pocketItems = readPocketItems();
let clipboardEntries = readClipboardEntries();
let petName = localStorage.getItem(KEYS.petName) || "Ghosty";
let petSkin: PetSkin = readChoice(KEYS.petSkin, ["pearl", "smoke", "midnight", "mint", "coral", "lavender"], "pearl");
let petAccessory: PetAccessory = readChoice(KEYS.petAccessory, ["none", "star", "bow", "halo", "leaf", "crown"], "none");
let focusState = readFocusState();
let focusHistory = readFocusHistory();
let autoStartEnabled = false;
let autoStartLoading = true;
let autoStartBusy = false;
let autoStartError = "";
let mediaInfo: MediaInfo = {
  title: "", artist: "", playing: false, source: "", trackId: "", artworkDataUrl: "",
  positionMs: 0, durationMs: 0, canSeek: false,
};
let codexHooksEnabled = false;
let codexHooksBusy = true;
let codexHooksNeedsReview = false;
let codexHookPreview: CodexHookPreview | null = null;
let codexHooksStatusMessage = "Verificando a configuração do Codex…";
let codexPollPending = false;
let latestCodexPetState: { state: PetState; detail: string; occurredAt: number } | null = null;
let codexTaskRunning = false;
let taskCompletionTimer: number | undefined;
let pendingCodexApprovals: CodexApproval[] = [];
let codexApprovalSubmitting = false;
let codexApprovalError = "";
let codexApprovalPresentationKey = "";
let codexActivity = loadCodexActivity();
let codexRecentActivity: CodexRecentActivity[] = [];
const codexTaskStarts = new Map<string, number>();
let activeHomeIntegration: "github" | "vercel" = "github";
let githubConnected = false;
let githubStatusLoading = true;
let githubLoading = false;
let githubStatusMessage = "Verificando conexão com o GitHub…";
let githubError = "";
let githubSnapshot: GithubSnapshot | null = null;
let updatesPaused = false;
let githubRefreshInterval: number | undefined;
let vercelConnected = false;
let vercelStatusLoading = true;
let vercelLoading = false;
let vercelStatusMessage = "Verificando conexão com a Vercel…";
let vercelError = "";
let vercelSnapshot: VercelSnapshot | null = null;
let vercelTeamId = localStorage.getItem(KEYS.vercelTeamId) ?? "";
let vercelRefreshInterval: number | undefined;
let weatherRefreshInterval: number | undefined;
let soundEnabled = localStorage.getItem(KEYS.soundsEnabled) === "true";
let soundVolume = readNumber(KEYS.soundVolume, 24, 0, 100);
let externalLayoutSyncTimer: number | undefined;
let availableAppUpdate: Update | null = null;
let appUpdateChecking = false;
let appUpdateInstalling = false;
let appUpdateStatus = "O Ghosty verifica atualizações automaticamente.";
let appUpdateCheckInterval: number | undefined;
const codexApprovalExpiryTimers = new Map<string, number>();
let approvalHitBoundsInterval: number | undefined;
let approvalHitBoundsStopTimer: number | undefined;
let petMoodOverride = "";
let petMoodUntil = 0;
let pocketDropActive = false;
let nativeDragScale = 1;
let pocketNotice = "Solte arquivos ou texto para guardar";
let petDropFeedback = "";
let petDropFeedbackTimer: number | undefined;
let clipboardNotice = "";
let pendingPocketValues = new Set<string>();
let hoverCloseTimer: number | undefined;
let geometryFrame = 0;
let petLoveTimer: number | undefined;
let lastPetLove = 0;
let hasGreetedPet = false;
const petMotionEngines = new WeakMap<HTMLElement, PetMotionEngine>();
let geometryMotion: {
  body: HTMLElement;
  width: Tracked;
  height: Tracked;
  radius: Tracked;
} | undefined;
let lastPublishedBody: HTMLElement | undefined;
let lastPublishedRect: { x: number; y: number; width: number; height: number } | undefined;
let lastPublishedHoverRect: { x: number; y: number; width: number; height: number } | undefined;
let rectPublishAttempt = 0;
let wasPointerInNativeIsland = false;

const app = document.querySelector<HTMLDivElement>("#app")!;
setGhostySoundEnabled(soundEnabled);
setGhostySoundVolume(soundVolume / 100);
app.addEventListener("click", (event) => {
  if (!soundEnabled) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("button")) playGhostySound("tap");
});

function readJson<T>(key: string, fallback: T): T {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return parsed === null ? fallback : parsed as T;
  } catch {
    return fallback;
  }
}

function emptyCodexActivityDay(): CodexActivityDay {
  return { sessions: 0, completed: 0, interrupted: 0, toolCalls: 0, approvals: 0, activeMs: 0 };
}

function loadCodexActivity(): CodexActivity {
  const saved = readJson<unknown>(KEYS.codexActivity, {});
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const result: CodexActivity = {};
  for (const [date, item] of Object.entries(saved as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !item || typeof item !== "object") continue;
    const values = item as Record<string, unknown>;
    result[date] = {
      sessions: Math.max(0, Number(values.sessions) || 0),
      completed: Math.max(0, Number(values.completed) || 0),
      interrupted: Math.max(0, Number(values.interrupted) || 0),
      toolCalls: Math.max(0, Number(values.toolCalls) || 0),
      approvals: Math.max(0, Number(values.approvals) || 0),
      activeMs: Math.max(0, Number(values.activeMs) || 0),
    };
  }
  return result;
}

function activityDate(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function recentCodexActivity(days = 7) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - index - 1));
    const key = activityDate(date.getTime());
    return { date: key, values: codexActivity[key] ?? emptyCodexActivityDay() };
  });
}

function codexActivityTotals() {
  return recentCodexActivity().reduce((total, day) => {
    total.sessions += day.values.sessions;
    total.completed += day.values.completed;
    total.interrupted += day.values.interrupted;
    total.toolCalls += day.values.toolCalls;
    total.approvals += day.values.approvals;
    total.activeMs += day.values.activeMs;
    return total;
  }, emptyCodexActivityDay());
}

function recordCodexRecentActivity(events: CodexHookEvent[]) {
  let changed = false;
  const visibleEvents = new Set([
    "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest",
    "SubagentStart", "SubagentStop", "Stop", "Interrupt", "SessionEnd",
  ]);
  for (const event of events) {
    if (!visibleEvents.has(event.eventName)) continue;
    codexRecentActivity.push({
      eventName: event.eventName,
      occurredAt: event.occurredAt || Date.now(),
      toolName: event.toolName?.slice(0, 48) ?? null,
      agentType: event.agentType?.slice(0, 40) ?? null,
    });
    changed = true;
  }
  if (codexRecentActivity.length > 12) codexRecentActivity.splice(0, codexRecentActivity.length - 12);
  return changed;
}

function codexRecentActivityLabel(event: CodexRecentActivity) {
  const tool = event.toolName ? ` · ${event.toolName}` : "";
  switch (event.eventName) {
    case "SessionStart": return "Sessão iniciada";
    case "UserPromptSubmit": return "Nova tarefa enviada";
    case "PreToolUse": return `Iniciou uma etapa${tool}`;
    case "PostToolUse": return `Concluiu uma etapa${tool}`;
    case "PermissionRequest": return `Pediu aprovação${tool}`;
    case "SubagentStart": return `Delegou${event.agentType ? ` · ${event.agentType}` : " uma etapa"}`;
    case "SubagentStop": return `Concluiu etapa delegada${event.agentType ? ` · ${event.agentType}` : ""}`;
    case "Stop": return "Tarefa concluída";
    case "Interrupt": return "Tarefa interrompida";
    case "SessionEnd": return "Sessão encerrada";
    default: return "Atividade do Codex";
  }
}

function renderCodexRecentActivity(limit = 2) {
  const visible = codexRecentActivity.slice(-limit).reverse();
  return `<div class="codex-recent-activity" aria-live="polite"><small>ATIVIDADE RECENTE · SÓ NESTA SESSÃO</small>${visible.length
    ? visible.map((event) => {
      const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(event.occurredAt);
      const state = event.eventName === "PermissionRequest" ? "approval"
        : event.eventName === "Interrupt" ? "error"
          : ["Stop", "PostToolUse", "SubagentStop"].includes(event.eventName) ? "success"
            : ["UserPromptSubmit", "PreToolUse", "SubagentStart"].includes(event.eventName) ? "active" : "neutral";
      return `<div class="codex-recent-event" data-state="${state}"><i aria-hidden="true"></i><span>${escapeHtml(codexRecentActivityLabel(event))}</span><time>${time}</time></div>`;
    }).join("")
    : '<span class="codex-recent-empty">As etapas aparecem aqui enquanto o Ghosty estiver conectado.</span>'}</div>`;
}

function recordCodexActivity(events: CodexHookEvent[]) {
  if (updatesPaused || currentWindowLabel !== "main") return;
  const recentChanged = recordCodexRecentActivity(events);
  let changed = false;
  for (const event of events) {
    const date = activityDate(event.occurredAt || Date.now());
    const values = codexActivity[date] ?? (codexActivity[date] = emptyCodexActivityDay());
    const sessionKey = event.sessionId || "default-session";
    if (event.eventName === "SessionStart") { values.sessions += 1; changed = true; }
    else if (event.eventName === "UserPromptSubmit") { codexTaskStarts.set(sessionKey, event.occurredAt); }
    else if (event.eventName === "PostToolUse") { values.toolCalls += 1; changed = true; }
    else if (event.eventName === "PermissionRequest") { values.approvals += 1; changed = true; }
    else if (event.eventName === "Stop" || event.eventName === "Interrupt" || event.eventName === "SessionEnd") {
      const startedAt = codexTaskStarts.get(sessionKey);
      codexTaskStarts.delete(sessionKey);
      if (event.eventName === "Stop") values.completed += 1;
      if (event.eventName === "Interrupt") values.interrupted += 1;
      if (startedAt && event.occurredAt >= startedAt && event.occurredAt - startedAt <= 6 * 60 * 60_000) {
        values.activeMs += event.occurredAt - startedAt;
      }
      changed = changed || event.eventName !== "SessionEnd";
    }
  }
  if (!changed) {
    if (recentChanged) refreshCodexActivityUi();
    return;
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  for (const date of Object.keys(codexActivity)) if (new Date(`${date}T12:00:00`).getTime() < cutoff.getTime()) delete codexActivity[date];
  localStorage.setItem(KEYS.codexActivity, JSON.stringify(codexActivity));
  refreshCodexActivityUi();
}

function renderCodexActivityPopup() {
  const days = recentCodexActivity();
  const totals = codexActivityTotals();
  const peak = Math.max(1, ...days.map(({ values }) => values.activeMs));
  const labels = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
  return `
    <section class="codex-activity-page">
      ${renderCodexRecentActivity(8)}
      <div class="activity-summary-metrics">
        <article><strong>${totals.completed}</strong><small>tarefas concluídas</small></article>
        <article><strong>${Math.round(totals.activeMs / 60_000)} min</strong><small>tempo ativo estimado</small></article>
        <article><strong>${totals.sessions}</strong><small>sessões iniciadas</small></article>
      </div>
      <div class="activity-day-list">${days.map(({ date, values }) => {
        const label = labels.format(new Date(`${date}T12:00:00`)).replace(".", "");
        return `<div class="activity-day-row"><div><strong>${escapeHtml(label)}</strong><small>${values.completed} tarefas · ${values.toolCalls} etapas</small></div><span class="activity-bar"><i style="--activity-width:${Math.max(2, values.activeMs / peak * 100)}%"></i></span><output>${Math.round(values.activeMs / 60_000)} min</output></div>`;
      }).join("")}</div>
      <small class="settings-note">As etapas recentes ficam só em memória nesta sessão. O resumo guarda contagens e durações locais por até 90 dias; prompts, respostas e comandos não são registrados.</small>
      <button class="reset-button" data-action="clear-codex-activity">Limpar resumo local</button>
    </section>`;
}

function renderGithubPull(pull: GithubPullRequest) {
  const url = safeQuickChatWebsiteUrl(pull.url);
  if (!url) return "";
  const ci = pull.ciStatus ? `<small class="github-ci ${pull.ciStatus === "Falhou" ? "is-failed" : pull.ciStatus === "Aprovado" ? "is-passed" : ""}">${escapeHtml(pull.ciStatus)}</small>` : "";
  return `<button class="github-pull" data-action="open-github-link" data-url="${escapeHtml(url)}"><span class="github-pull-main"><strong>${escapeHtml(pull.title)}</strong><small>${escapeHtml(pull.repository)} · #${pull.number}${pull.draft ? " · rascunho" : ""}</small></span>${ci}<span class="overview-link-arrow">↗</span></button>`;
}

function renderGithubContent() {
  if (githubStatusLoading) return '<div class="github-empty">Verificando conexão com o GitHub…</div>';
  if (!githubConnected) return `<div class="github-empty"><span>Veja PRs abertos, revisões pedidas e status do CI aqui.</span><button data-action="github-open-settings">Conectar GitHub</button></div>`;
  if (githubLoading && !githubSnapshot) return '<div class="github-empty">Buscando seus pull requests…</div>';
  if (githubError) return `<div class="github-empty is-error">${escapeHtml(githubError)}<button data-action="github-refresh" ${updatesPaused || githubLoading ? "disabled" : ""}>Tentar novamente</button></div>`;
  if (!githubSnapshot) return `<div class="github-empty">${updatesPaused ? "Atualizações pausadas." : "Ainda não há dados carregados."}<button data-action="github-refresh" ${updatesPaused || githubLoading ? "disabled" : ""}>Atualizar</button></div>`;
  const authored = githubSnapshot.authored.slice(0, 3);
  const reviews = githubSnapshot.reviewRequested.slice(0, 3);
  const checked = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(githubSnapshot.checkedAt);
  const content = `${authored.map(renderGithubPull).join("")}${reviews.map(renderGithubPull).join("")}`;
  return `<div class="github-overview-meta"><span>@${escapeHtml(githubSnapshot.login)}</span><span>${updatesPaused ? "Atualizações pausadas" : githubLoading ? "Atualizando…" : `Atualizado às ${checked}`}</span></div>
    ${content ? `<div class="github-pull-list">${content}</div>` : '<div class="github-empty">Sem PRs abertos ou revisões pendentes.</div>'}
    <div class="github-overview-footer"><small>${authored.length} seus · ${reviews.length} para revisar</small><button data-action="github-refresh" aria-label="Atualizar GitHub" title="Atualizar" ${updatesPaused || githubLoading ? "disabled" : ""}>↻</button></div>`;
}

function renderVercelContent() {
  if (vercelStatusLoading) return '<div class="github-empty">Verificando conexão com a Vercel…</div>';
  if (!vercelConnected) return `<div class="github-empty"><span>Veja o estado e as implantações recentes dos seus projetos.</span><button data-action="vercel-open-settings">Conectar Vercel</button></div>`;
  if (vercelLoading && !vercelSnapshot) return '<div class="github-empty">Buscando as implantações…</div>';
  if (vercelError && !vercelSnapshot) return `<div class="github-empty is-error">${escapeHtml(vercelError)}<button data-action="integration-refresh">Tentar novamente</button></div>`;
  if (!vercelSnapshot) return `<div class="github-empty">${updatesPaused ? "Atualizações pausadas." : "Ainda não há dados carregados."}<button data-action="integration-refresh" ${updatesPaused || vercelLoading ? "disabled" : ""}>Atualizar</button></div>`;
  const checked = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(vercelSnapshot.checkedAt);
  const rows = vercelSnapshot.deployments.map((deployment) => {
    const url = safeQuickChatWebsiteUrl(deployment.url);
    if (!url) return "";
    const state = deployment.state.toLocaleUpperCase("en-US");
    const stateClass = state === "READY" ? "is-passed" : state === "ERROR" ? "is-failed" : state === "CANCELED" ? "is-neutral" : "";
    const stateLabel = state === "READY" ? "Pronto" : state === "ERROR" ? "Falhou" : state === "BUILDING" || state === "INITIALIZING" ? "Em andamento" : state === "CANCELED" ? "Cancelado" : state;
    const detail = [deployment.target === "production" ? "produção" : deployment.target, deployment.branch].filter(Boolean).join(" · ");
    return `<button class="github-pull vercel-deployment" data-action="open-vercel-link" data-url="${escapeHtml(url)}"><span class="github-pull-main"><strong>${escapeHtml(deployment.name)}</strong><small>${escapeHtml(detail || deployment.commitMessage || "Implantação recente")}</small></span><small class="github-ci ${stateClass}">${escapeHtml(stateLabel)}</small><span class="overview-link-arrow">↗</span></button>`;
  }).join("");
  const error = vercelError ? `<small class="vercel-refresh-warning">${escapeHtml(vercelError)}</small>` : "";
  return `<div class="github-overview-meta"><span>${escapeHtml(vercelSnapshot.username)}${vercelTeamId ? " · equipe" : " · pessoal"}</span><span>${updatesPaused ? "Atualizações pausadas" : vercelLoading ? "Atualizando…" : `Atualizado às ${checked}`}</span></div>
    ${rows ? `<div class="github-pull-list">${rows}</div>` : '<div class="github-empty">Nenhuma implantação recente nesta conta.</div>'}
    ${error}<div class="github-overview-footer"><small>${vercelSnapshot.deployments.length} implantações recentes</small><button data-action="integration-refresh" aria-label="Atualizar Vercel" title="Atualizar" ${updatesPaused || vercelLoading ? "disabled" : ""}>↻</button></div>`;
}

function homeIntegrationHealth() {
  const githubActive = activeHomeIntegration === "github";
  const statusLoading = githubActive ? githubStatusLoading : vercelStatusLoading;
  const loading = githubActive ? githubLoading : vercelLoading;
  const connected = githubActive ? githubConnected : vercelConnected;
  const error = githubActive ? githubError : vercelError;
  if (statusLoading || loading) return { state: "active", label: "Atualizando" };
  if (updatesPaused && connected) return { state: "paused", label: "Pausado" };
  if (error) return { state: "error", label: "Atenção" };
  if (!connected) return { state: "idle", label: "Desconectado" };
  return { state: "success", label: "Conectado" };
}

function paintHomeIntegrationHealth() {
  const indicator = app.querySelector<HTMLElement>(".integration-health");
  if (!indicator) return;
  const health = homeIntegrationHealth();
  indicator.dataset.state = health.state;
  const label = indicator.querySelector<HTMLElement>("span");
  if (label) label.textContent = health.label;
}

function renderHomeIntegrationContent() {
  return activeHomeIntegration === "github" ? renderGithubContent() : renderVercelContent();
}

function refreshGithubCard() {
  const content = app.querySelector<HTMLElement>(".integration-card-content");
  if (content) {
    content.innerHTML = renderHomeIntegrationContent();
    bindGithubActions(content);
  }
  const selectedConnected = activeHomeIntegration === "github" ? githubConnected : vercelConnected;
  const selectedLoading = activeHomeIntegration === "github" ? githubLoading : vercelLoading;
  app.querySelectorAll<HTMLButtonElement>("[data-action=integration-refresh]").forEach((button) => { button.disabled = selectedLoading || updatesPaused || !selectedConnected; });
  app.querySelectorAll<HTMLButtonElement>("[data-action=github-refresh]").forEach((button) => { button.disabled = githubLoading || updatesPaused || !githubConnected; });
  app.querySelectorAll<HTMLButtonElement>("[data-action=integration-tab]").forEach((button) => {
    const active = button.dataset.integration === activeHomeIntegration;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  app.querySelectorAll<HTMLButtonElement>("[data-action=integration-refresh]").forEach((button) => {
    const service = activeHomeIntegration === "github" ? "GitHub" : "Vercel";
    button.setAttribute("aria-label", `Atualizar ${service}`);
    button.title = `Atualizar ${service}`;
  });
  paintHomeIntegrationHealth();
}

function bindGithubActions(container: ParentNode) {
  container.querySelectorAll<HTMLButtonElement>("[data-action=integration-tab]").forEach((button) => button.addEventListener("click", () => {
    activeHomeIntegration = button.dataset.integration === "vercel" ? "vercel" : "github";
    refreshGithubCard();
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=integration-refresh]").forEach((button) => button.addEventListener("click", () => {
    if (activeHomeIntegration === "github") void refreshGithubSnapshot();
    else void refreshVercelSnapshot();
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=github-refresh]").forEach((button) => button.addEventListener("click", () => void refreshGithubSnapshot()));
  container.querySelectorAll<HTMLButtonElement>("[data-action=vercel-refresh]").forEach((button) => button.addEventListener("click", () => void refreshVercelSnapshot()));
  container.querySelectorAll<HTMLButtonElement>("[data-action=github-open-settings]").forEach((button) => button.addEventListener("click", () => {
    openSettingsWindow("general");
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=open-github-link]").forEach((button) => button.addEventListener("click", () => {
    const url = safeQuickChatWebsiteUrl(button.dataset.url);
    if (url) void invoke("open_targets", { targets: [url] }).catch(() => undefined);
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=vercel-open-settings]").forEach((button) => button.addEventListener("click", () => {
    openSettingsWindow("general");
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=open-vercel-link]").forEach((button) => button.addEventListener("click", () => {
    const url = safeQuickChatWebsiteUrl(button.dataset.url);
    if (url) void invoke("open_targets", { targets: [url] }).catch(() => undefined);
  }));
}

async function refreshGithubSnapshot() {
  if (!githubConnected || githubLoading || updatesPaused) return;
  githubLoading = true;
  githubError = "";
  refreshGithubCard();
  try {
    githubSnapshot = await invoke<GithubSnapshot>("github_refresh");
    githubStatusMessage = `Conectado como @${githubSnapshot.login}.`;
  } catch (error) {
    githubError = String(error).replace(/^Error: /, "");
    githubStatusMessage = githubError;
  } finally {
    githubLoading = false;
    refreshGithubCard();
    refreshGithubSettingsUi();
  }
}

async function refreshGithubStatus() {
  githubStatusLoading = true;
  try {
    githubConnected = await invoke<boolean>("github_token_status");
    githubStatusMessage = githubConnected ? "GitHub conectado. O token fica no Gerenciador de Credenciais do Windows." : "GitHub desconectado.";
    githubSnapshot = await invoke<GithubSnapshot | null>("github_cached_snapshot");
  } catch (error) {
    githubStatusMessage = `Não consegui verificar o GitHub: ${String(error)}`;
  } finally {
    githubStatusLoading = false;
    refreshGithubCard();
    refreshGithubSettingsUi();
  }
  if (githubConnected && !updatesPaused) void refreshGithubSnapshot();
}

function refreshGithubSettingsUi() {
  app.querySelectorAll<HTMLElement>("[data-github-status]").forEach((element) => {
    element.textContent = githubLoading ? "Atualizando seus pull requests…" : githubStatusMessage;
  });
  app.querySelectorAll<HTMLButtonElement>("[data-action=github-save-token]").forEach((button) => { button.disabled = githubStatusLoading || githubLoading || updatesPaused; });
  app.querySelectorAll<HTMLButtonElement>("[data-action=github-clear-token]").forEach((button) => { button.hidden = !githubConnected; });
}

async function saveGithubToken() {
  const input = app.querySelector<HTMLInputElement>("#github-token");
  const button = app.querySelector<HTMLButtonElement>("[data-action=github-save-token]");
  const token = input?.value.trim() ?? "";
  if (!token || githubLoading) return;
  const wasConnected = githubConnected;
  githubStatusLoading = true;
  githubStatusMessage = "Validando o token e salvando no Windows…";
  refreshGithubSettingsUi();
  try {
    const login = await invoke<string>("github_save_token", { token });
    githubConnected = true;
    githubSnapshot = null;
    githubError = "";
    githubStatusMessage = `Conectado como @${login}. Token protegido pelo Gerenciador de Credenciais do Windows.`;
    if (input) input.value = "";
    if (button) button.disabled = false;
    githubStatusLoading = false;
    refreshGithubSettingsUi();
    void refreshGithubSnapshot();
  } catch (error) {
    githubStatusMessage = String(error).replace(/^Error: /, "");
    githubConnected = wasConnected;
    refreshGithubSettingsUi();
  } finally {
    githubStatusLoading = false;
    refreshGithubSettingsUi();
    refreshGithubCard();
  }
}

async function clearGithubToken() {
  try {
    await invoke("github_clear_token");
    githubConnected = false;
    githubSnapshot = null;
    githubError = "";
    githubStatusMessage = "GitHub desconectado; a credencial foi removida do Windows.";
  } catch (error) {
    githubStatusMessage = `Não consegui remover o token: ${String(error)}`;
  }
  refreshGithubSettingsUi();
  refreshGithubCard();
}

async function refreshVercelSnapshot() {
  if (!vercelConnected || vercelLoading || updatesPaused) return;
  vercelLoading = true;
  vercelError = "";
  refreshGithubCard();
  refreshVercelSettingsUi();
  try {
    vercelSnapshot = await invoke<VercelSnapshot>("vercel_refresh", { teamId: vercelTeamId || null });
    vercelStatusMessage = `Conectado à Vercel como ${vercelSnapshot.username}.`;
  } catch (error) {
    vercelError = String(error).replace(/^Error: /, "");
    vercelStatusMessage = vercelError;
  } finally {
    vercelLoading = false;
    refreshGithubCard();
    refreshVercelSettingsUi();
  }
}

async function refreshVercelStatus() {
  vercelStatusLoading = true;
  try {
    vercelConnected = await invoke<boolean>("vercel_token_status");
    vercelSnapshot = await invoke<VercelSnapshot | null>("vercel_cached_snapshot");
    vercelStatusMessage = vercelConnected
      ? "Vercel conectada. O token fica no Gerenciador de Credenciais do Windows."
      : "Vercel desconectada.";
  } catch (error) {
    vercelStatusMessage = `Não consegui verificar a Vercel: ${String(error)}`;
  } finally {
    vercelStatusLoading = false;
    refreshGithubCard();
    refreshVercelSettingsUi();
  }
  if (vercelConnected && !updatesPaused) void refreshVercelSnapshot();
}

function refreshVercelSettingsUi() {
  app.querySelectorAll<HTMLElement>("[data-vercel-status]").forEach((element) => {
    element.textContent = vercelLoading ? "Atualizando as implantações…" : vercelStatusMessage;
  });
  app.querySelectorAll<HTMLButtonElement>("[data-action=vercel-save-token]").forEach((button) => {
    button.disabled = vercelStatusLoading || vercelLoading || updatesPaused;
  });
  app.querySelectorAll<HTMLButtonElement>("[data-action=vercel-clear-token]").forEach((button) => { button.hidden = !vercelConnected; });
  app.querySelectorAll<HTMLInputElement>("#vercel-team-id").forEach((input) => { input.disabled = vercelStatusLoading || vercelLoading; });
}

async function saveVercelToken() {
  const input = app.querySelector<HTMLInputElement>("#vercel-token");
  const button = app.querySelector<HTMLButtonElement>("[data-action=vercel-save-token]");
  const teamInput = app.querySelector<HTMLInputElement>("#vercel-team-id");
  const token = input?.value.trim() ?? "";
  if (!token || vercelLoading || updatesPaused) return;
  const wasConnected = vercelConnected;
  vercelTeamId = teamInput?.value.trim() ?? vercelTeamId;
  localStorage.setItem(KEYS.vercelTeamId, vercelTeamId);
  vercelStatusLoading = true;
  vercelStatusMessage = "Validando o token e salvando no Windows…";
  refreshVercelSettingsUi();
  try {
    const username = await invoke<string>("vercel_save_token", { tokenValue: token });
    vercelConnected = true;
    vercelSnapshot = null;
    vercelError = "";
    vercelStatusMessage = `Conectado à Vercel como ${username}. O token fica no Gerenciador de Credenciais do Windows.`;
    if (input) input.value = "";
    if (button) button.disabled = false;
    vercelStatusLoading = false;
    refreshVercelSettingsUi();
    void refreshVercelSnapshot();
  } catch (error) {
    vercelStatusMessage = String(error).replace(/^Error: /, "");
    vercelConnected = wasConnected;
  } finally {
    vercelStatusLoading = false;
    refreshVercelSettingsUi();
    refreshGithubCard();
  }
}

async function clearVercelToken() {
  try {
    await invoke("vercel_clear_token");
    vercelConnected = false;
    vercelSnapshot = null;
    vercelError = "";
    vercelStatusMessage = "Vercel desconectada; a credencial foi removida do Windows.";
  } catch (error) {
    vercelStatusMessage = `Não consegui remover o token: ${String(error)}`;
  }
  refreshVercelSettingsUi();
  refreshGithubCard();
}

function refreshCodexActivityUi() {
  const recent = app.querySelector<HTMLElement>(".coucou-codex-card .codex-recent-activity");
  if (recent) recent.outerHTML = renderCodexRecentActivity(2);
  const state = app.querySelector<HTMLElement>(".coucou-codex-card .coucou-card-status span");
  if (state) state.textContent = pendingCodexApprovals.length > 0 ? "Aprovação pendente" : codexTaskRunning ? "Trabalhando agora" : "Aguardando tarefa";
  const count = app.querySelector<HTMLElement>(".coucou-codex-card .coucou-card-actions button");
  if (count) count.innerHTML = `${codexActivityTotals().completed} tarefas concluídas <span>↗</span>`;
  if (utilityPopupMode === "codex-activity" && currentWindowLabel === "utility-popup") {
    const body = app.querySelector<HTMLElement>(".utility-popup-body");
    if (body) {
      body.innerHTML = renderCodexActivityPopup();
      bindCodexActivityPopup(body);
    }
  }
}

function readPocketItems(): PocketItem[] {
  const items = readJson<unknown>(KEYS.pocket, []);
  return Array.isArray(items) ? items.filter((item): item is PocketItem => {
    if (!item || typeof item !== "object") return false;
    const value = item as Record<string, unknown>;
    return typeof value.id === "string" && typeof value.name === "string" && typeof value.value === "string"
      && (value.kind === "file" || value.kind === "image" || value.kind === "text");
  }).slice(0, 8) : [];
}

function readClipboardEntries(): ClipboardEntry[] {
  const items = readJson<unknown>(KEYS.clipboard, []);
  return Array.isArray(items) ? items.filter((item): item is ClipboardEntry => {
    if (!item || typeof item !== "object") return false;
    const value = item as Record<string, unknown>;
    return typeof value.id === "string" && typeof value.text === "string" && typeof value.addedAt === "number";
  }).slice(0, 12) : [];
}

function readFocusState(): FocusState {
  const fallback = { durationMs: 25 * 60_000, remainingMs: 25 * 60_000, endsAt: 0, running: false, startedAt: 0 };
  const value = readJson<Partial<FocusState>>(KEYS.focus, fallback);
  if (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs)
    || typeof value.remainingMs !== "number" || !Number.isFinite(value.remainingMs)
    || typeof value.endsAt !== "number" || !Number.isFinite(value.endsAt)
    || typeof value.running !== "boolean") return fallback;
  const durationMs = Math.max(60_000, Math.min(180 * 60_000, value.durationMs));
  const remainingMs = Math.max(0, Math.min(180 * 60_000, value.remainingMs));
  const endsAt = value.endsAt;
  const running = value.running;
  const savedStartedAt = typeof value.startedAt === "number" && Number.isFinite(value.startedAt) ? value.startedAt : 0;
  return {
    durationMs,
    remainingMs,
    endsAt,
    running,
    startedAt: running ? (savedStartedAt > 0 ? savedStartedAt : Math.max(0, endsAt - remainingMs)) : 0,
  };
}

function readFocusHistory(): FocusHistoryEntry[] {
  const entries = readJson<unknown>(KEYS.focusHistory, []);
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry): entry is FocusHistoryEntry => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Record<string, unknown>;
    return typeof value.id === "string" && typeof value.startedAt === "number" && Number.isFinite(value.startedAt)
      && typeof value.endedAt === "number" && Number.isFinite(value.endedAt) && value.endedAt >= value.startedAt
      && typeof value.durationMs === "number" && Number.isFinite(value.durationMs) && value.durationMs > 0
      && typeof value.completed === "boolean";
  }).slice(-1000);
}

function readChoice<T extends string>(key: string, choices: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key);
  return choices.includes(value as T) ? value as T : fallback;
}

function readShortcuts(): Shortcut[] {
  const saved = readJson<Shortcut[]>(KEYS.shortcuts, []);
  const custom = Array.isArray(saved) ? saved.filter((item) => item && item.custom && typeof item.id === "string"
    && typeof item.name === "string" && typeof item.glyph === "string"
    && Array.isArray(item.targets) && item.targets.every((target) => typeof target === "string")) : [];
  const available = [...DEFAULT_SHORTCUTS, ...custom];
  const order = Array.isArray(saved) ? saved.map((item) => item?.id).filter((id): id is string => typeof id === "string") : [];
  const ordered = order.map((id) => available.find((item) => item.id === id)).filter((item): item is Shortcut => !!item);
  return [...ordered, ...available.filter((item) => !order.includes(item.id))];
}

function persistShortcuts() {
  localStorage.setItem(KEYS.shortcuts, JSON.stringify(shortcuts));
}

function focusRemainingMs() {
  return focusState.running ? Math.max(0, focusState.endsAt - Date.now()) : Math.max(0, focusState.remainingMs);
}

function persistFocus() {
  focusState.remainingMs = focusRemainingMs();
  localStorage.setItem(KEYS.focus, JSON.stringify(focusState));
}

function persistFocusHistory() {
  localStorage.setItem(KEYS.focusHistory, JSON.stringify(focusHistory));
}

function recordFocusSegment(completed: boolean) {
  const startedAt = focusState.startedAt;
  if (!startedAt) return;
  const endedAt = Math.min(Date.now(), focusState.endsAt || Date.now());
  const durationMs = Math.max(0, endedAt - startedAt);
  if (durationMs >= 15_000) {
    focusHistory = [...focusHistory, { id: makeId(), startedAt, endedAt, durationMs, completed }].slice(-1000);
    persistFocusHistory();
    paintFocusSummary();
  }
}

function formatFocusTotal(durationMs: number) {
  const totalMinutes = Math.max(durationMs > 0 ? 1 : 0, Math.round(durationMs / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function getFocusWeekSnapshot() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(today);
    start.setDate(today.getDate() - (6 - index));
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const startMs = start.getTime();
    const endMs = end.getTime();
    const totalMs = focusHistory.reduce((sum, entry) => {
      return sum + Math.max(0, Math.min(entry.endedAt, endMs) - Math.max(entry.startedAt, startMs));
    }, 0);
    return {
      startMs,
      endMs,
      label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(start).replace(".", ""),
      totalMs,
    };
  });
  const rangeStart = days[0].startMs;
  const rangeEnd = days[6].endMs;
  return {
    days,
    totalMs: days.reduce((sum, day) => sum + day.totalMs, 0),
    completedCount: focusHistory.filter((entry) => entry.completed && entry.endedAt >= rangeStart && entry.endedAt < rangeEnd).length,
  };
}

function renderFocusSummary() {
  const snapshot = getFocusWeekSnapshot();
  const maximum = Math.max(1, ...snapshot.days.map((day) => day.totalMs));
  const chartLabel = snapshot.days.map((day) => `${day.label}: ${formatFocusTotal(day.totalMs)}`).join(", ");
  const bars = snapshot.days.map((day) => {
    const height = day.totalMs > 0 ? Math.max(7, day.totalMs / maximum * 100) : 3;
    return `<div class="focus-history-day" aria-label="${escapeHtml(day.label)}: ${escapeHtml(formatFocusTotal(day.totalMs))}">
      <span>${day.totalMs > 0 ? escapeHtml(formatFocusTotal(day.totalMs)) : ""}</span>
      <div class="focus-history-bar"><i style="--focus-bar-height:${height}%"></i></div>
      <small>${escapeHtml(day.label)}</small>
    </div>`;
  }).join("");
  return `
    <section class="focus-history">
      <button class="focus-history-back" data-action="focus-summary-back">← Voltar ao temporizador</button>
      <div class="focus-history-card">
        <span class="section-kicker">ÚLTIMOS 7 DIAS</span>
        <strong class="focus-history-total">${escapeHtml(formatFocusTotal(snapshot.totalMs))}</strong>
        <small>${snapshot.completedCount} ${snapshot.completedCount === 1 ? "ciclo concluído" : "ciclos concluídos"}</small>
        <div class="focus-history-chart" role="img" aria-label="Tempo de foco por dia: ${escapeHtml(chartLabel)}">${bars}</div>
        ${focusHistory.length === 0
          ? '<p class="focus-history-empty">Suas sessões de foco aparecerão aqui.</p>'
          : `<button class="focus-history-clear" data-action="focus-history-clear">Limpar histórico</button>`}
      </div>
      <small class="focus-history-footnote">O histórico fica salvo somente neste dispositivo.</small>
    </section>`;
}

function getPetMood() {
  if (Date.now() < petMoodUntil && petMoodOverride) return petMoodOverride;
  if (focusState.running) return "focused";
  const held = pocketItems[0];
  if (held) return held.kind === "image" ? "holding-image" : held.kind === "file" ? "holding-file" : "holding-text";
  return "calm";
}

function petMoodLabel(mood = getPetMood()) {
  const labels: Record<string, string> = {
    calm: "de boa", focused: "em foco", chewing: "nhac nhac…", happy: "feliz", annoyed: "emburrado",
    dizzy: "tontinho", "holding-file": "guardando um arquivo", "holding-image": "guardando uma imagem", "holding-text": "guardando uma ideia",
  };
  return labels[mood] ?? "de boa";
}

function updatePetAtmosphere() {
  const mood = getPetMood();
  const item = pocketItems[0];
  app.querySelectorAll<HTMLElement>(".pet-page, .pet-profile").forEach((element) => {
    element.dataset.mood = mood;
    element.dataset.itemType = item?.kind ?? "none";
  });
  app.querySelectorAll<HTMLElement>(".pet").forEach((pet) => {
    pet.dataset.skin = petSkin;
    pet.dataset.accessory = petAccessory;
    pet.dataset.mood = mood;
    petMotionEngines.get(pet)?.setAppearance(petSkin, petAccessory, mood);
  });
  app.querySelectorAll<HTMLElement>(".pet-mood-label, .home-pet-copy small").forEach((label) => {
    label.textContent = petMoodLabel(mood);
  });
  app.querySelectorAll<HTMLElement>(".pet-side-status").forEach((status) => {
    status.dataset.mood = mood;
    const label = status.querySelector<HTMLElement>("span");
    if (label) label.textContent = petMoodLabel(mood);
  });
}

function radiusString(radius: number) {
  if (edge === "top") return `0 0 ${radius}px ${radius}px`;
  if (edge === "bottom") return `${radius}px ${radius}px 0 0`;
  if (edge === "right") return `${radius}px 0 0 ${radius}px`;
  return `0 ${radius}px ${radius}px 0`;
}

function currentRadius(style: CSSStyleDeclaration) {
  const value = edge === "top"
    ? style.borderBottomLeftRadius
    : edge === "bottom"
      ? style.borderTopLeftRadius
      : edge === "right"
        ? style.borderTopLeftRadius
        : style.borderTopRightRadius;
  return Number.parseFloat(value) || 14;
}

function setBodyPosition(body: HTMLElement, width: number, height: number) {
  const currentEdge = (body.closest<HTMLElement>(".edge-island")?.dataset.edge ?? edge) as Edge;
  const position = Math.min(1, Math.max(0, barPosition / 100));
  const availableWidth = Math.max(0, window.innerWidth - width);
  const availableHeight = Math.max(0, window.innerHeight - height);

  body.style.left = currentEdge === "left" ? "0px" : currentEdge === "right" ? "auto" : `${availableWidth * position}px`;
  body.style.right = currentEdge === "right" ? "0px" : "auto";
  body.style.top = isVerticalEdge(currentEdge) || currentEdge === "top"
    ? `${isVerticalEdge(currentEdge) ? availableHeight * position : 0}px`
    : "auto";
  body.style.bottom = currentEdge === "bottom" ? "0px" : "auto";
  body.style.transform = "none";
}

function setBodyGeometry(body: HTMLElement, width: number, height: number, radius: number) {
  body.style.width = `${width}px`;
  body.style.height = `${height}px`;
  body.style.borderRadius = radiusString(radius);
  setBodyPosition(body, width, height);
  positionCodexMediaBubble(body);
  publishNativeHitBounds(body);
}

function collapsedIslandSize(island = app.querySelector<HTMLElement>(".edge-island")) {
  if (island?.classList.contains("is-media-capsule")) {
    const length = Math.max(barLength, MEDIA_CAPSULE_LENGTH);
    const thickness = Math.max(barThickness, MEDIA_CAPSULE_THICKNESS);
    return isVerticalEdge() ? { width: thickness, height: length } : { width: length, height: thickness };
  }
  return isVerticalEdge()
    ? { width: barThickness, height: barLength }
    : { width: barLength, height: barThickness };
}

function shouldShowCollapsedMediaCapsule(island = app.querySelector<HTMLElement>(".edge-island")) {
  return mediaInfo.playing
    && Boolean(mediaInfo.artworkDataUrl)
    && pendingCodexApprovals.length === 0
    && !island?.classList.contains("is-task-complete");
}

function syncCollapsedMediaCapsule(island = app.querySelector<HTMLElement>(".edge-island")) {
  if (!island) return;
  const wasActive = island.classList.contains("is-media-capsule");
  const isActive = shouldShowCollapsedMediaCapsule(island);
  island.classList.toggle("is-media-capsule", isActive);
  if (!expanded && wasActive !== isActive) animateIsland(false);
}

function positionCodexMediaBubble(body = app.querySelector<HTMLElement>(".island-body")) {
  const island = body?.closest<HTMLElement>(".edge-island");
  const bubble = island?.querySelector<HTMLElement>(".codex-media-bubble");
  if (!body || !bubble) return;
  const rect = body.getBoundingClientRect();
  bubble.style.left = `${edge === "right" ? rect.left - 28 : rect.right + 7}px`;
  bubble.style.top = `${rect.top + rect.height / 2}px`;
}

function syncCodexMediaBubble(island = app.querySelector<HTMLElement>(".edge-island")) {
  if (!island) return;
  island.classList.toggle("is-codex-media-active", codexTaskRunning && mediaInfo.playing);
  positionCodexMediaBubble(island.querySelector<HTMLElement>(".island-body") ?? undefined);
}

function publishNativeHitBounds(body: HTMLElement) {
  const rects = [body.getBoundingClientRect()];
  const island = body.closest<HTMLElement>(".edge-island");
  const approvalToast = island?.querySelector<HTMLElement>(".ghosty-completion");
  if (!expanded && pendingCodexApprovals.length > 0 && approvalToast?.getAttribute("aria-hidden") === "false") {
    rects.push(approvalToast.getBoundingClientRect());
  }
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const hostWidth = window.innerWidth;
  const hostHeight = window.innerHeight;
  const hover = isVerticalEdge()
    ? { x: edge === "right" ? hostWidth - barThickness : 0, y: (hostHeight - barLength) / 2, width: barThickness, height: barLength }
    : {
      x: (hostWidth - barLength) / 2,
      y: edge === "top" ? 0 : hostHeight - barThickness,
      width: barLength,
      height: barThickness,
    };
  if (lastPublishedBody !== body) {
    lastPublishedBody = body;
    lastPublishedRect = undefined;
    lastPublishedHoverRect = undefined;
  }
  const next = { x: left, y: top, width: right - left, height: bottom - top };
  if (lastPublishedRect && Math.abs(next.x - lastPublishedRect.x) < 0.5
    && Math.abs(next.y - lastPublishedRect.y) < 0.5
    && Math.abs(next.width - lastPublishedRect.width) < 0.5
    && Math.abs(next.height - lastPublishedRect.height) < 0.5
    && lastPublishedHoverRect
    && Math.abs(hover.x - lastPublishedHoverRect.x) < 0.5
    && Math.abs(hover.y - lastPublishedHoverRect.y) < 0.5
    && Math.abs(hover.width - lastPublishedHoverRect.width) < 0.5
    && Math.abs(hover.height - lastPublishedHoverRect.height) < 0.5) return;
  lastPublishedRect = next;
  lastPublishedHoverRect = hover;
  const attempt = ++rectPublishAttempt;
  void invoke("set_island_rect", { ...next, hoverX: hover.x, hoverY: hover.y, hoverWidth: hover.width, hoverHeight: hover.height }).catch(() => {
    if (attempt !== rectPublishAttempt || lastPublishedBody !== body || !body.isConnected) return;
    lastPublishedRect = undefined;
    lastPublishedHoverRect = undefined;
    window.setTimeout(() => {
      if (lastPublishedBody === body && body.isConnected) publishNativeHitBounds(body);
    }, 100);
  });
}

function stopApprovalHitBoundsTracking() {
  if (approvalHitBoundsInterval !== undefined) window.clearInterval(approvalHitBoundsInterval);
  if (approvalHitBoundsStopTimer !== undefined) window.clearTimeout(approvalHitBoundsStopTimer);
  approvalHitBoundsInterval = undefined;
  approvalHitBoundsStopTimer = undefined;
}

function refreshApprovalHitBounds() {
  stopApprovalHitBoundsTracking();
  const body = app.querySelector<HTMLElement>(".island-body");
  if (!body) return;
  publishNativeHitBounds(body);
  if (expanded || pendingCodexApprovals.length === 0) return;
  approvalHitBoundsInterval = window.setInterval(() => {
    if (expanded || pendingCodexApprovals.length === 0 || !body.isConnected) {
      stopApprovalHitBoundsTracking();
      if (body.isConnected) publishNativeHitBounds(body);
      return;
    }
    publishNativeHitBounds(body);
  }, 50);
  approvalHitBoundsStopTimer = window.setTimeout(() => {
    stopApprovalHitBoundsTracking();
    if (body.isConnected) publishNativeHitBounds(body);
  }, 3600);
}

function freezeIslandGeometry(island: HTMLElement) {
  const body = island.querySelector<HTMLElement>(".island-body");
  if (!body) return;
  ++geometryFrame;
  const style = getComputedStyle(body);
  if (geometryMotion?.body !== body) {
    const rect = body.getBoundingClientRect();
    geometryMotion = {
      body,
      width: new Tracked(rect.width),
      height: new Tracked(rect.height),
      radius: new Tracked(currentRadius(style)),
    };
  }
  setBodyGeometry(body, geometryMotion.width.value, geometryMotion.height.value, geometryMotion.radius.value);
}

function expandedIslandSize() {
  if (onboardingLaunchGreetingActive) {
    return {
      width: Math.min(640, Math.max(220, window.innerWidth - 40)),
      height: Math.min(150, Math.max(100, window.innerHeight - 32)),
    };
  }
  const horizontal = !isVerticalEdge();
  const preferredWidth = activeTab === "home" && activeHomeView === "media" ? horizontal ? 1000 : 420
    : horizontal ? 960 : 420;
  const preferredHeight = onboardingOpen
    ? horizontal ? 380 : 620
    : activeTab === "home" ? horizontal ? 210 : 480
      : activeTab === "pet" ? horizontal ? 320 : 620
        : activeTab === "panels" ? horizontal ? 380 : 620
          : horizontal ? 380 : 620;
  return {
    width: Math.min(preferredWidth, Math.max(220, window.innerWidth - (horizontal ? 40 : 32))),
    height: Math.min(preferredHeight, Math.max(180, window.innerHeight - (horizontal ? 32 : 48))),
  };
}

function animateIsland(open: boolean) {
  const body = app.querySelector<HTMLElement>(".island-body");
  if (!body) return;

  const current = geometryMotion?.body === body ? geometryMotion : undefined;
  const style = getComputedStyle(body);
  const rect = body.getBoundingClientRect();
  const motion = current ?? {
    body,
    width: new Tracked(rect.width),
    height: new Tracked(rect.height),
    radius: new Tracked(currentRadius(style)),
  };
  const expandedSize = expandedIslandSize();
  const collapsedSize = collapsedIslandSize();
  const target = {
    width: open ? expandedSize.width : collapsedSize.width,
    height: open ? expandedSize.height : collapsedSize.height,
    radius: open ? 22 : 14,
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const token = ++geometryFrame;
  geometryMotion = motion;
  const now = performance.now();

  if (reducedMotion) {
    motion.width.jump(target.width);
    motion.height.jump(target.height);
    motion.radius.jump(target.radius);
    setBodyGeometry(body, target.width, target.height, target.radius);
    return;
  }

  if (open && onboardingLaunchGreetingActive) {
    const startWidth = motion.width.value;
    const startHeight = motion.height.value;
    const startRadius = motion.radius.value;
    const startedAt = now;
    const frame = (frameNow: number) => {
      if (token !== geometryFrame || motion.body !== body) return;
      const progress = Math.min(1, Math.max(0, (frameNow - startedAt) / 500));
      const growth = Math.sin(Math.PI * progress / 2) + 0.04 * Math.sin(Math.PI * progress) * progress;
      const width = startWidth + (target.width - startWidth) * growth;
      const height = startHeight + (target.height - startHeight) * growth;
      const radius = startRadius + (target.radius - startRadius) * growth;
      motion.width.jump(width);
      motion.height.jump(height);
      motion.radius.jump(radius);
      setBodyGeometry(body, width, height, radius);
      if (progress < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return;
  }

  if (open) {
    motion.width.springTo(target.width);
    motion.height.springTo(target.height);
    motion.radius.springTo(target.radius);
  } else {
    motion.width.curveTowards(target.width, 340, now);
    motion.height.curveTowards(target.height, 340, now);
    motion.radius.curveTowards(target.radius, 340, now);
  }
  let previous = now;
  const frame = (now: number) => {
    if (token !== geometryFrame || motion.body !== body) return;
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    motion.width.step(dt, now);
    motion.height.step(dt, now);
    motion.radius.step(dt, now);
    setBodyGeometry(body, motion.width.value, motion.height.value, motion.radius.value);
    if (motion.width.animating || motion.height.animating || motion.radius.animating) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]!);
}

function getSelectedDisplayIds() {
  const availableIds = new Set(displays.map((display) => display.id));
  const selected = selectedDisplayIds.find((id) => availableIds.has(id));
  if (selected) return [selected];
  return displays.find((display) => display.isPrimary)?.id
    ? [displays.find((display) => display.isPrimary)!.id]
    : displays.slice(0, 1).map((display) => display.id);
}

function persistSettings() {
  localStorage.setItem(KEYS.length, String(barLength));
  localStorage.setItem(KEYS.thickness, String(barThickness));
  localStorage.setItem(KEYS.barPosition, String(barPosition));
  localStorage.setItem(KEYS.edge, edge);
  localStorage.setItem(KEYS.closeDelay, String(closeDelay));
  localStorage.setItem(KEYS.displays, JSON.stringify(selectedDisplayIds));
  localStorage.setItem(KEYS.allDisplays, "false");
}

function applyIslandVariables(island: HTMLElement) {
  island.dataset.edge = edge;
  island.style.setProperty("--bar-length", `${barLength}px`);
  island.style.setProperty("--bar-half-length", `${barLength / 2}px`);
  island.style.setProperty("--bar-thickness", `${barThickness}px`);
  island.style.setProperty("--bar-position", String(barPosition / 100));
  const expandedSize = expandedIslandSize();
  island.style.setProperty("--expanded-width", `${expandedSize.width}px`);
  island.style.setProperty("--expanded-height", `${expandedSize.height}px`);
}

function applyDisplayLayout(isExpanded = expanded) {
  if (displays.length === 0) return Promise.resolve();
  const ids = getSelectedDisplayIds();
  return invoke("apply_display_layout", {
    edge,
    barLength,
    barThickness,
    displayIds: ids,
    selectedDisplayIds: ids,
    allDisplays: false,
    closeDelay,
    positionPercent: barPosition,
    expanded: isExpanded,
  }).then(() => {
    const body = app.querySelector<HTMLElement>(".island-body");
    if (body) {
      lastPublishedRect = undefined;
      lastPublishedHoverRect = undefined;
      publishNativeHitBounds(body);
    }
  }).catch(() => undefined);
}

function makeId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type MenuIconName = "brand" | "home" | "pet" | "panels" | "shortcuts" | "settings" | "close" | "pocket" | "clipboard" | "search" | "chevron" | "back" | "refresh" | "volume" | "previous" | "play" | "pause" | "next" | "plus" | "file" | "image" | "text";

function menuIcon(name: MenuIconName) {
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
  };
  return `<svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

function renderPetCharacter(className = "") {
  return `
    <button class="pet ${className}" data-skin="${petSkin}" data-accessory="${petAccessory}" data-mood="${getPetMood()}" type="button" aria-label="${escapeHtml(petName)}">
      <canvas class="pet-canvas" aria-hidden="true"></canvas>
      <span class="pet-activity-tooltip" role="status" aria-live="polite" aria-hidden="true"></span>
    </button>`;
}

function renderLaunchGreetingPet() {
  return `<div class="pet launch-greeting-pet" data-skin="${petSkin}" data-accessory="${petAccessory}" data-mood="happy" role="img" aria-label="${escapeHtml(petName)}"><canvas class="pet-canvas" aria-hidden="true"></canvas></div>`;
}

function renderPocketItems(limit = 8) {
 if (pocketItems.length === 0) return `<div class="pocket-empty"><span>${menuIcon("pocket")}</span><small>${escapeHtml(pocketNotice)}</small></div>`;
 return pocketItems.slice(0, limit).map((item) => `
   <article class="pocket-item" data-pocket-kind="${item.kind}">
      <span class="pocket-item-icon">${menuIcon(item.kind === "image" ? "image" : item.kind === "text" ? "text" : "file")}</span>
      <span class="pocket-item-copy"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><small>${item.kind === "text" ? item.truncated ? "primeiros 50 mil caracteres" : "texto guardado" : "o original continua no lugar"}</small></span>
      <button class="mini-icon pocket-ask" data-action="ask-pocket" data-pocket-id="${escapeHtml(item.id)}" aria-label="Perguntar ao Ghosty sobre ${escapeHtml(item.name)}" title="Perguntar ao Ghosty">✦</button>
      <button class="mini-icon" data-action="open-pocket" data-pocket-id="${escapeHtml(item.id)}" aria-label="Abrir ${escapeHtml(item.name)}" title="Abrir">↗</button>
      <button class="mini-icon" data-action="remove-pocket" data-pocket-id="${escapeHtml(item.id)}" aria-label="Tirar ${escapeHtml(item.name)} do bolso" title="Tirar do bolso">×</button>
    </article>`).join("");
}

function renderClipboardEntries(limit = 4) {
  if (clipboardEntries.length === 0) return '<small class="empty-copy">Sua área de transferência guardada aparece aqui.</small>';
  const sorted = [...clipboardEntries].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.addedAt - a.addedAt);
  return sorted.slice(0, limit).map((entry) => `
    <div class="clipboard-row">
      <button class="clipboard-entry" data-action="copy-clipboard" data-clipboard-id="${escapeHtml(entry.id)}" title="Copiar novamente"><span>¶</span><small>${escapeHtml(entry.text.replace(/\s+/g, " ").slice(0, 150))}</small></button>
      <button class="clipboard-pin ${entry.pinned ? "is-pinned" : ""}" data-action="toggle-clipboard-pin" data-clipboard-id="${escapeHtml(entry.id)}" aria-label="${entry.pinned ? "Desafixar" : "Fixar"}" title="${entry.pinned ? "Desafixar" : "Fixar"}">⌖</button>
      <button class="clipboard-pin clipboard-remove" data-action="remove-clipboard" data-clipboard-id="${escapeHtml(entry.id)}" aria-label="Remover da prancheta" title="Remover">×</button>
    </div>`).join("");
}

function renderLauncherItems(quickLimit?: number) {
  const items = [...LAUNCHER_DEFAULTS, ...shortcuts.filter((shortcut) => !shortcut.action)];
  return items.map((item, index) => `
    <button class="launch-item ${quickLimit !== undefined && index >= quickLimit ? "home-launch-extra" : ""}" data-action="launch-item" data-launch-id="${escapeHtml(item.id)}" data-launch-name="${escapeHtml(item.name.toLowerCase())}">
      <span>${escapeHtml(item.glyph)}</span><small>${escapeHtml(item.name)}</small>
    </button>`).join("");
}

function formatDuration(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatMediaTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

function weatherCodeDescription(code: number) {
  if (code === 0) return "Céu limpo";
  if (code === 1) return "Predomínio de sol";
  if (code === 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code === 45 || code === 48) return "Neblina";
  if ([51, 53, 55, 56, 57].includes(code)) return "Garoa";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Chuva";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neve";
  if ([95, 96, 99].includes(code)) return "Trovoada";
  return "Condições variáveis";
}

function weatherCodeGlyph(code: number) {
  if (code === 0 || code === 1) return "☀";
  if (code === 2) return "◒";
  if (code === 3 || code === 45 || code === 48) return "☁";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "∿";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄";
  if ([95, 96, 99].includes(code)) return "⚡";
  return "○";
}

function weatherPlaceLabel(location: WeatherLocation) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

function weatherDayLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(value.getTime())) return date;
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit" }).format(value).replace(".", "");
}

function relativeTime(timestamp: number) {
  const delta = timestamp - Date.now();
  const minutes = Math.round(delta / 60_000);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function refreshDashboardPopupIfOpen() {
  refreshDashboardIfVisible();
}

async function searchWeatherLocations(query: string) {
  weatherQuery = query.trim().slice(0, 100);
  weatherSearchMessage = "";
  weatherSearchResults = [];
  if (weatherQuery.length < 2) {
    weatherSearchMessage = "Digite pelo menos duas letras.";
    refreshDashboardPopupIfOpen();
    return;
  }
  weatherSearchBusy = true;
  signalGhostyReaction("searching", "Procurando sua cidade");
  refreshDashboardPopupIfOpen();
  try {
    weatherSearchResults = await invoke<WeatherLocation[]>("weather_search_locations", { query: weatherQuery });
    weatherSearchMessage = weatherSearchResults.length ? "Escolha a cidade certa." : "Não encontrei essa cidade. Tente incluir o estado ou o país.";
  } catch (error) {
    weatherSearchMessage = `Não consegui buscar a cidade: ${String(error)}`;
    signalGhostyReaction("error", "A busca de cidades falhou", 2300);
  } finally {
    weatherSearchBusy = false;
    refreshDashboardPopupIfOpen();
  }
}

async function selectWeatherLocation(location: WeatherLocation) {
  weatherSnapshot = null;
  localStorage.removeItem(KEYS.weatherSnapshot);
  weatherLocation = location;
  localStorage.setItem(KEYS.weatherLocation, JSON.stringify(location));
  weatherSearchOpen = false;
  weatherSearchResults = [];
  weatherSearchMessage = "";
  weatherSnapshot = null;
  await refreshWeather();
}

async function refreshWeather() {
  if (!weatherLocation || weatherLoading || updatesPaused) return;
  weatherLoading = true;
  weatherError = "";
  refreshDashboardPopupIfOpen();
  try {
    const next = await invoke<WeatherSnapshot>("weather_get_forecast", { location: weatherLocation });
    const previous = weatherSnapshot;
    weatherSnapshot = next;
    localStorage.setItem(KEYS.weatherSnapshot, JSON.stringify(next));
    if (previous && previous.current.weatherCode !== next.current.weatherCode) {
      const description = weatherCodeDescription(next.current.weatherCode);
      const added = addDashboardNotification({
        id: `weather-${next.location.latitude.toFixed(2)}-${next.location.longitude.toFixed(2)}-${next.current.weatherCode}-${localCalendarDate(new Date(next.checkedAt))}`,
        kind: "weather",
        title: "O tempo mudou",
        body: `${weatherPlaceLabel(next.location)}: ${description.toLocaleLowerCase("pt-BR")} agora.`,
        occurredAt: next.checkedAt,
      });
      if (added) signalGhostyReaction("question", `O tempo mudou: ${description.toLocaleLowerCase("pt-BR")}`);
    } else if (!previous) {
      signalGhostyReaction("thinking", "Conferindo a previsão do tempo", 1500);
    }
  } catch (error) {
    weatherError = String(error);
    if (!weatherSnapshot) signalGhostyReaction("error", "Não consegui atualizar o clima", 2200);
  } finally {
    weatherLoading = false;
    refreshDashboardPopupIfOpen();
  }
}

function googleRandomToken(byteCount = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function startGoogleAuth() {
  if (googleAuthPollTimer !== undefined) window.clearInterval(googleAuthPollTimer);
  googleAuthPending = true;
  googleStatusMessage = "Preparando login seguro no navegador…";
  googleError = "";
  refreshGoogleSettingsUi();
  try {
    const stateValue = googleRandomToken();
    const codeVerifier = googleRandomToken(48);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const authorizationUrl = await invoke<string>("google_auth_begin", {
      stateValue,
      codeVerifier,
      codeChallenge,
    });
    await invoke("open_targets", { targets: [authorizationUrl] });
    googleStatusMessage = "Conclua o consentimento na página do Google. O Ghosty está aguardando o retorno.";
    refreshGoogleSettingsUi();
    googleAuthPollTimer = window.setInterval(() => { void pollGoogleAuth(); }, 850);
  } catch (error) {
    googleAuthPending = false;
    await invoke("google_auth_cancel").catch(() => undefined);
    googleStatusMessage = `Não consegui iniciar o login: ${String(error)}`;
    refreshGoogleSettingsUi();
  }
}

async function pollGoogleAuth() {
  if (!googleAuthPending || googlePollBusy) return;
  googlePollBusy = true;
  try {
    const progress = await invoke<GoogleAuthProgress>("google_auth_poll");
    if (progress.status === "waiting") return;
    if (googleAuthPollTimer !== undefined) window.clearInterval(googleAuthPollTimer);
    googleAuthPollTimer = undefined;
    googleAuthPending = false;
    if (progress.status === "connected") {
      googleAccount = { connected: true, email: progress.email, configured: true };
      googleStatusMessage = `Google conectado como ${progress.email ?? "sua conta"}.`;
      googleError = "";
      refreshGoogleSettingsUi();
      signalGhostyReaction("finished", "Sua conta Google está conectada", 1600);
      void refreshGoogleSnapshot();
    } else if (progress.status === "error") {
      googleStatusMessage = progress.message ?? "O login não foi concluído.";
      googleError = googleStatusMessage;
      refreshGoogleSettingsUi();
      signalGhostyReaction("error", "O login do Google não foi concluído", 2200);
    }
  } catch (error) {
    googleStatusMessage = `Não consegui verificar o login: ${String(error)}`;
    googleError = googleStatusMessage;
    googleAuthPending = false;
    await invoke("google_auth_cancel").catch(() => undefined);
    if (googleAuthPollTimer !== undefined) window.clearInterval(googleAuthPollTimer);
    googleAuthPollTimer = undefined;
    refreshGoogleSettingsUi();
  } finally {
    googlePollBusy = false;
  }
}

async function cancelGoogleAuth() {
  if (googleAuthPollTimer !== undefined) window.clearInterval(googleAuthPollTimer);
  googleAuthPollTimer = undefined;
  googleAuthPending = false;
  await invoke("google_auth_cancel").catch(() => undefined);
  googleStatusMessage = "Login cancelado. Você pode tentar novamente quando quiser.";
  refreshGoogleSettingsUi();
}

function applyGoogleSnapshot(snapshot: GoogleSnapshot | null, processNotifications = false) {
  const previous = googleSnapshot;
  googleSnapshot = snapshot;
  if (snapshot) {
    googleAccount = { connected: true, email: snapshot.email, configured: googleAccount.configured };
    googleStatusMessage = `Google conectado como ${snapshot.email}.`;
    googleError = "";
    if (processNotifications && currentWindowLabel === "main") {
      const previousMessageIds = new Set(previous?.messages.map((message) => message.id) ?? []);
      const newMessages = previous ? snapshot.messages.filter((message) => !previousMessageIds.has(message.id)) : [];
      let emailNotificationCount = 0;
      for (const message of newMessages.slice(0, 6)) {
        const sender = message.sender.split("<")[0].trim().replace(/^"|"$/g, "") || "Novo remetente";
        const added = addDashboardNotification({
          id: `google-email-${message.id}`,
          kind: "email",
          title: sender.slice(0, 100),
          body: message.subject || "Nova mensagem não lida",
          occurredAt: message.receivedAt,
          target: message.webUrl,
        });
        if (added) emailNotificationCount += 1;
      }

      const now = Date.now();
      let upcomingEventCount = 0;
      for (const event of snapshot.events) {
        if (!event.allDay) {
          const startsAt = Date.parse(event.startsAt);
          const delta = startsAt - now;
          if (Number.isFinite(startsAt) && delta > 0 && delta <= 20 * 60_000) {
            const added = addDashboardNotification({
              id: `google-event-${event.id}-${event.startsAt}`,
              kind: "calendar",
              title: "Compromisso em breve",
              body: `${event.title} · ${formatGoogleTime(event.startsAt)}`,
              occurredAt: now,
              target: event.joinUrl ?? event.webUrl ?? undefined,
            });
            if (added) upcomingEventCount += 1;
          }
        }
      }

      let dueTaskCount = 0;
      for (const task of snapshot.tasks) {
        if (!task.dueAt) continue;
        const dueDay = task.dueAt.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDay)) continue;
        const todayDay = localCalendarDate(new Date());
        if (dueDay > todayDay) continue;
        const overdue = dueDay < todayDay;
        const added = addDashboardNotification({
          id: `google-task-${task.id}-${dueDay}`,
          kind: "task",
          title: overdue ? "Tarefa atrasada" : "Tarefa para hoje",
          body: task.title,
          occurredAt: now,
          target: "https://tasks.google.com/",
        });
        if (added) dueTaskCount += 1;
      }
      const reactionDetails: string[] = [];
      if (emailNotificationCount) reactionDetails.push(`${emailNotificationCount} ${emailNotificationCount === 1 ? "e-mail novo" : "e-mails novos"}`);
      if (upcomingEventCount) reactionDetails.push(`${upcomingEventCount} ${upcomingEventCount === 1 ? "compromisso próximo" : "compromissos próximos"}`);
      if (dueTaskCount) reactionDetails.push(`${dueTaskCount} ${dueTaskCount === 1 ? "tarefa com prazo" : "tarefas com prazo"}`);
      if (reactionDetails.length) {
        signalGhostyReaction(upcomingEventCount && !emailNotificationCount && !dueTaskCount ? "thinking" : "question", `O Ghosty encontrou ${reactionDetails.join(" e ")}.`, 2200);
      }
    }
  } else {
    googleSnapshot = null;
    googleAccount = { connected: false, email: null, configured: googleAccount.configured };
    googleStatusMessage = "Google desconectado neste dispositivo.";
  }
  refreshDashboardIfVisible();
  if (currentWindowLabel === "settings-window") refreshGoogleSettingsUi();
}

async function refreshGoogleSnapshot(forceAfterCurrent = false) {
  if (!googleAccount.connected || updatesPaused) return;
  if (googleLoading) {
    if (forceAfterCurrent) googleRefreshRequested = true;
    return;
  }
  googleLoading = true;
  googleError = "";
  refreshDashboardIfVisible();
  try {
    const snapshot = await invoke<GoogleSnapshot>("google_refresh");
    applyGoogleSnapshot(snapshot, true);
  } catch (error) {
    reportGoogleError(error, !googleSnapshot);
  } finally {
    googleLoading = false;
    refreshDashboardIfVisible();
    if (currentWindowLabel === "settings-window") refreshGoogleSettingsUi();
    if (googleRefreshRequested) {
      googleRefreshRequested = false;
      window.setTimeout(() => void refreshGoogleSnapshot(), 0);
    }
  }
}

function reportGoogleError(error: unknown, react = false) {
  googleError = String(error);
  googleStatusMessage = googleError;
  void emit("edge-ghosty-google-error", googleError).catch(() => undefined);
  if (react) signalGhostyReaction("error", "Não consegui atualizar seus painéis do Google", 2200);
  refreshDashboardIfVisible();
  if (currentWindowLabel === "settings-window") refreshGoogleSettingsUi();
}

async function loadGoogleWorkspace(refresh: boolean) {
  try {
    const [account, snapshot] = await Promise.all([
      invoke<GoogleAccountStatus>("google_account_status"),
      invoke<GoogleSnapshot | null>("google_cached_snapshot"),
    ]);
    googleAccount = account;
    googleSnapshot = snapshot;
    googleStatusMessage = account.connected
      ? `Google conectado como ${account.email ?? "sua conta"}.`
      : account.configured
        ? "Conecte sua conta Google para ativar E-mail, Agenda e Tarefas."
        : "A conexão Google ainda não está disponível nesta versão do Ghosty.";
    refreshDashboardIfVisible();
    if (currentWindowLabel === "settings-window") refreshGoogleSettingsUi();
    if (refresh && account.connected && !updatesPaused) void refreshGoogleSnapshot();
  } catch (error) {
    reportGoogleError(`Não consegui consultar a conexão Google: ${String(error)}`);
  } finally {
    googleStatusLoading = false;
    refreshGoogleSettingsUi();
  }
}

async function disconnectGoogleWorkspace() {
  if (!window.confirm(`Remover a conexão Google${googleAccount.email ? ` de ${googleAccount.email}` : ""} deste dispositivo?`)) return;
  try {
    await invoke("google_clear_account");
    applyGoogleSnapshot(null);
    dashboardNotifications = dashboardNotifications.filter((item) => !["email", "calendar", "task"].includes(item.kind));
    persistDashboardNotifications();
    googleStatusMessage = "Token removido deste dispositivo. Para revogar também a autorização da conta, abra a segurança da sua Conta Google.";
    googleError = "";
    if (currentWindowLabel === "settings-window") renderSettingsWindow();
    signalGhostyReaction("finished", "A conexão Google foi removida", 1400);
  } catch (error) {
    reportGoogleError(error);
  }
}

function formatGoogleTime(value: string, allDay = false) {
  const date = allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Horário indisponível";
  return new Intl.DateTimeFormat("pt-BR", allDay
    ? { weekday: "short", day: "2-digit", month: "short" }
    : { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date).replace(".", "");
}

function localCalendarDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function formatGoogleDueDate(value: string) {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Data indisponível";
  return formatGoogleTime(day, true);
}

async function runGoogleMessageAction(message: GoogleEmailMessage, action: "read" | "archive") {
  if (action === "archive" && !window.confirm(`Arquivar “${message.subject}” no Gmail?`)) return;
  try {
    await invoke("google_mark_message", { messageId: message.id, action });
    if (googleSnapshot) {
      googleSnapshot = {
        ...googleSnapshot,
        unreadCount: Math.max(0, googleSnapshot.unreadCount - 1),
        messages: googleSnapshot.messages.filter((item) => item.id !== message.id),
      };
    }
    const notification = dashboardNotifications.find((item) => item.id === `google-email-${message.id}`);
    if (notification) markDashboardNotificationRead(notification.id);
    refreshDashboardIfVisible();
    await refreshGoogleSnapshot(true);
    signalGhostyReaction("finished", action === "read" ? "E-mail marcado como lido" : "E-mail arquivado", 1300);
  } catch (error) {
    reportGoogleError(error);
    signalGhostyReaction("error", "Não consegui atualizar esse e-mail", 2100);
  }
}

async function completeGoogleTask(task: GoogleTask) {
  try {
    await invoke("google_complete_task", { listId: task.listId, taskId: task.id });
    if (googleSnapshot) googleSnapshot = { ...googleSnapshot, tasks: googleSnapshot.tasks.filter((item) => item.id !== task.id) };
    const notification = dashboardNotifications.find((item) => item.id.startsWith(`google-task-${task.id}-`));
    if (notification) markDashboardNotificationRead(notification.id);
    refreshDashboardIfVisible();
    signalGhostyReaction("finished", `Tarefa concluída: ${task.title}`, 1900);
    await refreshGoogleSnapshot(true);
  } catch (error) {
    reportGoogleError(error);
    signalGhostyReaction("error", "Não consegui concluir essa tarefa", 2100);
  }
}

async function addGoogleTask(title: string) {
  try {
    const created = await invoke<GoogleTask>("google_add_task", { title: title.trim() });
    if (googleSnapshot) googleSnapshot = { ...googleSnapshot, tasks: [created, ...googleSnapshot.tasks] };
    refreshDashboardIfVisible();
    signalGhostyReaction("finished", `Adicionei a tarefa ${title.trim()}`, 1600);
    await refreshGoogleSnapshot(true);
    return true;
  } catch (error) {
    reportGoogleError(error);
    signalGhostyReaction("error", "Não consegui adicionar essa tarefa", 2100);
    return false;
  }
}

function dashboardUnreadCount() {
  return dashboardNotifications.filter((notification) => !notification.read).length;
}

function dashboardNotificationIcon(kind: DashboardNotification["kind"]) {
  return kind === "email" ? "@" : kind === "calendar" ? "◷" : kind === "task" ? "✓" : kind === "weather" ? "☁" : "•";
}

function renderDashboardOverview() {
  const notificationCount = dashboardUnreadCount();
  const weatherSummary = weatherSnapshot
    ? `${Math.round(weatherSnapshot.current.temperatureC)}° · ${weatherCodeDescription(weatherSnapshot.current.weatherCode)}`
    : weatherLocation ? "Atualizando a previsão" : "Escolha uma cidade";
  const nextEvent = googleSnapshot?.events.find((event) => event.allDay || Date.parse(event.startsAt) > Date.now());
  const cards: Array<{ view: DashboardView; title: string; summary: string; glyph: string }> = [
    { view: "email", title: "E-mail", summary: googleAccount.connected ? `${googleSnapshot?.unreadCount ?? 0} não lidos · ${googleAccount.email}` : "Conectar Gmail", glyph: "@" },
    { view: "calendar", title: "Agenda", summary: nextEvent ? `${nextEvent.title} · ${formatGoogleTime(nextEvent.startsAt, nextEvent.allDay)}` : googleAccount.connected ? "Sem próximos compromissos" : "Conectar Agenda", glyph: "◷" },
    { view: "tasks", title: "Tarefas", summary: googleAccount.connected ? `${googleSnapshot?.tasks.length ?? 0} pendentes` : "Conectar Google Tarefas", glyph: "✓" },
    { view: "weather", title: "Clima", summary: weatherSummary, glyph: weatherSnapshot ? weatherCodeGlyph(weatherSnapshot.current.weatherCode) : "☁" },
  ];
  return `
    <section class="dashboard-overview">
      <div class="dashboard-welcome"><div class="dashboard-pet">${renderPetCharacter("dashboard-ghosty")}</div><div><span class="section-kicker">SEU DIA, DE RELANCE</span><strong>Oi, ${escapeHtml(petName)} está por aqui.</strong><small>Seus painéis ficam reunidos neste espaço.</small></div></div>
      <div class="dashboard-overview-grid">${cards.map((card) => `<button class="dashboard-overview-card" data-action="dashboard-view" data-dashboard-view="${card.view}"><span class="dashboard-overview-glyph">${card.glyph}</span><span><strong>${card.title}</strong><small>${escapeHtml(card.summary)}</small></span><span class="dashboard-chevron">›</span></button>`).join("")}</div>
      <button class="dashboard-notification-summary" data-action="dashboard-view" data-dashboard-view="notifications"><span class="dashboard-overview-glyph">•</span><span><strong>Notificações</strong><small>${notificationCount ? `${notificationCount} novas` : "Tudo em dia por enquanto"}</small></span><span class="dashboard-chevron">›</span></button>
      ${weatherSnapshot ? `<small class="dashboard-attribution">Dados meteorológicos por Open-Meteo</small>` : ""}
    </section>`;
}

function renderDashboardConnectView(title: string, description: string, glyph: string) {
  return `<section class="dashboard-connect-view"><span class="dashboard-connect-glyph">${glyph}</span><span class="section-kicker">PAINEL DO GHOSTY</span><h2>${title}</h2><p>${googleStatusLoading ? "Verificando o estado da conexão…" : description}</p>${googleError ? `<small class="dashboard-inline-error" role="status">${escapeHtml(googleError)}</small>` : ""}<button class="utility-primary-action" data-action="dashboard-open-settings">${googleStatusLoading ? "Aguarde…" : "Conectar Google"}</button><small>O login abre no navegador. Gmail mostra remetente e assunto; o Ghosty não baixa o corpo das mensagens.</small></section>`;
}

function renderDashboardGoogleError() {
  return googleError ? `<small class="dashboard-inline-error" role="status">${escapeHtml(googleError)}</small>` : "";
}

function renderGooglePanelActions() {
  return `<div class="dashboard-panel-actions"><small class="google-account-label" title="${escapeHtml(googleAccount.email ?? "")}">${escapeHtml(googleAccount.email ?? "Google")}</small><button class="weather-icon-action" data-action="google-refresh" aria-label="Atualizar painel" title="Atualizar" ${googleLoading || updatesPaused ? "disabled" : ""}>${googleLoading ? "…" : "↻"}</button></div>`;
}

function renderGoogleEmailPanel() {
  if (!googleAccount.connected) return renderDashboardConnectView("Gmail", "Conecte a conta Google para ver mensagens não lidas, marcar como lidas e arquivar mensagens.", "@");
  const messages = googleSnapshot?.messages ?? [];
  return `<section class="dashboard-google-panel"><div class="dashboard-panel-heading"><div><span class="section-kicker">GMAIL · ${googleSnapshot?.unreadCount ?? 0} NÃO LIDOS</span><h2>Caixa de entrada</h2></div>${renderGooglePanelActions()}</div>${renderDashboardGoogleError()}
    ${!googleSnapshot ? `<div class="dashboard-weather-loading">${googleLoading ? "Buscando mensagens…" : "Carregando mensagens…"}</div>` : messages.length ? `<div class="google-message-list">${messages.map((message) => `<article class="google-message"><div class="google-message-copy"><strong title="${escapeHtml(message.sender)}">${escapeHtml(message.sender)}</strong><small title="${escapeHtml(message.subject)}">${escapeHtml(message.subject)}</small><time>${escapeHtml(relativeTime(message.receivedAt))}</time></div><div class="google-message-actions"><button data-action="google-open-message" data-message-id="${escapeHtml(message.id)}" title="Abrir no Gmail" aria-label="Abrir mensagem">↗</button><button data-action="google-mark-message" data-message-id="${escapeHtml(message.id)}" title="Marcar como lida" aria-label="Marcar como lida">✓</button><button data-action="google-archive-message" data-message-id="${escapeHtml(message.id)}" title="Arquivar" aria-label="Arquivar">⌑</button></div></article>`).join("")}</div>` : `<div class="dashboard-empty"><span>@</span><strong>Caixa em dia</strong><small>Não há mensagens não lidas na caixa de entrada.</small></div>`}
    <button class="google-open-service" data-action="google-open-service" data-service="mail">Abrir Gmail <span>↗</span></button></section>`;
}

function renderGoogleCalendarPanel() {
  if (!googleAccount.connected) return renderDashboardConnectView("Agenda", "Veja os próximos compromissos, horários, locais e links de reunião da sua agenda Google.", "◷");
  const events = googleSnapshot?.events ?? [];
  return `<section class="dashboard-google-panel"><div class="dashboard-panel-heading"><div><span class="section-kicker">GOOGLE AGENDA · PRÓXIMOS 14 DIAS</span><h2>Seus compromissos</h2></div>${renderGooglePanelActions()}</div>${renderDashboardGoogleError()}
    ${!googleSnapshot ? `<div class="dashboard-weather-loading">${googleLoading ? "Buscando compromissos…" : "Carregando compromissos…"}</div>` : events.length ? `<div class="google-event-list">${events.map((event) => `<article class="google-event"><div class="google-event-date"><strong>${escapeHtml(formatGoogleTime(event.startsAt, event.allDay))}</strong>${event.endsAt && !event.allDay ? `<small>até ${escapeHtml(formatGoogleTime(event.endsAt))}</small>` : ""}</div><div class="google-event-copy"><strong>${escapeHtml(event.title)}</strong>${event.location ? `<small>${escapeHtml(event.location)}</small>` : ""}${event.joinUrl ? `<button data-action="google-open-event" data-event-id="${escapeHtml(event.id)}" data-event-target="join">Entrar na reunião ↗</button>` : event.webUrl ? `<button data-action="google-open-event" data-event-id="${escapeHtml(event.id)}" data-event-target="event">Abrir evento ↗</button>` : ""}</div></article>`).join("")}</div>` : `<div class="dashboard-empty"><span>◷</span><strong>Agenda livre</strong><small>Não encontrei compromissos nos próximos 14 dias.</small></div>`}
    <button class="google-open-service" data-action="google-open-service" data-service="calendar">Abrir Google Agenda <span>↗</span></button></section>`;
}

function renderGoogleTasksPanel() {
  if (!googleAccount.connected) return renderDashboardConnectView("Tarefas", "Consulte tarefas pendentes, adicione uma tarefa rápida e marque como concluído.", "✓");
  const tasks = googleSnapshot?.tasks ?? [];
  return `<section class="dashboard-google-panel"><div class="dashboard-panel-heading"><div><span class="section-kicker">GOOGLE TAREFAS · ${tasks.length} PENDENTES</span><h2>O que falta fazer</h2></div>${renderGooglePanelActions()}</div>${renderDashboardGoogleError()}
    <form class="google-task-form" data-action="google-task-form"><input name="title" maxlength="180" placeholder="Adicionar uma tarefa" aria-label="Nova tarefa" required ${googleLoading ? "disabled" : ""} /><button type="submit" aria-label="Adicionar tarefa" ${googleLoading ? "disabled" : ""}>+</button></form>
    ${!googleSnapshot ? `<div class="dashboard-weather-loading">${googleLoading ? "Buscando tarefas…" : "Carregando tarefas…"}</div>` : tasks.length ? `<div class="google-task-list">${tasks.map((task) => `<article class="google-task"><button data-action="google-complete-task" data-task-id="${escapeHtml(task.id)}" aria-label="Concluir ${escapeHtml(task.title)}" title="Marcar como concluída"><span></span></button><div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.dueAt ? `Prazo ${formatGoogleDueDate(task.dueAt)}` : task.listTitle)}</small></div></article>`).join("")}</div>` : `<div class="dashboard-empty google-tasks-empty"><span>✓</span><strong>Tudo concluído</strong><small>Quando surgir uma pendência, adicione aqui.</small></div>`}
    <button class="google-open-service" data-action="google-open-service" data-service="tasks">Abrir Google Tarefas <span>↗</span></button></section>`;
}

function renderWeatherSearchForm() {
  return `<form class="weather-search-form" data-action="weather-search-form"><label for="weather-city">Buscar cidade</label><div><input id="weather-city" name="city" maxlength="100" value="${escapeHtml(weatherQuery)}" placeholder="Ex.: São Paulo, Brasil" autocomplete="off" ${weatherSearchBusy ? "disabled" : ""} /><button class="utility-primary-action" type="submit" ${weatherSearchBusy ? "disabled" : ""}>${weatherSearchBusy ? "Buscando…" : "Buscar"}</button></div><small>A cidade e as coordenadas são enviadas ao Open-Meteo para consultar a previsão.</small></form>`;
}

function renderWeatherSearchResults() {
  if (weatherSearchResults.length === 0) return "";
  return `<div class="weather-search-results" role="listbox" aria-label="Resultados de cidades">${weatherSearchResults.map((location, index) => `<button type="button" data-action="weather-select-location" data-weather-index="${index}" role="option"><strong>${escapeHtml(location.name)}</strong><small>${escapeHtml([location.admin1, location.country].filter(Boolean).join(", "))}</small><span>›</span></button>`).join("")}</div>`;
}

function renderWeatherPanel() {
  if (!weatherLocation) {
    return `<section class="dashboard-weather"><div class="dashboard-panel-heading"><div><span class="section-kicker">PREVISÃO LOCAL</span><h2>Clima</h2></div></div>${renderWeatherSearchForm()}${weatherSearchMessage ? `<small class="dashboard-inline-status" role="status">${escapeHtml(weatherSearchMessage)}</small>` : ""}${renderWeatherSearchResults()}</section>`;
  }
  const current = weatherSnapshot?.current;
  const snapshot = weatherSnapshot;
  return `<section class="dashboard-weather">
    <div class="dashboard-panel-heading"><div><span class="section-kicker">${updatesPaused ? "ATUALIZAÇÕES PAUSADAS" : "PREVISÃO LOCAL"}</span><h2>${escapeHtml(weatherPlaceLabel(weatherLocation))}</h2></div><div class="dashboard-panel-actions"><button class="weather-icon-action" data-action="weather-refresh" aria-label="Atualizar previsão" title="Atualizar" ${weatherLoading || updatesPaused ? "disabled" : ""}>↻</button><button class="weather-text-action" data-action="weather-change">Trocar cidade</button></div></div>
    ${weatherSearchOpen ? `${renderWeatherSearchForm()}${weatherSearchMessage ? `<small class="dashboard-inline-status" role="status">${escapeHtml(weatherSearchMessage)}</small>` : ""}${renderWeatherSearchResults()}` : ""}
    ${weatherError ? `<small class="dashboard-inline-error" role="status">${escapeHtml(weatherError)}</small>` : ""}
    ${current ? `<div class="weather-current"><span class="weather-current-glyph" aria-hidden="true">${weatherCodeGlyph(current.weatherCode)}</span><div><strong>${Math.round(current.temperatureC)}°</strong><small>${weatherCodeDescription(current.weatherCode)} · sensação ${Math.round(current.feelsLikeC)}°</small></div></div>
      <div class="weather-metrics"><span><small>Umidade</small><strong>${current.relativeHumidity}%</strong></span><span><small>Vento</small><strong>${Math.round(current.windSpeedKmh)} km/h</strong></span><span><small>Chuva agora</small><strong>${current.precipitationMm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm</strong></span></div>
      <div class="weather-forecast">${snapshot!.days.map((day) => `<article class="weather-forecast-day"><small>${escapeHtml(weatherDayLabel(day.date))}</small><span aria-hidden="true">${weatherCodeGlyph(day.weatherCode)}</span><strong>${Math.round(day.maxC)}° <i>${Math.round(day.minC)}°</i></strong>${day.precipitationProbability === null ? "" : `<small class="weather-rain">${day.precipitationProbability}% chuva</small>`}</article>`).join("")}</div>
      <small class="dashboard-attribution">Atualizado ${escapeHtml(relativeTime(snapshot!.checkedAt))} · dados por <button data-action="weather-attribution">Open-Meteo</button></small>`
      : `<div class="dashboard-weather-loading">${weatherLoading ? "Consultando a previsão…" : "A previsão ainda não carregou."}</div>`}
    </section>`;
}

function renderDashboardNotifications() {
  const items = dashboardNotifications;
  return `<section class="dashboard-notifications"><div class="dashboard-panel-heading"><div><span class="section-kicker">CENTRAL DO GHOSTY</span><h2>Notificações</h2></div><div class="dashboard-panel-actions">${items.some((item) => !item.read) ? `<button class="weather-text-action" data-action="dashboard-notifications-read">Marcar como lidas</button>` : ""}${items.length ? `<button class="weather-icon-action" data-action="dashboard-notifications-clear" aria-label="Limpar notificações" title="Limpar">×</button>` : ""}</div></div>
    ${items.length ? `<div class="dashboard-notification-list">${items.map((item) => `<article class="dashboard-notification ${item.read ? "is-read" : ""}" data-kind="${item.kind}"><span class="dashboard-notification-icon">${dashboardNotificationIcon(item.kind)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.body)}</small><time>${escapeHtml(relativeTime(item.occurredAt))}</time></div>${item.target ? `<button data-action="dashboard-notification-open" data-notification-id="${escapeHtml(item.id)}" aria-label="Abrir notificação">›</button>` : `<button data-action="dashboard-notification-read" data-notification-id="${escapeHtml(item.id)}" aria-label="Marcar como lida">✓</button>`}</article>`).join("")}</div>` : `<div class="dashboard-empty"><span>•</span><strong>Nenhuma notificação</strong><small>Novos e-mails, compromissos e lembretes aparecem aqui.</small></div>`}</section>`;
}

function renderDashboardPanel() {
  if (dashboardView === "overview") return renderDashboardOverview();
  if (dashboardView === "email") return renderGoogleEmailPanel();
  if (dashboardView === "calendar") return renderGoogleCalendarPanel();
  if (dashboardView === "tasks") return renderGoogleTasksPanel();
  if (dashboardView === "notifications") return renderDashboardNotifications();
  return renderWeatherPanel();
}

function renderDashboardPopup() {
  const views: Array<{ id: DashboardView; label: string; glyph: string }> = [
    { id: "overview", label: "Hoje", glyph: "◎" },
    { id: "email", label: "E-mail", glyph: "@" },
    { id: "calendar", label: "Agenda", glyph: "◷" },
    { id: "tasks", label: "Tarefas", glyph: "✓" },
    { id: "notifications", label: "Avisos", glyph: "•" },
    { id: "weather", label: "Clima", glyph: "☁" },
  ];
  return `<section class="dashboard-page" data-dashboard-view="${dashboardView}"><nav class="dashboard-tabs" aria-label="Painéis">${views.map((view) => `<button type="button" data-action="dashboard-view" data-dashboard-view="${view.id}" class="${dashboardView === view.id ? "is-active" : ""}" aria-current="${dashboardView === view.id ? "page" : "false"}"><span>${view.glyph}</span><small>${view.label}</small>${view.id === "notifications" && dashboardUnreadCount() ? `<i>${Math.min(99, dashboardUnreadCount())}</i>` : ""}</button>`).join("")}</nav><div class="dashboard-panel">${renderDashboardPanel()}</div></section>`;
}

function refreshDashboardIfVisible() {
  if (currentWindowLabel === "utility-popup" && utilityPopupMode === "dashboard") {
    renderUtilityPopup();
    return;
  }
  if (currentWindowLabel === "settings-window" || currentWindowLabel === "utility-popup") return;
  const unreadCount = dashboardUnreadCount();
  const menuButton = app.querySelector<HTMLButtonElement>('.menu-tabs [data-tab="panels"]');
  let badge = menuButton?.querySelector<HTMLElement>("i");
  if (menuButton && unreadCount && !badge) {
    badge = document.createElement("i");
    menuButton.append(badge);
  }
  if (badge) {
    badge.textContent = String(Math.min(99, unreadCount));
    if (!unreadCount) badge.remove();
  }
  if (activeTab !== "panels") return;
  const tabView = app.querySelector<HTMLElement>(".tab-view");
  if (!tabView) return;
  const previousScrollTop = tabView.querySelector<HTMLElement>(".dashboard-panel")?.scrollTop ?? 0;
  tabView.innerHTML = renderDashboardPopup();
  bindTabContent(tabView);
  const dashboardPanel = tabView.querySelector<HTMLElement>(".dashboard-panel");
  if (dashboardPanel) dashboardPanel.scrollTop = previousScrollTop;
}

function homeViewLabel(view: HomeView = activeHomeView) {
  return view === "activity" ? "Codex" : view === "github" ? "GitHub" : view === "vercel" ? "Vercel" : view === "media" ? "Mídia" : "Agora";
}

function renderHomePage() {
  const status = homeStatusPresentation();
  const views: Array<{ id: HomeView; label: string; accent: string; glyph: string }> = [
    { id: "now", label: "Agora", accent: "#b5bac3", glyph: "●" },
    { id: "activity", label: "Codex", accent: "#8bc7e7", glyph: "✦" },
    { id: "github", label: "GitHub", accent: "#f4505e", glyph: "⌘" },
    { id: "vercel", label: "Vercel", accent: "#7c5cff", glyph: "▲" },
    { id: "media", label: "Mídia", accent: "#22d3ee", glyph: "♫" },
  ];
  const content = activeHomeView === "activity" ? renderHomeActivity()
    : activeHomeView === "github" || activeHomeView === "vercel" ? renderHomeIntegrations()
      : activeHomeView === "media" ? renderHomeMedia()
        : renderHomeNow(status);
  const mediaArtworkStyle = activeHomeView === "media" && mediaInfo.artworkDataUrl
    ? `style="--media-artwork:url('${escapeHtml(mediaInfo.artworkDataUrl)}')"`
    : "";
  return `
    <div class="coucou-home" data-home-panel="${activeHomeView}" data-volume-mixer="${volumeMixerOpen ? "open" : "closed"}">
      <section class="coucou-focus-card" ${mediaArtworkStyle} data-home-status="${status.state}" aria-label="${homeViewLabel()}">
        <div class="coucou-focus-pet">${renderPetCharacter("pet-home")}</div>
        <div class="coucou-focus-content">${content}</div>
      </section>
      ${activeHomeView === "media" ? renderHomeMasterVolume() : ""}
      <nav class="coucou-pill-card" aria-label="Mudar cartão em destaque" ${activeHomeView === "media" && volumeMixerOpen ? 'aria-hidden="true" inert' : ""}>
        ${views.filter(({ id }) => id !== activeHomeView).map(({ id, label, accent, glyph }) => `<button class="coucou-pill" type="button" style="--pill-accent:${accent}" data-action="home-view" data-home-view="${id}" aria-label="Mostrar ${label}"><span class="coucou-pill-glyph" aria-hidden="true">${glyph}</span><span>${label}</span></button>`).join("")}
      </nav>
      ${activeHomeView === "media" ? renderAudioMixerPanel() : ""}
    </div>`;
}

function renderHomeMasterVolume() {
  return `<label class="home-master-volume" title="Volume principal do sistema">
    <span class="home-master-volume-icon" aria-hidden="true">${menuIcon("volume")}</span>
    <input id="volume" type="range" min="0" max="100" value="${volume}" aria-label="Volume principal do sistema" aria-orientation="vertical" />
    <output id="volume-value">${volume}%</output>
  </label>`;
}

function renderHomeNow(status: ReturnType<typeof homeStatusPresentation>) {
  return `<div class="coucou-card-copy home-spotlight-card" data-home-status="${status.state}">
    <div class="coucou-card-heading"><i aria-hidden="true"></i><strong>Ghosty</strong><span>Agora</span></div>
    <div class="coucou-card-status" data-home-status-label><i aria-hidden="true"></i><span>${status.label}</span></div>
    <strong class="coucou-card-title" data-home-status-title>${status.title}</strong>
    <small class="coucou-card-description" data-home-status-copy>${status.description}</small>
    <div class="coucou-card-actions">
      <button data-action="open-utility-popup" data-popup="focus">Foco</button>
      <button data-action="open-panels-tab">Painéis</button>
      <button data-action="open-utility-popup" data-popup="pocket">Bolso</button>
      <button data-action="open-utility-popup" data-popup="clipboard">Prancheta</button>
    </div>
  </div>`;
}

function renderHomeIntegrations() {
  const githubActive = activeHomeView === "github";
  const connected = githubActive ? githubConnected : vercelConnected;
  const loading = githubActive ? githubLoading : vercelLoading;
  const health = homeIntegrationHealth();
  const service = githubActive ? "GitHub" : "Vercel";
  return `<div class="coucou-card-copy coucou-integration-card">
    <div class="coucou-card-heading"><i aria-hidden="true"></i><strong>${service}</strong><span>Integração</span><button class="coucou-card-refresh" data-action="integration-refresh" aria-label="Atualizar ${service}" title="Atualizar" ${loading || updatesPaused || !connected ? "disabled" : ""}>↻</button></div>
    <div class="integration-health coucou-card-status" data-state="${health.state}" aria-live="polite"><i aria-hidden="true"></i><span>${health.label}</span></div>
    <div class="integration-card-content">${githubActive ? renderGithubContent() : renderVercelContent()}</div>
  </div>`;
}

function renderHomeActivity() {
  const totals = codexActivityTotals();
  return `<div class="coucou-card-copy coucou-codex-card">
    <div class="coucou-card-heading"><i aria-hidden="true"></i><strong>Codex</strong><span>Sessão local</span></div>
    <div class="coucou-card-status"><i aria-hidden="true"></i><span>${pendingCodexApprovals.length > 0 ? "Aprovação pendente" : codexTaskRunning ? "Trabalhando agora" : "Aguardando tarefa"}</span></div>
    <div class="coucou-card-ticker">${renderCodexRecentActivity(2)}</div>
    <div class="coucou-card-actions"><button data-action="open-utility-popup" data-popup="codex-activity">${totals.completed} tarefas concluídas <span>↗</span></button></div>
  </div>`;
}

function renderHomeMedia() {
  return `<div class="coucou-card-copy home-media-view">
    <div class="coucou-card-heading"><i aria-hidden="true"></i><strong>Mídia</strong><span>Windows</span><button class="media-mixer-toggle" type="button" data-action="media-mixer" aria-expanded="${volumeMixerOpen}" title="Abrir controles de volume por aplicativo">${volumeMixerOpen ? "Fechar mixer" : "Volume dos apps"}</button></div>
    <div class="media-player-main">
      <div class="media-track-copy"><strong class="media-title">${escapeHtml(mediaInfo.title || "Nada tocando agora")}</strong><small class="media-artist">${escapeHtml(mediaInfo.artist || "Quando algo tocar, aparece aqui")}</small></div>
    </div>
    <div class="media-progress-row"><span class="media-position">${formatMediaTime(mediaInfo.positionMs)}</span><input id="media-progress" type="range" min="0" max="${Math.max(1, mediaInfo.durationMs)}" value="${Math.min(mediaInfo.positionMs, mediaInfo.durationMs || 0)}" aria-label="Progresso da faixa" ${mediaInfo.canSeek ? "" : "disabled"} /><span class="media-duration">${formatMediaTime(mediaInfo.durationMs)}</span></div>
    <div class="coucou-media-bottom"><div class="media-controls">
        <button data-action="media-previous" aria-label="Faixa anterior" title="Anterior">${menuIcon("previous")}</button>
        <button class="media-play" data-action="media-toggle" aria-label="Reproduzir ou pausar" title="Reproduzir ou pausar"><span class="media-play-icon">${menuIcon(mediaInfo.playing ? "pause" : "play")}</span></button>
        <button data-action="media-next" aria-label="Próxima faixa" title="Próxima">${menuIcon("next")}</button>
      </div></div>
  </div>`;
}

function renderAudioMixerPanel() {
  return `<aside class="audio-mixer-panel" data-open="${volumeMixerOpen}" aria-hidden="${!volumeMixerOpen}" aria-label="Volume por aplicativo" ${volumeMixerOpen ? "" : "inert"}>
    <div class="audio-mixer-heading"><div><small>MIXER DE ÁUDIO</small><strong>Volume por app</strong></div><button type="button" data-action="media-mixer-close" aria-label="Fechar mixer">×</button></div>
    <div class="audio-app-list">${renderAudioMixerApps()}</div>
  </aside>`;
}

function renderAudioMixerApps() {
  if (audioMixerApps.length === 0) return '<p class="audio-app-empty">Abra ou retome um player para ajustar o volume dele aqui.</p>';
  return audioMixerApps.map((audioApp) => `<label class="audio-app-row" data-app-id="${audioApp.processId}">
    <span class="audio-app-name" title="${escapeHtml(audioApp.name)}"><i aria-hidden="true">${escapeHtml(audioApp.name.slice(0, 1).toUpperCase())}</i><strong>${escapeHtml(audioApp.name)}</strong></span>
    <input class="audio-app-volume" type="range" min="0" max="100" value="${audioApp.volume}" data-app-id="${audioApp.processId}" aria-label="Volume de ${escapeHtml(audioApp.name)}" aria-orientation="vertical" />
    <output>${audioApp.volume}%</output>
  </label>`).join("");
}

function homeStatusPresentation() {
  if (pendingCodexApprovals.length > 0) {
    return {
      state: "approval",
      label: "AÇÃO NECESSÁRIA",
      title: "Aprovação pendente",
      description: "Revise o pedido do Codex para continuar.",
    };
  }
  if (codexTaskRunning) {
    return {
      state: "active",
      label: "CODEX EM ATIVIDADE",
      title: "O Codex está trabalhando",
      description: "A tarefa segue em andamento no seu computador.",
    };
  }
  if (updatesPaused) {
    return {
      state: "paused",
      label: "INTEGRAÇÕES PAUSADAS",
      title: "Tudo tranquilo por aqui.",
      description: "GitHub e Vercel estão pausados; mídia e atalhos seguem prontos.",
    };
  }
  return {
    state: "ready",
    label: "TUDO PRONTO",
    title: "Tudo tranquilo por aqui.",
    description: "Música, volume e atalhos sempre à mão.",
  };
}

function refreshHomeStatusUi() {
  const card = app.querySelector<HTMLElement>(".home-spotlight-card");
  if (!card) return;
  const status = homeStatusPresentation();
  card.dataset.homeStatus = status.state;
  if (card.parentElement?.parentElement?.classList.contains("coucou-focus-card")) {
    card.parentElement.parentElement.dataset.homeStatus = status.state;
  }
  const label = card.querySelector<HTMLElement>("[data-home-status-label] span");
  const title = card.querySelector<HTMLElement>("[data-home-status-title]");
  const description = card.querySelector<HTMLElement>("[data-home-status-copy]");
  if (label) label.textContent = status.label;
  if (title) title.textContent = status.title;
  if (description) description.textContent = status.description;
}

function renderPetPage() {
  const mood = getPetMood();
  const held = pocketItems[0];
  return `
    <div class="pet-page" data-mood="${mood}" data-item-type="${held?.kind ?? "none"}">
      <section class="pet-hero-card">
        <div class="pet-stage ${pocketDropActive ? "is-dragging" : ""} ${petDropFeedback ? "has-drop-feedback" : ""}" data-dropzone="pocket" aria-label="Ghosty. Solte arquivos ou textos para guardar no Bolso.">
          <div class="pet-orbit" aria-hidden="true"><i></i><i></i><i></i><span>✦</span><span>·</span><span>✧</span></div>
          ${renderPetCharacter("pet-large")}
          <span class="pet-drop-prompt" aria-live="polite">${pocketDropActive ? "Pode soltar, eu pego!" : escapeHtml(petDropFeedback || "Arraste algo para mim")}</span>
        </div>
        <div class="pet-profile-copy">
          <span class="section-kicker">SEU COMPANHEIRO</span>
          <strong>${escapeHtml(petName)}</strong>
          <p>Um cantinho para o que você está fazendo agora.</p>
          <div class="pet-side-status" data-mood="${mood}"><i></i><span>${escapeHtml(petMoodLabel(mood))}</span></div>
          <div class="pet-side-actions">
            <button data-action="open-utility-popup" data-popup="pocket">Abrir Bolso</button>
            <button data-action="open-utility-popup" data-popup="customize">Personalizar</button>
            <button data-action="open-utility-popup" data-popup="focus">Iniciar Foco</button>
          </div>
        </div>
      </section>
      <aside class="pet-side-panel">
        <div class="pet-side-pocket">
          <div class="pet-pocket-heading"><span class="pet-pocket-icon">${menuIcon("pocket")}</span><span><small>BOLSO DO GHOSTY</small><strong>${pocketItems.length}<i>/8</i> itens guardados</strong></span><button data-action="open-utility-popup" data-popup="pocket" aria-label="Abrir Bolso">${menuIcon("chevron")}</button></div>
          <span class="pet-pocket-latest">${held ? `Mais recente · ${escapeHtml(held.name)}` : "Solte arquivos, imagens ou textos no Ghosty."}</span>
          <div class="pet-pocket-meter" aria-hidden="true"><i style="width:${Math.min(100, pocketItems.length / 8 * 100)}%"></i></div>
        </div>
        <div class="pet-companion-note"><span>✦</span><p>${pocketItems.length > 0 ? "Seu Bolso está guardado com carinho." : "Pode arrastar algo para mim. Eu guardo sem mexer no original."}</p></div>
      </aside>
    </div>`;
}

function readUtilityPopupMode(): UtilityPopupMode | null {
  const mode = localStorage.getItem(KEYS.utilityPopup);
  return mode === "focus" || mode === "focus-summary" || mode === "codex-activity" || mode === "pocket" || mode === "customize" || mode === "clipboard" || mode === "dashboard" || mode === "chat" ? mode : null;
}

function readUtilityPopupPosition(): UtilityPopupPosition | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEYS.utilityPopupPosition) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const position = value as Partial<UtilityPopupPosition>;
    if (typeof position.x !== "number" || !Number.isFinite(position.x)
      || typeof position.y !== "number" || !Number.isFinite(position.y)) return null;
    return { x: Math.round(position.x), y: Math.round(position.y) };
  } catch {
    return null;
  }
}

function flushUtilityPopupPosition() {
  if (utilityPopupPositionSaveTimer !== undefined) {
    window.clearTimeout(utilityPopupPositionSaveTimer);
    utilityPopupPositionSaveTimer = undefined;
  }
  if (latestUtilityPopupPosition) {
    localStorage.setItem(KEYS.utilityPopupPosition, JSON.stringify(latestUtilityPopupPosition));
  }
}

function quickChatModel(id = quickChatSelectedModel) {
  return quickChatModels.find((model) => model.id === id) ?? quickChatModels[0];
}

function quickChatReasoningOptions(model = quickChatModel()) {
  return model?.supportedReasoningEfforts.length
    ? model.supportedReasoningEfforts
    : [{ reasoningEffort: "low" }];
}

function quickChatSingleHttpUrl(text: string) {
  const matches = [...text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)];
  if (matches.length !== 1) return null;
  let candidate = matches[0][0].replace(/[.,!?;:]+$/, "");
  for (const [opening, closing] of [["(", ")"], ["[", "]"], ["{", "}"]] as const) {
    while (candidate.endsWith(closing)
      && candidate.split(closing).length > candidate.split(opening).length) {
      candidate = candidate.slice(0, -1);
    }
  }
  return safeQuickChatWebsiteUrl(candidate);
}

function quickChatMessageHtml(message: QuickChatMessage) {
  const text = escapeHtml(message.text).replace(/https?:\/\/[^\s<]+/g, (url) =>
    `<a href="#" data-chat-url="${url}" rel="noreferrer">${url}</a>`);
  return `<article class="quick-chat-message is-${message.role}" data-message-id="${escapeHtml(message.id)}"><div class="quick-chat-bubble">${text || (message.pending ? '<span class="quick-chat-thinking" aria-label="Ghosty está pensando"><i></i><i></i><i></i></span>' : "")}</div></article>`;
}

function quickChatApprovalHtml(approval: QuickChatApproval) {
  const params = approval.params;
  const isCommand = approval.method === "item/commandExecution/requestApproval";
  const isFileChange = approval.method === "item/fileChange/requestApproval";
  const isPermissionRequest = approval.method === "item/permissions/requestApproval";
  const network = params.networkApprovalContext && typeof params.networkApprovalContext === "object"
    ? params.networkApprovalContext as Record<string, unknown>
    : null;
  const lines: string[] = [];
  if (typeof params.command === "string") lines.push(`Comando: ${params.command}`);
  if (params.commandActions !== undefined) lines.push(`Ações do comando: ${JSON.stringify(params.commandActions, null, 2)}`);
  if (typeof params.cwd === "string") lines.push(`Pasta: ${params.cwd}`);
  if (typeof params.grantRoot === "string") lines.push(`Pasta solicitada: ${params.grantRoot}`);
  if (approval.preview) lines.push(`Alterações propostas:\n${approval.preview}`);
  if (network) lines.push(`Rede: ${String(network.host ?? "destino informado")}${network.protocol ? ` (${String(network.protocol)})` : ""}`);
  if (params.additionalPermissions !== undefined) lines.push(`Acesso adicional: ${JSON.stringify(params.additionalPermissions, null, 2)}`);
  if (isPermissionRequest && params.permissions !== undefined) lines.push(`Permissões pedidas: ${JSON.stringify(params.permissions, null, 2)}`);
  const detail = lines.join("\n") || "O Codex quer realizar uma ação que precisa da sua autorização.";
  const reason = typeof params.reason === "string" ? params.reason : "";
  const title = isCommand ? "Autorizar comando" : isFileChange ? "Autorizar alteração de arquivo" : "Autorizar acesso";
  const busy = quickChatApprovalBusy.has(String(approval.requestId));
  return `<section class="quick-chat-approval" aria-label="Pedido de permissão">
    <strong>${title}</strong>
    ${reason ? `<p>${escapeHtml(reason)}</p>` : ""}
    <pre>${escapeHtml(detail)}</pre>
    <div class="quick-chat-approval-actions">
      <button type="button" data-chat-approval="deny" data-request-id="${escapeHtml(String(approval.requestId))}" ${busy ? "disabled" : ""}>Negar</button>
      <button type="button" data-chat-approval="allow" data-request-id="${escapeHtml(String(approval.requestId))}" ${busy ? "disabled" : ""}>${busy ? "Enviando..." : "Permitir uma vez"}</button>
      <button type="button" data-chat-approval="session" data-request-id="${escapeHtml(String(approval.requestId))}" ${busy ? "disabled" : ""}>Aprovar tudo nesta sessao</button>
    </div>
  </section>`;
}

function quickChatGrantedPermissions(requested: unknown) {
  if (!requested || typeof requested !== "object") return {};
  const source = requested as Record<string, unknown>;
  const granted: Record<string, unknown> = {};
  const network = source.network && typeof source.network === "object" ? source.network as Record<string, unknown> : null;
  if (network?.enabled === true) granted.network = { enabled: true };
  const fileSystem = source.fileSystem && typeof source.fileSystem === "object" ? source.fileSystem as Record<string, unknown> : null;
  if (fileSystem) {
    const fileSystemGrant: Record<string, unknown> = {};
    for (const key of ["read", "write", "entries"] as const) {
      const value = fileSystem[key];
      if (Array.isArray(value) && value.length) fileSystemGrant[key] = value;
    }
    if (typeof fileSystem.globScanMaxDepth === "number") fileSystemGrant.globScanMaxDepth = fileSystem.globScanMaxDepth;
    if (Object.keys(fileSystemGrant).length) granted.fileSystem = fileSystemGrant;
  }
  return granted;
}

function renderQuickChatMessages() {
  let content = quickChatMessages.map(quickChatMessageHtml).join("");
  content += quickChatApprovals.map(quickChatApprovalHtml).join("");
  if (quickChatAutoApproveSession) content += `<div class="quick-chat-session-permission" role="status">Aprovação automática ativa até fechar ou reiniciar este chat.</div>`;
  else if (quickChatSessionPermissionNotice) content += `<div class="quick-chat-session-permission" role="status">${escapeHtml(quickChatSessionPermissionNotice)}</div>`;
  if (quickChatLoginPending) {
    const status = quickChatLoginCompletedAt
      ? "Login concluído. Confirmando sua conta..."
      : "Conclua o login do ChatGPT no navegador aberto. Esta janela continuará aberta.";
    content += `<div class="quick-chat-notice" role="status">${status}</div>`;
  }
  if (quickChatError) content += `<div class="quick-chat-notice is-error" role="status">${escapeHtml(quickChatError)}<button type="button" data-action="${quickChatLoginFailed ? "quick-chat-login-retry" : "quick-chat-retry"}">${quickChatLoginFailed ? "Tentar login" : quickChatServiceStarted ? "Tentar de novo" : "Reconectar"}</button></div>`;
  return content;
}

function renderQuickChatControls() {
  const selected = quickChatModel();
  const reasoning = quickChatReasoningOptions(selected);
  if (!reasoning.some((option) => option.reasoningEffort === quickChatSelectedReasoning)) {
    quickChatSelectedReasoning = selected?.defaultReasoningEffort
      ?? reasoning[0]?.reasoningEffort
      ?? "low";
    localStorage.setItem(KEYS.quickChatReasoning, quickChatSelectedReasoning);
  }
  const modelOptions = quickChatModels.map((model) =>
    `<option value="${escapeHtml(model.id)}" ${model.id === quickChatSelectedModel ? "selected" : ""}>${escapeHtml(model.displayName)}</option>`).join("");
  const reasoningOptions = reasoning.map((option) =>
    `<option value="${escapeHtml(option.reasoningEffort)}" ${option.reasoningEffort === quickChatSelectedReasoning ? "selected" : ""}>${escapeHtml(option.reasoningEffort)}</option>`).join("");
  const disabled = quickChatLoading || quickChatServiceLoading || quickChatLoginPending;
  const sendAction = quickChatLoading ? "quick-chat-cancel" : quickChatAuthenticated ? "quick-chat-send" : "quick-chat-login";
  const sendLabel = quickChatLoading ? "Interromper resposta" : quickChatAuthenticated ? "Enviar mensagem" : "Conectar ao ChatGPT";
  const permissionLabel = quickChatAutoApproveSession ? "Desativar aprovação automática" : "Aprovar tudo nesta sessão";
  const permissionTitle = quickChatAutoApproveSession
    ? "Desativar aprovação automática. Permissões já concedidas continuam válidas até reiniciar o chat."
    : "Aprovar todos os pedidos de permissão até fechar ou reiniciar o chat.";
  return `
    <label class="quick-chat-select-wrap"><span class="visually-hidden">Modelo</span><select id="quick-chat-model" aria-label="Modelo" ${disabled ? "disabled" : ""}>${modelOptions}</select></label>
    <label class="quick-chat-select-wrap"><span class="visually-hidden">Raciocínio</span><select id="quick-chat-reasoning" aria-label="Nível de raciocínio" ${disabled ? "disabled" : ""}>${reasoningOptions}</select></label>
    <button class="quick-chat-session-approval ${quickChatAutoApproveSession ? "is-active" : ""}" type="button" data-action="quick-chat-session-approval" aria-pressed="${quickChatAutoApproveSession}" aria-label="${permissionLabel}" title="${permissionTitle}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5.2-3.4 8.4-8 10-4.6-1.6-8-4.8-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg><span class="visually-hidden">${permissionLabel}</span></button>
    <button class="quick-chat-send ${quickChatLoading ? "is-stop" : ""}" type="button" data-action="${sendAction}" aria-label="${sendLabel}" title="${quickChatLoading ? "Interromper" : quickChatAuthenticated ? "Enviar" : "Conectar ao ChatGPT"}" ${quickChatServiceLoading || quickChatLoginPending ? "disabled" : ""}>${quickChatLoading ? '<span class="quick-chat-stop-icon"></span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14 18 2M7 2h11v11"/></svg>'}</button>`;
}

function paintQuickChatControls() {
  const controls = app.querySelector<HTMLElement>(".quick-chat-controls");
  if (!controls) return;
  controls.innerHTML = renderQuickChatControls();
}

function renderQuickChat() {
  const hasConversation = quickChatMessages.length > 0 || quickChatApprovals.length > 0 || !!quickChatError || quickChatLoginPending || quickChatAutoApproveSession || !!quickChatSessionPermissionNotice;
  return `
    <section class="quick-chat" data-entering="${quickChatEntryPending}" aria-label="Chat rápido do Ghosty">
      <div class="quick-chat-thread ${hasConversation ? "is-active" : "is-idle"}" role="log" aria-live="polite" aria-relevant="additions text" tabindex="0"><div class="quick-chat-messages">${renderQuickChatMessages()}</div></div>
      <div class="quick-chat-pet-mask">${renderPetCharacter("quick-chat-pet")}</div>
      <form class="quick-chat-composer" data-action="quick-chat-form" autocomplete="off">
        <input id="quick-chat-input" name="message" type="text" maxlength="8000" value="${escapeHtml(quickChatDraft)}" aria-label="Mensagem para o Ghosty" ${quickChatLoading || quickChatServiceLoading || quickChatLoginPending ? "disabled" : ""} />
      </form>
      <div class="quick-chat-controls">${renderQuickChatControls()}</div>
    </section>`;
}

function renderUtilityPopupContent(mode: UtilityPopupMode) {
  if (mode === "chat") return renderQuickChat();
  if (mode === "dashboard") return renderDashboardPopup();
  if (mode === "focus") {
    const remaining = focusRemainingMs();
    const progress = focusState.durationMs > 0 ? 100 - remaining / focusState.durationMs * 100 : 0;
    return `
      <section class="utility-focus">
        <div class="utility-focus-intro"><span class="section-kicker">TEMPO DE FOCO</span><strong>Um passo de cada vez.</strong><small>O Ghosty acompanha seu ciclo com você.</small></div>
        <button class="focus-history-link" data-action="focus-summary-open">Ver resumo dos últimos 7 dias →</button>
        <div class="utility-focus-clock" id="focus-countdown">${formatDuration(remaining)}</div>
        <div class="focus-progress utility-focus-progress"><i id="focus-progress" style="--progress:${progress}%"></i></div>
        <div class="utility-focus-controls">
          <label class="utility-focus-duration"><input id="focus-minutes" type="number" min="1" max="180" value="${Math.max(1, Math.round(focusState.durationMs / 60_000))}" ${focusState.running ? "disabled" : ""} aria-label="Duração do foco em minutos" /> minutos</label>
          <div><button class="utility-primary-action" data-action="focus-toggle">${focusState.running ? "Pausar" : remaining === 0 ? "Recomeçar" : "Iniciar foco"}</button><button class="utility-secondary-action" data-action="focus-reset" aria-label="Reiniciar temporizador" title="Reiniciar">↺</button></div>
        </div>
        <small class="focus-status utility-focus-status" id="focus-status"></small>
      </section>`;
  }
  if (mode === "focus-summary") return renderFocusSummary();
  if (mode === "codex-activity") return renderCodexActivityPopup();
  if (mode === "pocket") {
    return `
      <section class="utility-pocket">
        <div class="pocket-dropzone ${pocketDropActive ? "is-dragging" : ""}" data-dropzone="pocket"><span>↓</span><strong>${pocketDropActive ? "Pode soltar, eu pego!" : "Solte um arquivo ou texto"}</strong><small>O original continua no lugar.</small></div>
        <small class="pocket-status">${escapeHtml(pocketNotice)}</small>
        <div class="pocket-items">${renderPocketItems()}</div>
        <button class="secondary-action" data-action="pocket-clipboard">${menuIcon("plus")} Guardar texto copiado</button>
      </section>`;
  }
  if (mode === "customize") {
    return `
      <section class="utility-customize">
        <form class="pet-name-form" data-action="pet-name-form"><input name="pet-name" value="${escapeHtml(petName)}" maxlength="24" aria-label="Nome do pet" /><button class="secondary-action">Salvar nome</button></form>
        <label class="custom-label" for="pet-skin">Aparência</label>
        <select id="pet-skin"><option value="pearl" ${petSkin === "pearl" ? "selected" : ""}>Pérola</option><option value="smoke" ${petSkin === "smoke" ? "selected" : ""}>Fumaça</option><option value="midnight" ${petSkin === "midnight" ? "selected" : ""}>Meia-noite</option><option value="mint" ${petSkin === "mint" ? "selected" : ""}>Menta</option><option value="coral" ${petSkin === "coral" ? "selected" : ""}>Coral</option><option value="lavender" ${petSkin === "lavender" ? "selected" : ""}>Lavanda</option></select>
        <label class="custom-label" for="pet-accessory">Acessório</label>
        <select id="pet-accessory"><option value="none" ${petAccessory === "none" ? "selected" : ""}>Sem acessório</option><option value="star" ${petAccessory === "star" ? "selected" : ""}>Estrelinha</option><option value="bow" ${petAccessory === "bow" ? "selected" : ""}>Laço</option><option value="halo" ${petAccessory === "halo" ? "selected" : ""}>Aurora</option><option value="leaf" ${petAccessory === "leaf" ? "selected" : ""}>Folha</option><option value="crown" ${petAccessory === "crown" ? "selected" : ""}>Coroa</option></select>
      </section>`;
  }
  return `
    <section class="utility-clipboard">
      <div class="clipboard-list">${renderClipboardEntries(12)}</div>
      <small class="clipboard-status">${escapeHtml(clipboardNotice)}</small>
      <button class="secondary-action clipboard-capture" data-action="clipboard-capture">${menuIcon("plus")} Capturar texto</button>
    </section>`;
}

function renderUtilityPopup() {
  const previousMode = utilityPopupMode;
  utilityPopupMode = readUtilityPopupMode();
  if (previousMode === "chat" && utilityPopupMode !== "chat") void stopQuickChatSession();
  if (!utilityPopupMode) {
    app.innerHTML = "";
    return;
  }
  if (utilityPopupMode === "chat") {
    app.innerHTML = `<main class="utility-popup-window quick-chat-window" data-popup="chat">${renderQuickChat()}</main>`;
    bindUtilityPopup();
    bindPetInteractions(app);
    if (quickChatEntryPending) {
      window.setTimeout(() => {
        quickChatEntryPending = false;
        const chat = app.querySelector<HTMLElement>(".quick-chat");
        chat?.setAttribute("data-entering", "false");
        app.querySelector<HTMLInputElement>("#quick-chat-input")?.focus();
      }, 760);
    }
    if (!quickChatServiceStarted && !quickChatServiceLoading) void startQuickChatSession();
    if (quickChatStickToBottom) scrollQuickChatToBottom();
    return;
  }
  const copy: Record<UtilityPopupMode, { title: string; subtitle: string }> = {
    focus: { title: "Foco", subtitle: "Seu tempo, no seu ritmo" },
    "focus-summary": { title: "Resumo de Foco", subtitle: "Seu ritmo nos últimos sete dias" },
    "codex-activity": { title: "Atividade do Codex", subtitle: "Contagens locais dos últimos sete dias" },
    pocket: { title: `Bolso do ${petName}`, subtitle: `${pocketItems.length}/8 itens · os originais ficam no lugar` },
    customize: { title: "Personalizar o Ghosty", subtitle: "Nome, aparência e acessório" },
    clipboard: { title: "Prancheta", subtitle: `${clipboardEntries.length} itens recentes` },
    dashboard: { title: "Painéis do Ghosty", subtitle: "Seu dia em um só lugar" },
    chat: { title: "", subtitle: "" },
  };
  const heading = copy[utilityPopupMode];
  app.innerHTML = `
    <main class="utility-popup-window" data-popup="${utilityPopupMode}">
      <section class="utility-popup-card">
        <header class="utility-popup-header">
          <div class="utility-popup-drag-handle"><span class="section-kicker">EDGE GHOSTY</span><strong>${escapeHtml(heading.title)}</strong><small data-popup-subtitle>${escapeHtml(heading.subtitle)}</small></div>
          <button class="utility-popup-close" data-action="popup-close" aria-label="Fechar popup" title="Fechar">${menuIcon("close")}</button>
        </header>
        <div class="utility-popup-body">${renderUtilityPopupContent(utilityPopupMode)}</div>
      </section>
    </main>`;
  bindUtilityPopup();
  if (utilityPopupMode === "focus") paintFocusTimer();
  if (utilityPopupMode === "dashboard") {
    bindPetInteractions(app);
    if (weatherLocation && !weatherLoading && (!weatherSnapshot || Date.now() - weatherSnapshot.checkedAt > 30 * 60_000)) void refreshWeather();
    if (googleAccount.connected && !googleLoading && (!googleSnapshot || Date.now() - googleSnapshot.checkedAt > 5 * 60_000)) void refreshGoogleSnapshot();
  }
}

function bindUtilityPopup() {
  const popup = app.querySelector<HTMLElement>(".utility-popup-window");
  if (!popup) return;
  if (utilityPopupMode === "chat") {
    bindQuickChatPopup(popup);
    return;
  }
  popup.querySelector("[data-action=popup-close]")?.addEventListener("click", () => void closeUtilityPopup());
  popup.querySelector<HTMLElement>(".utility-popup-drag-handle")?.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    void getCurrentWindow().startDragging().catch((error) => console.error("NÃ£o consegui mover o popup", error));
  });
  if (utilityPopupMode === "focus") {
    popup.querySelector("[data-action=focus-toggle]")?.addEventListener("click", startFocus);
    popup.querySelector("[data-action=focus-summary-open]")?.addEventListener("click", () => void openUtilityPopup("focus-summary"));
    popup.querySelector("[data-action=focus-reset]")?.addEventListener("click", resetFocus);
    popup.querySelector<HTMLInputElement>("#focus-minutes")?.addEventListener("change", (event) => {
      if (focusState.running) return;
      focusState.durationMs = Math.max(1, Math.min(180, Number((event.target as HTMLInputElement).value) || 25)) * 60_000;
      focusState.remainingMs = focusState.durationMs;
      persistFocus();
      paintFocusTimer();
    });
  }
  if (utilityPopupMode === "focus-summary") bindFocusSummary(popup);
  if (utilityPopupMode === "codex-activity") bindCodexActivityPopup(popup);
  if (utilityPopupMode === "pocket") {
    popup.querySelectorAll<HTMLElement>("[data-dropzone=pocket]").forEach(bindPocketDropzone);
    popup.querySelectorAll<HTMLButtonElement>("[data-action=pocket-clipboard]").forEach((button) => button.addEventListener("click", () => void captureClipboardText(true)));
    bindPocketItemActions(popup);
  }
  if (utilityPopupMode === "clipboard") {
    popup.querySelector("[data-action=clipboard-capture]")?.addEventListener("click", () => void captureClipboardText());
    bindClipboardEntryActions(popup);
  }
  if (utilityPopupMode === "customize") {
    popup.querySelector<HTMLFormElement>("[data-action=pet-name-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const input = form.elements.namedItem("pet-name") as HTMLInputElement;
      petName = input.value.trim().slice(0, 24) || "Ghosty";
      localStorage.setItem(KEYS.petName, petName);
      updatePetAtmosphere();
      renderUtilityPopup();
    });
    popup.querySelector<HTMLSelectElement>("#pet-skin")?.addEventListener("change", (event) => {
      petSkin = (event.target as HTMLSelectElement).value as PetSkin;
      localStorage.setItem(KEYS.petSkin, petSkin);
      updatePetAtmosphere();
    });
    popup.querySelector<HTMLSelectElement>("#pet-accessory")?.addEventListener("change", (event) => {
      petAccessory = (event.target as HTMLSelectElement).value as PetAccessory;
      localStorage.setItem(KEYS.petAccessory, petAccessory);
      updatePetAtmosphere();
    });
  }
  if (utilityPopupMode === "dashboard") bindDashboardPopup(popup);
}

function selectDashboardView(view: DashboardView) {
  dashboardView = view;
  localStorage.setItem(KEYS.dashboardView, view);
  refreshDashboardIfVisible();
  if (view === "weather" && weatherLocation && (!weatherSnapshot || Date.now() - weatherSnapshot.checkedAt > 30 * 60_000)) void refreshWeather();
}

function markDashboardNotificationRead(id?: string) {
  dashboardNotifications = dashboardNotifications.map((notification) =>
    !id || notification.id === id ? { ...notification, read: true } : notification);
  persistDashboardNotifications();
  refreshDashboardIfVisible();
}

function bindDashboardPopup(popup: HTMLElement) {
  popup.querySelectorAll<HTMLButtonElement>("[data-action=dashboard-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.dashboardView;
      if (view === "overview" || view === "email" || view === "calendar" || view === "tasks" || view === "notifications" || view === "weather") selectDashboardView(view);
    });
  });
  popup.querySelector("[data-action=dashboard-open-settings]")?.addEventListener("click", () => openSettingsWindow("panels"));
  popup.querySelector<HTMLFormElement>("[data-action=weather-search-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem("city") as HTMLInputElement;
    void searchWeatherLocations(input.value);
  });
  popup.querySelectorAll<HTMLButtonElement>("[data-action=weather-select-location]").forEach((button) => {
    button.addEventListener("click", () => {
      const location = weatherSearchResults[Number(button.dataset.weatherIndex)];
      if (location) void selectWeatherLocation(location);
    });
  });
  popup.querySelector("[data-action=weather-change]")?.addEventListener("click", () => {
    weatherSearchOpen = true;
    weatherSearchMessage = "";
    weatherSearchResults = [];
    renderUtilityPopup();
    app.querySelector<HTMLInputElement>("#weather-city")?.focus();
  });
  popup.querySelector("[data-action=weather-refresh]")?.addEventListener("click", () => void refreshWeather());
  popup.querySelector("[data-action=weather-attribution]")?.addEventListener("click", () => {
    void invoke("open_targets", { targets: ["https://open-meteo.com/"] }).catch(() => undefined);
  });
  popup.querySelectorAll<HTMLButtonElement>("[data-action=dashboard-notification-read]").forEach((button) => {
    button.addEventListener("click", () => markDashboardNotificationRead(button.dataset.notificationId));
  });
  popup.querySelector("[data-action=dashboard-notifications-read]")?.addEventListener("click", () => {
    markDashboardNotificationRead();
    signalGhostyReaction("thinking", "Todos os avisos foram conferidos", 1300);
  });
  popup.querySelector("[data-action=dashboard-notifications-clear]")?.addEventListener("click", () => {
    dashboardNotifications = [];
    persistDashboardNotifications();
    renderUtilityPopup();
    signalGhostyReaction("thinking", "A caixa de avisos está limpa", 1300);
  });
  popup.querySelectorAll<HTMLButtonElement>("[data-action=dashboard-notification-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const notification = dashboardNotifications.find((item) => item.id === button.dataset.notificationId);
      if (!notification) return;
      markDashboardNotificationRead(notification.id);
      if (notification.target) void invoke("open_targets", { targets: [notification.target] }).catch((error) => {
        signalGhostyReaction("error", `Não consegui abrir este aviso: ${String(error)}`, 2300);
      });
    });
  });
  popup.querySelectorAll<HTMLButtonElement>("[data-action=google-refresh]").forEach((button) => button.addEventListener("click", () => void refreshGoogleSnapshot()));
  popup.querySelectorAll<HTMLButtonElement>("[data-action=google-open-message]").forEach((button) => button.addEventListener("click", () => {
    const message = googleSnapshot?.messages.find((item) => item.id === button.dataset.messageId);
    const target = message && safeQuickChatWebsiteUrl(message.webUrl);
    if (target) void invoke("open_targets", { targets: [target] }).catch((error) => {
      googleError = String(error);
      renderUtilityPopup();
    });
  }));
  popup.querySelectorAll<HTMLButtonElement>("[data-action=google-mark-message], [data-action=google-archive-message]").forEach((button) => button.addEventListener("click", () => {
    const message = googleSnapshot?.messages.find((item) => item.id === button.dataset.messageId);
    if (message) void runGoogleMessageAction(message, button.dataset.action === "google-archive-message" ? "archive" : "read");
  }));
  popup.querySelectorAll<HTMLButtonElement>("[data-action=google-open-event]").forEach((button) => button.addEventListener("click", () => {
    const item = googleSnapshot?.events.find((event) => event.id === button.dataset.eventId);
    const candidate = button.dataset.eventTarget === "join" ? item?.joinUrl : item?.webUrl;
    const target = candidate && safeQuickChatWebsiteUrl(candidate);
    if (target) void invoke("open_targets", { targets: [target] }).catch((error) => {
      googleError = String(error);
      renderUtilityPopup();
    });
  }));
  popup.querySelectorAll<HTMLButtonElement>("[data-action=google-complete-task]").forEach((button) => button.addEventListener("click", () => {
    const task = googleSnapshot?.tasks.find((item) => item.id === button.dataset.taskId);
    if (task) void completeGoogleTask(task);
  }));
  popup.querySelectorAll<HTMLFormElement>("[data-action=google-task-form]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.elements.namedItem("title") as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return;
    void addGoogleTask(title).then((added) => { if (added) input.value = ""; });
  }));
  popup.querySelectorAll<HTMLButtonElement>("[data-action=google-open-service]").forEach((button) => button.addEventListener("click", () => {
    const urls: Record<string, string> = {
      mail: "https://mail.google.com/",
      calendar: "https://calendar.google.com/",
      tasks: "https://tasks.google.com/",
    };
    const target = urls[button.dataset.service ?? ""];
    if (target) void invoke("open_targets", { targets: [target] }).catch((error) => {
      googleError = String(error);
      renderUtilityPopup();
    });
  }));
}

function bindFocusSummary(container: ParentNode) {
  container.querySelector("[data-action=focus-summary-back]")?.addEventListener("click", () => void openUtilityPopup("focus"));
  container.querySelector("[data-action=focus-history-clear]")?.addEventListener("click", () => {
    if (!window.confirm("Apagar todo o histórico de Foco deste dispositivo?")) return;
    focusHistory = [];
    persistFocusHistory();
    paintFocusSummary();
  });
}

function paintFocusSummary() {
  if (utilityPopupMode !== "focus-summary") return;
  const body = app.querySelector<HTMLElement>(".utility-popup-body");
  if (!body) return;
  body.innerHTML = renderFocusSummary();
  bindFocusSummary(body);
}

function bindCodexActivityPopup(container: ParentNode) {
  container.querySelector<HTMLButtonElement>("[data-action=clear-codex-activity]")?.addEventListener("click", () => {
    if (!window.confirm("Apagar o resumo local de atividade do Codex deste dispositivo?")) return;
    codexActivity = {};
    localStorage.setItem(KEYS.codexActivity, JSON.stringify(codexActivity));
    refreshCodexActivityUi();
  });
}

function paintQuickChatMessages(forceToBottom = false) {
  const thread = app.querySelector<HTMLElement>(".quick-chat-thread");
  const list = app.querySelector<HTMLElement>(".quick-chat-messages");
  if (!thread || !list) return;
  const hasConversation = quickChatMessages.length > 0 || quickChatApprovals.length > 0 || !!quickChatError || quickChatLoginPending || quickChatAutoApproveSession || !!quickChatSessionPermissionNotice;
  const wasAtBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 28;
  thread.classList.toggle("is-active", hasConversation);
  thread.classList.toggle("is-idle", !hasConversation);
  list.innerHTML = renderQuickChatMessages();
  if (forceToBottom || quickChatStickToBottom && wasAtBottom) thread.scrollTop = thread.scrollHeight;
}

function scrollQuickChatToBottom() {
  const thread = app.querySelector<HTMLElement>(".quick-chat-thread");
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function setQuickChatPetState(state: PetState, detail = "") {
  const pet = app.querySelector<HTMLElement>(".quick-chat-pet");
  const motion = pet ? petMotionEngines.get(pet) : undefined;
  motion?.setState(state, false, detail);
}

async function answerQuickChatApproval(approval: QuickChatApproval, allow: boolean, sessionScope = false) {
  const requestKey = String(approval.requestId);
  if (quickChatApprovalBusy.has(requestKey)) return;
  quickChatApprovalBusy.add(requestKey);
  paintQuickChatMessages();
  const result = approval.method === "item/permissions/requestApproval"
    ? { permissions: allow ? quickChatGrantedPermissions(approval.params.permissions) : {}, scope: sessionScope ? "session" : "turn" }
    : { decision: allow ? sessionScope ? "acceptForSession" : "accept" : "decline" };
  try {
    await invoke("quick_chat_respond", { requestId: approval.requestId, result });
    quickChatApprovals = quickChatApprovals.filter((pending) => String(pending.requestId) !== requestKey);
    quickChatError = "";
    quickChatApprovalBusy.delete(requestKey);
    paintQuickChatMessages(true);
  } catch (error) {
    quickChatError = `Não consegui responder ao pedido de permissão: ${String(error)}`;
    quickChatApprovalBusy.delete(requestKey);
    paintQuickChatMessages();
  }
}

function enableQuickChatAutoApproveSession(exceptRequestId?: number | string) {
  quickChatAutoApproveSession = true;
  quickChatSessionPermissionNotice = "";
  paintQuickChatControls();
  paintQuickChatMessages();
  quickChatApprovals.slice().forEach((approval) => {
    if (String(approval.requestId) !== String(exceptRequestId)) void answerQuickChatApproval(approval, true, true);
  });
}

function disableQuickChatAutoApproveSession() {
  quickChatAutoApproveSession = false;
  quickChatSessionPermissionNotice = "Aprovação automática desligada; permissões já concedidas continuam ativas até reiniciar esta conversa.";
  paintQuickChatControls();
  paintQuickChatMessages();
}

function updateQuickChatSendControl() {
  const button = app.querySelector<HTMLButtonElement>(".quick-chat-send");
  if (!button) return;
  button.classList.toggle("is-stop", quickChatLoading);
  const sendLabel = quickChatLoading ? "Interromper resposta" : quickChatAuthenticated ? "Enviar mensagem" : "Conectar ao ChatGPT";
  button.dataset.action = quickChatLoading ? "quick-chat-cancel" : quickChatAuthenticated ? "quick-chat-send" : "quick-chat-login";
  button.setAttribute("aria-label", sendLabel);
  button.title = quickChatLoading ? "Interromper" : quickChatAuthenticated ? "Enviar" : "Conectar ao ChatGPT";
  button.disabled = quickChatServiceLoading || quickChatLoginPending;
  button.innerHTML = quickChatLoading
    ? '<span class="quick-chat-stop-icon"></span>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14 18 2M7 2h11v11"/></svg>';
  const input = app.querySelector<HTMLInputElement>("#quick-chat-input");
  if (input) input.disabled = quickChatLoading || quickChatServiceLoading || quickChatLoginPending;
  app.querySelectorAll<HTMLSelectElement>("#quick-chat-model, #quick-chat-reasoning").forEach((select) => { select.disabled = quickChatLoading || quickChatServiceLoading || quickChatLoginPending; });
}

function bindQuickChatPopup(popup: HTMLElement) {
  const thread = popup.querySelector<HTMLElement>(".quick-chat-thread");
  popup.addEventListener("pointermove", (event) => {
    const pet = popup.querySelector<HTMLElement>(".quick-chat-pet");
    const motion = pet ? petMotionEngines.get(pet) : undefined;
    if (!pet || !motion) return;
    const rect = pet.getBoundingClientRect();
    const x = (event.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width * 0.55);
    const y = (event.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height * 0.55);
    motion.lookAt(x, y);
  });
  popup.addEventListener("pointerleave", () => {
    const pet = popup.querySelector<HTMLElement>(".quick-chat-pet");
    if (pet) petMotionEngines.get(pet)?.lookAt(0, 0);
  });
  thread?.addEventListener("scroll", () => {
    quickChatStickToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 28;
  }, { passive: true });
  thread?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const approvalButton = target?.closest<HTMLButtonElement>("[data-chat-approval]");
    if (approvalButton) {
      event.preventDefault();
      approvalButton.closest<HTMLElement>(".quick-chat-approval")?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = true; });
      const approval = quickChatApprovals.find((pending) => String(pending.requestId) === approvalButton.dataset.requestId);
      const choice = approvalButton.dataset.chatApproval;
      if (approval && choice === "session") {
        enableQuickChatAutoApproveSession(approval.requestId);
        void answerQuickChatApproval(approval, true, true);
      } else if (approval) void answerQuickChatApproval(approval, choice === "allow");
      return;
    }
    const action = target?.closest<HTMLButtonElement>("[data-action]")?.dataset.action;
    if (action === "quick-chat-login") void beginQuickChatLogin();
    else if (action === "quick-chat-login-retry") void beginQuickChatLogin();
    else if (action === "quick-chat-retry") {
      quickChatServiceStarted = false;
      quickChatError = "";
      void startQuickChatSession();
    } else {
      const link = target?.closest<HTMLAnchorElement>("[data-chat-url]");
      if (!link) return;
      event.preventDefault();
      const url = link.dataset.chatUrl ?? "";
      if (/^https?:\/\//i.test(url)) void invoke("open_targets", { targets: [url] }).catch(() => undefined);
    }
  });
  const form = popup.querySelector<HTMLFormElement>("[data-action=quick-chat-form]");
  const input = popup.querySelector<HTMLInputElement>("#quick-chat-input");
  input?.addEventListener("input", () => { quickChatDraft = input.value; });
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendQuickChatMessage();
  });
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuickChatMessage();
    }
  });
  popup.querySelector(".quick-chat-controls")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const permissionMode = target?.closest<HTMLButtonElement>("[data-action=quick-chat-session-approval]");
    if (permissionMode) {
      event.preventDefault();
      if (quickChatAutoApproveSession) disableQuickChatAutoApproveSession();
      else enableQuickChatAutoApproveSession();
      return;
    }
    if (!target?.closest(".quick-chat-send")) return;
    if (quickChatLoading) void cancelQuickChatTurn();
    else if (!quickChatAuthenticated && !(popup.querySelector<HTMLInputElement>("#quick-chat-input")?.value.trim())) void beginQuickChatLogin();
    else void sendQuickChatMessage();
  });
  popup.addEventListener("change", (event) => {
    const select = event.target instanceof HTMLSelectElement ? event.target : null;
    if (select?.id === "quick-chat-model") {
      quickChatSelectedModel = select.value;
      localStorage.setItem(KEYS.quickChatModel, quickChatSelectedModel);
      quickChatSelectedReasoning = quickChatModel()?.defaultReasoningEffort
        ?? quickChatReasoningOptions()[0]?.reasoningEffort
        ?? "low";
      localStorage.setItem(KEYS.quickChatReasoning, quickChatSelectedReasoning);
      paintQuickChatControls();
      updateQuickChatSendControl();
    } else if (select?.id === "quick-chat-reasoning") {
      quickChatSelectedReasoning = select.value;
      localStorage.setItem(KEYS.quickChatReasoning, quickChatSelectedReasoning);
    }
  });
  if (!quickChatStatusPoll) {
    quickChatStatusPoll = window.setInterval(() => {
      if (utilityPopupMode === "chat" && quickChatLoginPending) void refreshQuickChatStatus();
    }, 1800);
  }
}

async function startQuickChatSession() {
  quickChatServiceLoading = true;
  quickChatLoginFailed = false;
  quickChatLoginCompletedAt = 0;
  quickChatError = "";
  paintQuickChatMessages();
  paintQuickChatControls();
  updateQuickChatSendControl();
  try {
    const result = await invoke<QuickChatCatalog>("quick_chat_start");
    quickChatAuthenticated = result.authenticated;
    if (Array.isArray(result.models) && result.models.length) quickChatModels = result.models;
    if (!quickChatModels.some((model) => model.id === quickChatSelectedModel)) {
      quickChatSelectedModel = quickChatModels.find((model) => model.id === "gpt-6-luna")?.id ?? quickChatModels[0].id;
      localStorage.setItem(KEYS.quickChatModel, quickChatSelectedModel);
    }
    quickChatLoginPending = false;
    quickChatServiceStarted = true;
  } catch (error) {
    quickChatError = `Não consegui iniciar o chat: ${String(error)}`;
    quickChatServiceStarted = true;
  } finally {
    quickChatServiceLoading = false;
    if (utilityPopupMode === "chat") {
      paintQuickChatMessages();
      paintQuickChatControls();
      updateQuickChatSendControl();
      if (!quickChatLoginPending) app.querySelector<HTMLInputElement>("#quick-chat-input")?.focus();
    }
  }
}

async function refreshQuickChatStatus() {
  if (quickChatStatusBusy) return;
  quickChatStatusBusy = true;
  try {
    const result = await invoke<QuickChatCatalog>("quick_chat_status");
    quickChatAuthenticated = result.authenticated;
    if (Array.isArray(result.models) && result.models.length) quickChatModels = result.models;
    if (quickChatAuthenticated) {
      quickChatLoginPending = false;
      quickChatLoginFailed = false;
      quickChatLoginCompletedAt = 0;
      quickChatError = "";
    } else if (quickChatLoginCompletedAt && Date.now() - quickChatLoginCompletedAt > 10_000) {
      quickChatLoginPending = false;
      quickChatLoginFailed = true;
      quickChatLoginCompletedAt = 0;
      quickChatError = "O login terminou, mas o Codex não confirmou sua conta. Tente conectar de novo.";
    }
    if (utilityPopupMode === "chat") {
      paintQuickChatMessages();
      paintQuickChatControls();
      updateQuickChatSendControl();
    }
  } catch {
    // O app-server pode reiniciar enquanto o fluxo de login do sistema abre o navegador.
  } finally {
    quickChatStatusBusy = false;
  }
}

async function beginQuickChatLogin() {
  if (quickChatLoginPending) return;
  quickChatLoginPending = true;
  quickChatLoginFailed = false;
  quickChatLoginCompletedAt = 0;
  quickChatError = "";
  paintQuickChatMessages();
  updateQuickChatSendControl();
  try {
    const result = await invoke<{ authUrl?: string }>("quick_chat_login");
    if (result.authUrl && /^https:\/\//i.test(result.authUrl)) {
      await invoke("open_targets", { targets: [result.authUrl] });
    } else {
      quickChatError = "O Codex não retornou o endereço de login.";
      quickChatLoginPending = false;
      quickChatLoginFailed = true;
    }
  } catch (error) {
    quickChatError = `Não consegui iniciar o login: ${String(error)}`;
    quickChatLoginPending = false;
    quickChatLoginFailed = true;
  }
  paintQuickChatMessages();
  updateQuickChatSendControl();
}

function quickChatExplicitWebsiteUrl(text: string) {
  return parseQuickChatWebsiteTarget(text)?.url ?? null;
}

function parseQuickChatWebsiteTarget(text: string): QuickChatWebsiteRequest | null {
  const query = text.trim();
  if (!query) return null;
  if (/^https?:\/\/[^\s]+$/i.test(query)) {
    const url = safeQuickChatWebsiteUrl(query);
    if (!url) return null;
    return { siteName: new URL(url).hostname, url };
  }

  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const withoutBrowserTail = normalized.replace(/\s+(?:no|na|pelo|in)\s+(?:navegador|browser)[.!?]*$/i, "");
  const command = withoutBrowserTail.match(/^(?:abre|abra|abrir|acessa|acesse|acessar|ir para|vai para|va para|visita|visite|visitar|open|go to|visit|navigate to)\s+(?:(?:o|a|os|as|the)\s+)?(.+)$/i);
  if (!command) return null;

  const target = command[1].trim()
    .replace(/^(?:site|pagina|website)(?:\s+(?:oficial|do|da|de|d[oa]))?\s+/i, "")
    .replace(/[.!?]+$/, "").trim();
  if (!target) return null;

  const normalizedName = normalizeQuickChatSiteName(target);
  const aliasUrl = QUICK_CHAT_SITE_ALIASES[normalizedName];
  if (aliasUrl) return { siteName: target, url: aliasUrl };
  const cachedUrl = quickChatWebsiteCache.get(normalizedName);
  if (cachedUrl) return { siteName: target, url: cachedUrl };
  if (/^https?:\/\/[^\s]+$/i.test(target)) {
    const url = safeQuickChatWebsiteUrl(target);
    return url ? { siteName: target, url } : null;
  }
  if (/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#][^\s]*)?$/i.test(target)) {
    const url = safeQuickChatWebsiteUrl(`https://${target}`);
    return url ? { siteName: target, url } : null;
  }
  return { siteName: target, url: null };
}

function quickChatWebsiteRequest(text: string): QuickChatWebsiteRequest | null {
  const compound = text.trim().match(/^(abre|abra|abrir|acessa|acesse|acessar|ir para|vai para|va para|visita|visite|visitar|open|go to|visit|navigate to)\s+(.+?)\s+(?:e|and)\s+(?:depois\s+)?(pesquise|pesquisar|busque|buscar|procure|procurar|procura|pesquisa|veja|ver|ache|encontre|encontrar|assista|assistir|reproduza|reproduzir|olhe|olhar|abre|abrir|acesse|acessar|search|search for|find|look up|watch|play|open|go to|navigate to)\b([\s\S]*)$/i);
  if (!compound) return parseQuickChatWebsiteTarget(text);
  const site = parseQuickChatWebsiteTarget(`${compound[1]} ${compound[2]}`);
  const continuation = `${compound[3]}${compound[4] ?? ""}`.trim();
  return site && continuation ? { ...site, continuation } : null;
}

function quickChatCompoundWebsiteRequest(text: string) {
  const request = quickChatWebsiteRequest(text);
  return request?.continuation ? request : null;
}

function isExplicitQuickChatAction(text: string) {
  const query = text.trim();
  if (!query) return false;
  const websiteRequest = quickChatWebsiteRequest(query);
  return /^(?:iniciar|começar|abrir) foco$/i.test(query)
    || shortcuts.some((item) => query.toLocaleLowerCase() === item.name.toLocaleLowerCase()
      || query.toLocaleLowerCase() === `abrir ${item.name}`.toLocaleLowerCase())
    || (websiteRequest !== null && !websiteRequest.continuation);
}

function runExplicitQuickChatAction(text: string) {
  const query = text.trim();
  if (!query) return false;
  if (/^(?:iniciar|começar|abrir) foco$/i.test(query)) {
    if (!focusState.running) startFocus();
    void openUtilityPopup("focus");
    quickChatMessages.push({ id: makeId(), role: "assistant", text: "Abri seu temporizador de foco." });
    return true;
  }
  const shortcut = shortcuts.find((item) => query.toLocaleLowerCase() === item.name.toLocaleLowerCase()
    || query.toLocaleLowerCase() === `abrir ${item.name}`.toLocaleLowerCase());
  if (shortcut) {
    launchShortcut(shortcut);
    quickChatMessages.push({ id: makeId(), role: "assistant", text: `Abri ${shortcut.name}.` });
    return true;
  }
  const websiteUrl = quickChatExplicitWebsiteUrl(query);
  if (websiteUrl) {
    void invoke("open_targets", { targets: [websiteUrl] }).catch(() => undefined);
    quickChatMessages.push({ id: makeId(), role: "assistant", text: `Abri ${websiteUrl}` });
    return true;
  }
  return false;
}

function quickChatWebsiteResolverChoice() {
  const model = quickChatModels.find((entry) => entry.id === "gpt-6-luna")
    ?? quickChatModels.find((entry) => entry.id === quickChatSelectedModel)
    ?? quickChatModels[0];
  if (!model) return { model: "gpt-6-luna", effort: "low" };
  const efforts = model.supportedReasoningEfforts.map((entry) => entry.reasoningEffort);
  const effort = efforts.includes("low")
    ? "low"
    : model.defaultReasoningEffort && efforts.includes(model.defaultReasoningEffort)
      ? model.defaultReasoningEffort
      : efforts[0] ?? "low";
  return { model: model.id, effort };
}

function quickChatWebsiteSearchUrl(siteName: string) {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("q", `${siteName} site oficial`);
  return url.toString();
}

async function resolveAndOpenQuickChatWebsite(request: QuickChatWebsiteRequest, pending: QuickChatMessage) {
  let websiteUrl: string | null = null;
  let lookupFailed = false;
  if (quickChatAuthenticated && quickChatServiceStarted) {
    const choice = quickChatWebsiteResolverChoice();
    try {
      const resolved = await invoke<string | null>("quick_chat_resolve_website", {
        siteName: request.siteName,
        model: choice.model,
        effort: choice.effort,
      });
      websiteUrl = safeQuickChatWebsiteUrl(resolved);
    } catch (error) {
      lookupFailed = true;
      console.warn("Não consegui resolver o endereço do site pelo Codex", error);
    }
  } else {
    lookupFailed = true;
  }

  if (quickChatCancelRequested) {
    pending.text = "Busca interrompida.";
    pending.pending = false;
    return null;
  }

  if (websiteUrl) {
    try {
      await invoke("open_targets", { targets: [websiteUrl] });
      saveQuickChatWebsiteResolution(request.siteName, websiteUrl);
      pending.text = `Encontrei e abri ${new URL(websiteUrl).hostname}. Vou abrir direto nas próximas vezes.`;
      pending.pending = false;
      return websiteUrl;
    } catch (error) {
      console.warn("Não consegui abrir o site resolvido", error);
      lookupFailed = true;
    }
  }

  try {
    await invoke("open_targets", { targets: [quickChatWebsiteSearchUrl(request.siteName)] });
    pending.text = lookupFailed
      ? `Não consegui confirmar o endereço de ${request.siteName}. Abri uma busca para você escolher.`
      : `Não encontrei um site oficial inequívoco para ${request.siteName}. Abri uma busca para você escolher.`;
  } catch (error) {
    pending.text = `Não consegui abrir uma busca por ${request.siteName}: ${String(error)}`;
  }
  pending.pending = false;
  return null;
}

async function sendQuickChatModelMessage(messageForModel: string) {
  quickChatLoading = true;
  quickChatCancelRequested = false;
  quickChatError = "";
  quickChatMessages.push({ id: makeId(), role: "assistant", text: "", pending: true });
  quickChatStickToBottom = true;
  paintQuickChatMessages(true);
  updateQuickChatSendControl();
  setQuickChatPetState("thinking");
  try {
    await invoke("quick_chat_send", {
      message: messageForModel,
      model: quickChatSelectedModel,
      effort: quickChatSelectedReasoning,
    });
  } catch (error) {
    const pending = quickChatMessages.at(-1);
    if (pending?.role === "assistant" && pending.pending) {
      pending.text = `Não consegui enviar: ${String(error)}`;
      pending.pending = false;
    }
    quickChatLoading = false;
    paintQuickChatMessages(true);
    updateQuickChatSendControl();
    setQuickChatPetState("error", String(error));
  }
}

async function sendQuickChatMessage() {
  if (quickChatLoading) return;
  const input = app.querySelector<HTMLInputElement>("#quick-chat-input");
  const message = input?.value.trim() ?? "";
  if (!message) return;
  const websiteRequest = quickChatWebsiteRequest(message);
  const websiteFollowUp = websiteRequest?.continuation ? websiteRequest : null;
  if (!quickChatAuthenticated && !isExplicitQuickChatAction(message)) {
    if (quickChatServiceStarted) void beginQuickChatLogin();
    else {
      quickChatError = "A conexão do chat ainda não está disponível.";
      paintQuickChatMessages();
    }
    return;
  }
  if (input) input.value = "";
  quickChatDraft = "";
  localStorage.removeItem(KEYS.quickChatDraft);
  quickChatMessages.push({ id: makeId(), role: "user", text: message });
  if (runExplicitQuickChatAction(message)) {
    quickChatError = "";
    quickChatStickToBottom = true;
    paintQuickChatMessages(true);
    setQuickChatPetState("finished");
    return;
  }

  if (websiteRequest && !websiteRequest.url) {
    quickChatLoading = true;
    quickChatCancelRequested = false;
    quickChatError = "";
    const pending: QuickChatMessage = {
      id: makeId(),
      role: "assistant",
      text: `Procurando o site oficial de ${websiteRequest.siteName}…`,
      pending: true,
    };
    quickChatMessages.push(pending);
    quickChatStickToBottom = true;
    paintQuickChatMessages(true);
    updateQuickChatSendControl();
    setQuickChatPetState("searching");
    const resolvedUrl = await resolveAndOpenQuickChatWebsite(websiteRequest, pending);
    if (quickChatCancelRequested) {
      quickChatLoading = false;
      quickChatCancelRequested = false;
      paintQuickChatMessages(true);
      updateQuickChatSendControl();
      setQuickChatPetState("idle");
      return;
    }
    if (websiteRequest.continuation && quickChatAuthenticated) {
      const openedContext = resolvedUrl
        ? `O Ghosty abriu ${resolvedUrl}.`
        : `O Ghosty não conseguiu confirmar ${websiteRequest.siteName} e abriu uma busca para você escolher.`;
      await sendQuickChatModelMessage(`A parte restante do pedido é: ${websiteRequest.continuation}\n\n${openedContext} Continue sem repetir a abertura.`);
      return;
    }
    quickChatLoading = false;
    paintQuickChatMessages(true);
    updateQuickChatSendControl();
    setQuickChatPetState("finished");
    return;
  }

  let messageForModel = message;
  if (websiteFollowUp?.url) {
    void invoke("open_targets", { targets: [websiteFollowUp.url] }).catch(() => undefined);
    quickChatMessages.push({ id: makeId(), role: "assistant", text: `Abri ${websiteFollowUp.url}.` });
    messageForModel = `A parte restante do pedido é: ${websiteFollowUp.continuation}\n\nO Ghosty já iniciou a abertura de ${websiteFollowUp.url} no navegador. Continue sem repetir essa ação.`;
  }
  await sendQuickChatModelMessage(messageForModel);
}

async function cancelQuickChatTurn() {
  quickChatCancelRequested = true;
  try {
    await invoke("quick_chat_cancel");
  } catch (error) {
    quickChatCancelRequested = false;
    console.error("Não consegui interromper a resposta do Ghosty", error);
  }
}

async function stopQuickChatSession() {
  if (quickChatStatusPoll !== undefined) {
    window.clearInterval(quickChatStatusPoll);
    quickChatStatusPoll = undefined;
  }
  if (quickChatServiceStarted || quickChatServiceLoading) await invoke("quick_chat_close").catch(() => undefined);
  quickChatMessages = [];
  quickChatDraft = "";
  localStorage.removeItem(KEYS.quickChatDraft);
  quickChatApprovals = [];
  quickChatCancelRequested = false;
  quickChatApprovalBusy.clear();
  quickChatFileChangePreviews.clear();
  quickChatAutoApproveSession = false;
  quickChatSessionPermissionNotice = "";
  quickChatAuthenticated = false;
  quickChatLoading = false;
  quickChatServiceLoading = false;
  quickChatServiceStarted = false;
  quickChatLoginPending = false;
  quickChatLoginFailed = false;
  quickChatLoginCompletedAt = 0;
  quickChatStatusBusy = false;
  quickChatError = "";
  quickChatStickToBottom = true;
}

async function openUtilityPopup(mode: UtilityPopupMode) {
  if (mode === "dashboard") {
    openPanelsInBar();
    return;
  }
  if (mode === "chat") {
    quickChatEntryPending = true;
    localStorage.setItem(KEYS.quickChatEntry, String(Date.now()));
  }
  localStorage.setItem(KEYS.utilityPopup, mode);
  if (getCurrentWindow().label === "utility-popup") renderUtilityPopup();
  try {
    if (mode === "chat") {
      await invoke("show_quick_chat");
      return;
    }
    const position = readUtilityPopupPosition();
    await invoke("show_utility_popup", {
      positionX: position?.x ?? null,
      positionY: position?.y ?? null,
      dashboard: false,
    });
  } catch (error) {
    console.error("NÃ£o consegui abrir o popup do Edge Ghosty", error);
  }
}

function openSettingsWindow(tab: SettingsTab = "general") {
  settingsTab = tab;
  localStorage.setItem(KEYS.settingsTab, tab);
  void invoke("show_settings_window").catch((error) => {
    console.error("Não consegui abrir as configurações do Edge Ghosty", error);
  });
}

function openPanelsInBar() {
  if (currentWindowLabel === "settings-window" || currentWindowLabel === "utility-popup") {
    localStorage.setItem(KEYS.openPanelsRequest, makeId());
    void getCurrentWindow().hide().catch(() => undefined);
    return;
  }
  updateActiveTab("panels");
  setExpanded(true);
}

function refreshShortcutsScreen() {
  if (currentWindowLabel === "settings-window") renderSettingsWindow();
  else openSettingsWindow("shortcuts");
}

function formatFileSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1_024;
    unit += 1;
  } while (value >= 1_024 && unit < units.length - 1);
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

async function askAboutPocketItem(item: PocketItem) {
  if (item.kind === "text") {
    const text = item.value.slice(0, MAX_CHAT_TEXT_CONTEXT_CHARS);
    const clipped = item.truncated || item.value.length > MAX_CHAT_TEXT_CONTEXT_CHARS;
    quickChatDraft = `Ajude-me a entender este texto que guardei no Bolso do Ghosty${clipped ? ` (estou enviando somente os primeiros ${MAX_CHAT_TEXT_CONTEXT_CHARS.toLocaleString("pt-BR")} caracteres)` : ""}:\n\n${text}`;
  } else {
    let sizeNote = "Não consegui consultar o tamanho local; confirme o arquivo antes de autorizar qualquer leitura.";
    try {
      const metadata = await invoke<{ sizeBytes: number }>("pocket_file_metadata", { path: item.value });
      const readableSize = formatFileSize(metadata.sizeBytes);
      sizeNote = metadata.sizeBytes > LARGE_CHAT_FILE_WARNING_BYTES
        ? `Tamanho local: ${readableSize}. Este arquivo ultrapassa o limite recomendado de 25 MiB para análise no chat. Não tente ler o arquivo inteiro; pergunte ao usuário se prefere fornecer uma cópia menor ou um trecho.`
        : `Tamanho local: ${readableSize}. O arquivo não será enviado automaticamente.`;
    } catch {
      // Keep the handoff available when metadata cannot be read; the chat still requires explicit approval for file access.
    }
    quickChatDraft = `Analise o arquivo que guardei no Bolso do Ghosty: ${item.name}\nCaminho: ${item.value}\n${sizeNote}\nNão altere nem copie o original. Se precisar acessar o conteúdo, peça permissão pelo Ghosty antes de ler.`;
  }
  localStorage.setItem(KEYS.quickChatDraft, quickChatDraft);
  void openUtilityPopup("chat");
}

async function closeUtilityPopup() {
  flushUtilityPopupPosition();
  if (utilityPopupMode === "chat") await stopQuickChatSession();
  utilityPopupMode = null;
  localStorage.removeItem(KEYS.utilityPopup);
  renderUtilityPopup();
  await getCurrentWindow().hide().catch(() => undefined);
}

function startUtilityPopupWindow() {
  if (localStorage.getItem(KEYS.utilityPopup) === "dashboard") {
    localStorage.removeItem(KEYS.utilityPopup);
    localStorage.setItem(KEYS.openPanelsRequest, makeId());
    void getCurrentWindow().hide().catch(() => undefined);
    return;
  }
  renderUtilityPopup();
  void loadGoogleWorkspace(false);
  const currentWindow = getCurrentWindow();
  void currentWindow.onMoved(({ payload }) => {
    if (utilityPopupMode === "chat") return;
    latestUtilityPopupPosition = { x: payload.x, y: payload.y };
    if (utilityPopupPositionSaveTimer !== undefined) window.clearTimeout(utilityPopupPositionSaveTimer);
    utilityPopupPositionSaveTimer = window.setTimeout(flushUtilityPopupPosition, 160);
  });
  void currentWindow.onFocusChanged(({ payload: focused }) => {
    if (focused) {
      if (utilityPopupBlurTimer !== undefined) window.clearTimeout(utilityPopupBlurTimer);
      utilityPopupBlurTimer = undefined;
      return;
    }
    if (utilityPopupBlurTimer !== undefined) window.clearTimeout(utilityPopupBlurTimer);
    const keepChatOpenForPendingWork = utilityPopupMode === "chat"
      && (quickChatLoginPending || quickChatLoading || quickChatApprovals.length > 0);
    utilityPopupBlurTimer = window.setTimeout(() => {
      utilityPopupBlurTimer = undefined;
      void currentWindow.isFocused().then((stillFocused) => {
        if (!stillFocused && utilityPopupMode && !keepChatOpenForPendingWork) void closeUtilityPopup();
      }).catch(() => undefined);
    }, 160);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && utilityPopupMode) void closeUtilityPopup();
    if (utilityPopupMode === "chat" && event.ctrlKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      void stopQuickChatSession().then(() => {
        quickChatMessages = [];
        quickChatError = "";
        quickChatServiceStarted = false;
        quickChatEntryPending = false;
        renderUtilityPopup();
      });
    }
  });
  void bindNativeFileDrop();
}

function renderShortcuts() {
  return shortcuts.map((shortcut) => `
    <article class="shortcut-item" draggable="true" data-shortcut-id="${escapeHtml(shortcut.id)}">
      <button class="shortcut" data-action="run-shortcut" data-shortcut-id="${escapeHtml(shortcut.id)}"><span>${escapeHtml(shortcut.glyph)}</span><small>${escapeHtml(shortcut.name)}</small></button>
      ${shortcut.custom ? `<button class="shortcut-remove" data-action="remove-shortcut" data-shortcut-id="${escapeHtml(shortcut.id)}" aria-label="Remover ${escapeHtml(shortcut.name)}">×</button>` : ""}
    </article>`).join("");
}

function renderShortcutsPage() {
  return `
    <div class="shortcuts-page">
      <section class="shortcuts-context-card">
        <div class="shortcuts-intro">
          <div class="shortcuts-message">
            <div class="page-heading"><span>Atalhos</span><small>Seus destinos favoritos</small></div>
            <button class="secondary-action add-action-toggle" data-action="toggle-shortcut-form">${menuIcon("plus")} Criar ação</button>
          </div>
          <label class="launcher-field shortcuts-search"><span>${menuIcon("search")}</span><input class="launcher-search full-launcher-search" data-launcher-search placeholder="Buscar app, pasta ou site" aria-label="Buscar aplicativo, pasta ou endereço" /></label>
        </div>
        <div class="home-divider"></div>
        <section class="shortcuts-launcher">
          <div class="section-head"><div class="section-title"><span class="section-kicker">ACESSO RÁPIDO</span><strong>Aplicativos</strong></div></div>
          <div class="launcher-items launcher-results">${renderLauncherItems()}</div>
        </section>
        <button class="home-utility-summary shortcuts-clipboard" data-action="open-utility-popup" data-popup="clipboard">
            <span class="utility-icon">${menuIcon("clipboard")}</span>
            <span class="utility-copy"><strong>Prancheta</strong><small><span class="home-clipboard-count">${clipboardEntries.length}</span> itens recentes</small></span>
            <span class="utility-chevron">${menuIcon("chevron")}</span>
        </button>
        <div class="home-divider"></div>
        <div class="shortcuts-user-heading">
          <div class="section-title"><span class="section-kicker">PERSONALIZADOS</span><strong>Seus atalhos</strong></div>
          <small>Arraste para reordenar</small>
        </div>
        <div class="shortcut-grid" data-dropzone="shortcuts">${renderShortcuts()}</div>
        <form class="custom-action-form" data-action="shortcut-form" hidden>
          <label>Nome<input name="action-name" maxlength="24" placeholder="Ex.: Começar o dia" required /></label>
          <label>Aplicativo, pasta ou endereço<textarea name="action-targets" rows="2" placeholder="Um destino por linha. Ex.: wt.exe&#10;https://calendar.google.com" required></textarea></label>
          <small>Uma ação pode abrir vários destinos, na ordem indicada.</small>
          <button class="secondary-action">Salvar ação</button>
        </form>
      </section>
    </div>`;
}

function renderOnboarding() {
  if (onboardingStep === "welcome") {
    return `
      <section class="onboarding-page onboarding-welcome">
        <div class="onboarding-step-label"><span class="onboarding-step-title">PRIMEIROS PASSOS</span><span class="onboarding-step-progress" aria-label="Etapa 1 de 2"><i class="is-current"></i><i></i><small>01 / 02</small></span></div>
        <div class="onboarding-welcome-row">
          <div class="onboarding-hero" aria-hidden="true">
            ${renderPetCharacter("onboarding-pet")}
          </div>
          <div class="onboarding-welcome-copy"><span class="onboarding-welcome-kicker">SEU NOVO COMPANHEIRO</span><h1>Oi! Eu sou o Ghosty.</h1><p>Cuido dos seus atalhos, acompanho seu foco e guardo o que você me confiar.</p></div>
        </div>
        <div class="onboarding-benefits">
          <div><span>HOME</span><p>Controle mídia e volume sem sair do que está fazendo.</p></div>
          <div><span>FOCO</span><p>Inicie um temporizador e acompanhe seu ritmo semanal.</p></div>
          <div><span>ATALHOS</span><p>Abra seus destinos ou peça por eles no chat rápido.</p></div>
        </div>
        <div class="onboarding-actions">
          <button class="onboarding-primary" data-action="onboarding-next">Configurar agora <span>→</span></button>
          <button class="onboarding-skip" data-action="onboarding-skip">Pular por enquanto</button>
        </div>
      </section>`;
  }

  const shortcutOptions = shortcuts.map((shortcut) => `
    <label class="onboarding-shortcut-option">
      <input type="checkbox" data-onboarding-shortcut="${escapeHtml(shortcut.id)}" ${onboardingSelectedShortcutIds.has(shortcut.id) ? "checked" : ""} />
      <span class="onboarding-shortcut-glyph">${escapeHtml(shortcut.glyph)}</span>
      <span>${escapeHtml(shortcut.name)}</span>
    </label>`).join("");
  return `
    <section class="onboarding-page onboarding-choices">
      <div class="onboarding-step-label"><button data-action="onboarding-back" aria-label="Voltar">←</button><span class="onboarding-step-title">CONFIGURAÇÃO RÁPIDA</span><span class="onboarding-step-progress" aria-label="Etapa 2 de 2"><i class="is-current"></i><i class="is-current"></i><small>02 / 02</small></span></div>
      <h1>Deixe tudo pronto</h1>
      <p class="onboarding-lead">Você pode mudar estas escolhas depois nas Configurações.</p>
      <div class="onboarding-mode-picker">
        <span class="onboarding-mode-title">Como você quer abrir o menu?</span>
        <div class="onboarding-mode-options" role="radiogroup" aria-label="Modo de abertura do menu">
          <label class="onboarding-mode-option ${onboardingInteractionMode === "hover" ? "is-selected" : ""}"><input type="radio" name="onboarding-interaction-mode" value="hover" ${onboardingInteractionMode === "hover" ? "checked" : ""} /><span><strong>Passar o cursor</strong><small>Abre ao encostar na barrinha.</small></span><i></i></label>
          <label class="onboarding-mode-option ${onboardingInteractionMode === "click" ? "is-selected" : ""}"><input type="radio" name="onboarding-interaction-mode" value="click" ${onboardingInteractionMode === "click" ? "checked" : ""} /><span><strong>Clicar</strong><small>Abre quando você clicar na barrinha.</small></span><i></i></label>
        </div>
      </div>
      <label class="onboarding-startup-option">
        <input type="checkbox" data-autostart-toggle ${autoStartEnabled ? "checked" : ""} ${autoStartLoading || autoStartBusy ? "disabled" : ""} />
        <span><strong>Iniciar com o Windows</strong><small>O Ghosty estará disponível quando você entrar no computador.</small></span>
      </label>
      <small class="onboarding-status" data-autostart-status role="status">${escapeHtml(autoStartStatusText())}</small>
      <div class="onboarding-shortcut-heading"><strong>Atalhos da Home</strong><small data-onboarding-shortcut-status>${onboardingSelectedShortcutIds.size} de 3 selecionados</small></div>
      <p class="onboarding-shortcut-hint">Escolha até três. Os demais continuam disponíveis em Atalhos.</p>
      <div class="onboarding-shortcut-list">${shortcutOptions || '<small>Adicione seus atalhos em Atalhos depois da configuração.</small>'}</div>
      <small class="onboarding-status onboarding-shortcut-message" data-onboarding-message role="status"></small>
      <div class="onboarding-actions">
        <button class="onboarding-primary" data-action="onboarding-finish" ${autoStartBusy ? "disabled" : ""}>Salvar e começar <span>→</span></button>
      </div>
    </section>`;
}

function renderActiveTab() {
  if (onboardingLaunchGreetingActive) return "";
  if (onboardingOpen) return renderOnboarding();
  if (activeTab === "pet") return renderPetPage();
  if (activeTab === "panels") return renderDashboardPopup();
  return renderHomePage();
}

function autoStartStatusText() {
  if (autoStartLoading) return "Verificando a configuração do Windows…";
  if (autoStartBusy) return "Salvando…";
  if (autoStartError) return autoStartError;
  return autoStartEnabled ? "Ativado para sua conta do Windows." : "Desativado. Você pode ativar quando quiser.";
}

function paintAutoStartControls() {
  app.querySelectorAll<HTMLInputElement>("[data-autostart-toggle]").forEach((input) => {
    input.checked = autoStartEnabled;
    input.disabled = autoStartLoading || autoStartBusy;
  });
  app.querySelectorAll<HTMLElement>("[data-autostart-status]").forEach((status) => {
    status.textContent = autoStartStatusText();
    status.classList.toggle("is-error", !!autoStartError);
  });
  app.querySelectorAll<HTMLButtonElement>("[data-action=onboarding-finish]").forEach((button) => {
    button.disabled = autoStartBusy;
  });
}

async function refreshAutoStartStatus() {
  autoStartLoading = true;
  autoStartError = "";
  paintAutoStartControls();
  try {
    autoStartEnabled = await invoke<boolean>("is_autostart_enabled");
  } catch (error) {
    autoStartError = `Não foi possível consultar a inicialização: ${String(error)}`;
  } finally {
    autoStartLoading = false;
    paintAutoStartControls();
  }
}

async function setAutoStartEnabled(enabled: boolean) {
  if (autoStartBusy || autoStartLoading) return;
  autoStartBusy = true;
  autoStartError = "";
  paintAutoStartControls();
  try {
    await invoke("set_autostart_enabled", { enabled });
    autoStartEnabled = enabled;
  } catch (error) {
    autoStartError = `Não foi possível salvar: ${String(error)}`;
  } finally {
    autoStartBusy = false;
    paintAutoStartControls();
  }
}

function finishOnboarding(applyChoices: boolean) {
  if (applyChoices) {
    const selected = shortcuts.filter((shortcut) => onboardingSelectedShortcutIds.has(shortcut.id));
    shortcuts = [...selected, ...shortcuts.filter((shortcut) => !onboardingSelectedShortcutIds.has(shortcut.id))];
    persistShortcuts();
  }
  localStorage.setItem(KEYS.onboardingComplete, "true");
  interactionMode = onboardingInteractionMode;
  localStorage.setItem(KEYS.interactionMode, interactionMode);
  resetOnboardingLaunchTransition();
  const replayRestore = launchGreetingReplayRestore;
  if (replayRestore) {
    edge = replayRestore.edge;
    barPosition = replayRestore.barPosition;
    onboardingIntroStarted = replayRestore.onboardingIntroStarted;
    launchGreetingReplayRestore = null;
  }
  onboardingOpen = false;
  onboardingStep = "welcome";
  activeTab = "home";
  render();
  setExpanded(false);
  if (replayRestore) void applyDisplayLayout(false);
}

function openOnboarding() {
  onboardingOpen = true;
  onboardingStep = "welcome";
  onboardingSelectedShortcutIds = new Set(shortcuts.slice(0, 3).map((shortcut) => shortcut.id));
  onboardingInteractionMode = interactionMode;
  activeTab = "home";
  render();
  setExpanded(true);
}

function bindOnboarding(container: HTMLElement) {
  if (!onboardingOpen) return;
  container.querySelector("[data-action=onboarding-next]")?.addEventListener("click", () => {
    onboardingStep = "choices";
    container.innerHTML = renderOnboarding();
    bindTabContent(container);
  });
  container.querySelector("[data-action=onboarding-back]")?.addEventListener("click", () => {
    onboardingStep = "welcome";
    container.innerHTML = renderOnboarding();
    bindTabContent(container);
  });
  container.querySelector("[data-action=onboarding-skip]")?.addEventListener("click", () => finishOnboarding(false));
  container.querySelector("[data-action=onboarding-finish]")?.addEventListener("click", () => finishOnboarding(true));
  container.querySelectorAll<HTMLInputElement>("[data-autostart-toggle]").forEach((input) => {
    input.addEventListener("change", () => void setAutoStartEnabled(input.checked));
  });
  container.querySelectorAll<HTMLInputElement>("[data-onboarding-shortcut]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.onboardingShortcut;
      if (!id) return;
      const status = container.querySelector<HTMLElement>("[data-onboarding-shortcut-status]");
      const message = container.querySelector<HTMLElement>("[data-onboarding-message]");
      if (input.checked && onboardingSelectedShortcutIds.size >= 3) {
        input.checked = false;
        if (message) message.textContent = "Escolha até três atalhos para a Home.";
        return;
      }
      if (input.checked) onboardingSelectedShortcutIds.add(id);
      else onboardingSelectedShortcutIds.delete(id);
      if (status) status.textContent = `${onboardingSelectedShortcutIds.size} de 3 selecionados`;
      if (message) message.textContent = "";
    });
  });
  container.querySelectorAll<HTMLInputElement>("[name=onboarding-interaction-mode]").forEach((input) => {
    input.addEventListener("change", () => {
      const value = input.value;
      if (value !== "hover" && value !== "click") return;
      onboardingInteractionMode = value;
      container.querySelectorAll<HTMLElement>(".onboarding-mode-option").forEach((option) => {
        option.classList.toggle("is-selected", option.querySelector<HTMLInputElement>("input")?.checked === true);
      });
    });
  });
  paintAutoStartControls();
}

function setPetMood(mood: string, durationMs = 1400) {
  petMoodOverride = mood;
  petMoodUntil = Date.now() + durationMs;
  updatePetAtmosphere();
  window.setTimeout(() => {
    if (Date.now() >= petMoodUntil) {
      petMoodOverride = "";
      updatePetAtmosphere();
    }
  }, durationMs + 30);
}

function setPetActivity(state: PetState, detail = "") {
  app.querySelectorAll<HTMLElement>(".pet").forEach((pet) => petMotionEngines.get(pet)?.setState(state, false, detail));
}

function signalGhostyReaction(state: PetState, detail: string, durationMs = 1700) {
  const signal: PetReactionSignal = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, state, detail: detail.slice(0, 220), until: Date.now() + durationMs };
  lastPetReactionId = signal.id;
  setPetActivity(state, signal.detail);
  void emit("edge-ghosty-pet-reaction", signal).catch(() => undefined);
  window.setTimeout(() => {
    if (lastPetReactionId === signal.id && signal.until <= Date.now()) setPetActivity("idle");
  }, durationMs + 40);
}

function receiveGhostyReaction(signal: PetReactionSignal) {
  const states: PetState[] = ["idle", "working", "thinking", "searching", "approval", "question", "error", "finished", "ratelimit", "sleeping", "dizzy"];
  if (!signal || !signal.id || signal.id === lastPetReactionId || !states.includes(signal.state) || signal.until <= Date.now()) return;
  lastPetReactionId = signal.id;
  setPetActivity(signal.state, signal.detail.slice(0, 220));
  window.setTimeout(() => {
    if (lastPetReactionId === signal.id && signal.until <= Date.now()) setPetActivity("idle");
  }, Math.max(0, signal.until - Date.now()) + 40);
}

function setCodexPetActivity(state: PetState, detail = "") {
  latestCodexPetState = { state, detail, occurredAt: Date.now() };
  setPetActivity(state, detail);
}

function setCodexTaskRunning(running: boolean) {
  codexTaskRunning = running;
  const island = app.querySelector<HTMLElement>(".edge-island");
  island?.classList.toggle("is-task-running", running);
  app.querySelectorAll<HTMLElement>(".codex-live-indicator").forEach((indicator) => indicator.classList.toggle("is-active", running));
  if (running) island?.classList.remove("is-task-complete");
  syncCollapsedMediaCapsule(island);
  syncCodexMediaBubble(island);
  island?.querySelector(".peek-line")?.setAttribute(
    "aria-label",
    running ? "Uma tarefa do Codex está em andamento. Abrir Edge Ghosty." : "Abrir Edge Ghosty",
  );
  refreshHomeStatusUi();
}

function setCodexApprovalButtons(container: ParentNode, approval: CodexApproval | null) {
  container.querySelectorAll<HTMLButtonElement>("[data-ghosty-approval]").forEach((button) => {
    button.dataset.requestId = approval?.requestId ?? "";
    button.disabled = !approval || codexApprovalSubmitting;
  });
}

function updateCodexApprovalPresentation() {
  const island = app.querySelector<HTMLElement>(".edge-island");
  if (!island) return;
  const approval = pendingCodexApprovals[0] ?? null;
  const toast = island.querySelector<HTMLElement>(".ghosty-completion");
  const inline = island.querySelector<HTMLElement>(".ghosty-inline-approval");
  const externalVisible = Boolean(approval && !expanded);
  const inlineVisible = Boolean(approval && expanded);

  island.classList.toggle("is-approval-pending", Boolean(approval));
  island.classList.toggle("is-approval-inline", inlineVisible);
  syncCollapsedMediaCapsule(island);
  toast?.setAttribute("aria-hidden", String(!externalVisible));
  inline?.setAttribute("aria-hidden", String(!inlineVisible));

  const toolLabel = approval?.toolName || "Ferramenta do Codex";
  const presentationKey = approval ? `${inlineVisible ? "inline" : "external"}:${approval.requestId}` : "";
  const presentationChanged = presentationKey !== codexApprovalPresentationKey;
  if (toast) {
    if (externalVisible) {
      if (presentationChanged || !toast.classList.contains("is-approval-entering")) {
        toast.classList.remove("is-approval-entering");
        void toast.offsetWidth;
        toast.classList.add("is-approval-entering");
      }
    } else {
      toast.classList.remove("is-approval-entering");
    }
  }
  if (inline) {
    if (inlineVisible) {
      if (presentationChanged || !inline.classList.contains("is-entering")) {
        inline.classList.remove("is-entering");
        void inline.offsetWidth;
        inline.classList.add("is-entering");
      }
    } else {
      inline.classList.remove("is-entering");
    }
  }
  codexApprovalPresentationKey = presentationKey;
  const copy = island.querySelector<HTMLElement>("#ghosty-completion-copy");
  const liveRegion = island.querySelector<HTMLElement>("#ghosty-completion-live");
  const description = island.querySelector<HTMLElement>("#ghosty-approval-description");
  const tool = island.querySelector<HTMLElement>("#ghosty-approval-tool");
  const inlineDescription = island.querySelector<HTMLElement>("#ghosty-inline-approval-description");
  const inlineTool = island.querySelector<HTMLElement>("#ghosty-inline-approval-tool");
  if (copy && approval) copy.textContent = "Autorizar esta ação?";
  if (liveRegion) liveRegion.textContent = externalVisible && approval
    ? `O Codex pediu autorização para ${approval.toolName}: ${approval.description}`
    : "";
  if (description) {
    description.textContent = approval?.description ?? "";
    description.hidden = !approval;
  }
  if (tool) {
    tool.textContent = toolLabel;
    tool.hidden = !approval;
  }
  if (inlineDescription) inlineDescription.textContent = approval?.description ?? "";
  if (inlineTool) inlineTool.textContent = toolLabel;
  island.querySelectorAll<HTMLElement>(".ghosty-approval-kicker").forEach((kicker) => {
    kicker.hidden = !approval;
  });
  island.querySelectorAll<HTMLElement>(".ghosty-completion-kicker").forEach((kicker) => {
    kicker.textContent = approval ? "SUA DECISÃO" : "PRONTINHO!";
  });
  island.querySelectorAll<HTMLElement>(".ghosty-approval-actions").forEach((actions) => {
    actions.hidden = !approval;
  });
  island.querySelectorAll<HTMLElement>(".ghosty-approval-error").forEach((message) => {
    message.textContent = codexApprovalError;
    message.hidden = !codexApprovalError;
  });
  setCodexApprovalButtons(island, approval);
  refreshApprovalHitBounds();
  refreshHomeStatusUi();
}

function clearTaskCompletionToast(island = app.querySelector<HTMLElement>(".edge-island"), syncMediaCapsule = true) {
  if (taskCompletionTimer !== undefined) window.clearTimeout(taskCompletionTimer);
  taskCompletionTimer = undefined;
  island?.classList.remove("is-task-complete");
  island?.querySelector("#ghosty-completion-live")?.replaceChildren();
  if (syncMediaCapsule) syncCollapsedMediaCapsule(island);
}

function expireCodexApproval(requestId: string) {
  const wasCurrent = pendingCodexApprovals[0]?.requestId === requestId;
  pendingCodexApprovals = pendingCodexApprovals.filter((approval) => approval.requestId !== requestId);
  codexApprovalExpiryTimers.delete(requestId);
  if (wasCurrent) {
    codexApprovalSubmitting = false;
    codexApprovalError = "";
  }
  updateCodexApprovalPresentation();
}

function clearPendingCodexApprovals() {
  for (const timer of codexApprovalExpiryTimers.values()) window.clearTimeout(timer);
  codexApprovalExpiryTimers.clear();
  pendingCodexApprovals = [];
  codexApprovalSubmitting = false;
  codexApprovalError = "";
  updateCodexApprovalPresentation();
}

function queueCodexApproval(event: CodexHookEvent) {
  if (!event.approvalId || !event.approvalDescription || pendingCodexApprovals.some((item) => item.requestId === event.approvalId)) return;
  const expiresAt = event.approvalExpiresAt ?? event.occurredAt + 570_000;
  if (expiresAt <= Date.now()) return;
  playGhostySound("approval");
  pendingCodexApprovals.push({
    requestId: event.approvalId,
    toolName: event.toolName || "Codex",
    description: event.approvalDescription,
    expiresAt,
  });
  codexApprovalError = "";
  const timer = window.setTimeout(() => expireCodexApproval(event.approvalId!), Math.max(0, expiresAt - Date.now()));
  codexApprovalExpiryTimers.set(event.approvalId, timer);
  clearTaskCompletionToast();
  setCodexTaskRunning(true);
  setCodexPetActivity("approval", `Aprovação solicitada para ${event.toolName || "uma ferramenta do Codex"}`);
  updateCodexApprovalPresentation();
}

async function resolveCodexApproval(requestId: string, decision: CodexApprovalDecision) {
  const approval = pendingCodexApprovals[0];
  if (!approval || approval.requestId !== requestId || codexApprovalSubmitting) return;
  codexApprovalSubmitting = true;
  codexApprovalError = "";
  updateCodexApprovalPresentation();
  try {
    await invoke("resolve_codex_approval", { requestId, decision });
  } catch (error) {
    codexApprovalSubmitting = false;
    codexApprovalError = `Não consegui enviar a decisão: ${String(error)}`;
    updateCodexApprovalPresentation();
    return;
  }

  const timer = codexApprovalExpiryTimers.get(requestId);
  if (timer !== undefined) window.clearTimeout(timer);
  codexApprovalExpiryTimers.delete(requestId);
  pendingCodexApprovals = pendingCodexApprovals.filter((item) => item.requestId !== requestId);
  codexApprovalSubmitting = false;
  codexApprovalError = "";
  updateCodexApprovalPresentation();
  setCodexPetActivity(decision === "allow" ? "thinking" : "question", decision === "allow" ? "Ação aprovada" : "Ação recusada");
}

function showGhostyTaskCompletion(message: string) {
  const island = app.querySelector<HTMLElement>(".edge-island");
  const toast = island?.querySelector<HTMLElement>(".ghosty-completion");
  const copy = island?.querySelector<HTMLElement>("#ghosty-completion-copy");
  const liveRegion = island?.querySelector<HTMLElement>("#ghosty-completion-live");
  if (!island || !toast || !copy || !liveRegion || expanded || pendingCodexApprovals.length > 0) return;

  clearTaskCompletionToast(island, false);
  updateCodexApprovalPresentation();
  copy.textContent = message;
  liveRegion.textContent = message;
  toast.setAttribute("aria-hidden", "false");
  void island.offsetWidth;
  island.classList.add("is-task-complete");
  syncCollapsedMediaCapsule(island);
  taskCompletionTimer = window.setTimeout(() => {
    island.classList.remove("is-task-complete");
    syncCollapsedMediaCapsule(island);
    toast.setAttribute("aria-hidden", "true");
    liveRegion.textContent = "";
    taskCompletionTimer = undefined;
  }, 3500);
}

function updateCodexIntegrationControls() {
  const button = app.querySelector<HTMLButtonElement>("#codex-hooks-toggle");
  const status = app.querySelector<HTMLElement>("#codex-hooks-status");
  if (button) {
    button.disabled = codexHooksBusy;
    button.textContent = codexHooksBusy ? "Aguarde…" : codexHooksEnabled
      ? codexHooksNeedsReview ? "Revisar atualização" : "Desconectar Codex"
      : "Conectar Codex";
  }
  if (status) status.textContent = codexHooksStatusMessage;
}

function renderCodexHookPreview() {
  if (!codexHookPreview) return "";
  const preview = codexHookPreview;
  const changes = preview.changes.length
    ? preview.changes.map((change) => {
      const before = change.before.length ? JSON.stringify(change.before, null, 2) : "(nenhum hook do Ghosty)";
      const after = change.after.length ? JSON.stringify(change.after, null, 2) : "(nenhum hook do Ghosty)";
      return `<details class="codex-hook-event-change"><summary>${escapeHtml(change.eventName)} · ${change.before.length ? "atualizar/remover" : "adicionar"}</summary><div class="codex-hook-diff"><section><small>ANTES</small><pre>${escapeHtml(before)}</pre></section><section><small>DEPOIS</small><pre>${escapeHtml(after)}</pre></section></div></details>`;
    }).join("")
    : '<p class="settings-note">Nenhuma entrada do Ghosty em hooks.json precisa mudar. A confirmação só atualiza o helper local e o estado da conexão.</p>';
  const action = preview.enabled ? "conectar" : "desconectar";
  return `<div class="codex-hook-preview" role="region" aria-label="Revisão da integração com Codex">
    <strong>Revisar ${action} o Codex</strong>
    <small class="codex-hook-config-path">${escapeHtml(preview.configPath)}</small>
    <p>${preview.configChanged ? `Esta alteração modifica somente os hooks do Ghosty nos eventos listados. Os demais hooks serão preservados.` : "O hooks.json não será alterado nesta operação."}</p>
    ${preview.backupWillBeCreated ? '<p class="codex-hook-backup-note">Antes de gravar, criarei um backup datado do hooks.json.</p>' : ""}
    <div class="codex-hook-change-list">${changes}</div>
    <small>Confirme para aplicar. Se o arquivo mudar depois desta prévia, o Ghosty cancela a gravação e pede uma nova revisão.</small>
    <div class="codex-hook-preview-actions"><button class="reset-button" data-action="codex-hook-apply" ${codexHooksBusy ? "disabled" : ""}>Confirmar ${action}</button><button class="text-button" data-action="codex-hook-cancel" ${codexHooksBusy ? "disabled" : ""}>Cancelar</button></div>
  </div>`;
}

async function refreshCodexHooksStatus() {
  try {
    codexHooksEnabled = await invoke<boolean>("codex_hooks_enabled");
    codexHooksNeedsReview = false;
    if (codexHooksEnabled) {
      const reviewState = await invoke<{ enabled: boolean; needsReview: boolean }>("codex_hooks_review_state");
      codexHooksEnabled = reviewState.enabled;
      codexHooksNeedsReview = reviewState.needsReview;
    }
    if (!codexHooksEnabled) setCodexTaskRunning(false);
    codexHooksStatusMessage = codexHooksEnabled
      ? codexHooksNeedsReview
        ? "Há uma atualização do hook para revisar. Nada será alterado até você confirmar."
        : "Hook conectado. Reinicie o Codex para garantir que a configuração atual seja carregada."
      : "Desativado. O Ghosty não acompanha sessões do Codex.";
  } catch (error) {
    codexHooksStatusMessage = `Não consegui consultar o Codex: ${String(error)}`;
  } finally {
    codexHooksBusy = false;
  }
  updateCodexIntegrationControls();
}

async function toggleCodexHooks() {
  if (codexHooksBusy) return;
  const enabled = codexHooksEnabled && codexHooksNeedsReview ? true : !codexHooksEnabled;
  codexHooksBusy = true;
  codexHooksStatusMessage = "Lendo a configuração atual para preparar a revisão…";
  updateCodexIntegrationControls();
  try {
    codexHookPreview = await invoke<CodexHookPreview>("codex_hooks_preview", { enabled });
    codexHooksStatusMessage = "Confira as entradas que serão alteradas antes de continuar.";
  } catch (error) {
    codexHooksStatusMessage = `Não consegui atualizar o Codex: ${String(error)}`;
  } finally {
    codexHooksBusy = false;
    render();
  }
}

async function applyCodexHookChange() {
  const preview = codexHookPreview;
  if (!preview || codexHooksBusy) return;
  codexHooksBusy = true;
  codexHooksStatusMessage = "Aplicando a alteração revisada…";
  updateCodexIntegrationControls();
  try {
    const result = await invoke<{ enabled: boolean; backupPath: string | null }>("apply_codex_hooks_change", {
      enabled: preview.enabled,
      expectedFingerprint: preview.fingerprint,
    });
    codexHooksEnabled = result.enabled;
    codexHooksNeedsReview = false;
    codexHookPreview = null;
    if (!codexHooksEnabled) {
      setCodexTaskRunning(false);
      clearPendingCodexApprovals();
      codexHooksStatusMessage = result.backupPath
        ? `Desconectado. Backup criado em ${result.backupPath}. Reinicie o Codex para descarregar a configuração antiga.`
        : "Desconectado. Reinicie o Codex para descarregar a configuração antiga.";
    } else {
      codexHooksStatusMessage = result.backupPath
        ? `Conectado. Backup criado em ${result.backupPath}. Reinicie o Codex para carregar os hooks revisados.`
        : "Conectado. Reinicie o Codex para carregar os hooks revisados.";
    }
  } catch (error) {
    codexHooksNeedsReview = true;
    codexHookPreview = null;
    codexHooksStatusMessage = `Não apliquei a alteração: ${String(error).replace(/^Error: /, "")}`;
  } finally {
    codexHooksBusy = false;
    render();
  }
}

function applyCodexHookEvents(events: CodexHookEvent[]) {
  recordCodexActivity(events);
  for (const event of events) {
    switch (event.eventName) {
      case "SessionStart":
        setCodexTaskRunning(false);
        setCodexPetActivity("idle");
        break;
      case "UserPromptSubmit":
        setCodexTaskRunning(true);
        setCodexPetActivity("thinking", "O Codex está pensando");
        break;
      case "PreToolUse":
        setCodexTaskRunning(true);
        setCodexPetActivity("working", event.toolName ? `O Codex está usando ${event.toolName}` : "O Codex está trabalhando");
        break;
      case "PermissionRequest":
        queueCodexApproval(event);
        break;
      case "PostToolUse":
        setCodexTaskRunning(true);
        setCodexPetActivity("thinking", "O Codex retomou o turno");
        break;
      case "SubagentStart":
        setCodexTaskRunning(true);
        setCodexPetActivity("working", event.agentType ? `O Codex delegou para ${event.agentType}` : "O Codex delegou uma tarefa");
        break;
      case "SubagentStop":
        setCodexTaskRunning(true);
        setCodexPetActivity("thinking", "O Codex retomou o turno");
        break;
      case "Stop":
        setCodexTaskRunning(false);
        clearPendingCodexApprovals();
        setCodexPetActivity("finished", "Tarefa concluída!");
        showGhostyTaskCompletion("Tarefa concluída!");
        break;
      case "Interrupt":
        setCodexTaskRunning(false);
        clearPendingCodexApprovals();
        setCodexPetActivity("question", "O turno do Codex foi interrompido");
        break;
      case "SessionEnd":
        setCodexTaskRunning(false);
        clearPendingCodexApprovals();
        setCodexPetActivity("idle");
        break;
    }
  }
}

async function pollCodexHookEvents() {
  if (!codexHooksEnabled || codexPollPending) return;
  codexPollPending = true;
  try {
    const events = await invoke<CodexHookEvent[]>("drain_codex_events");
    if (events.length > 0) applyCodexHookEvents(events);
  } catch {
    // A temporary queue read failure should not interrupt the island or Codex.
  } finally {
    codexPollPending = false;
  }
}

function savePocket(): boolean {
  try {
    localStorage.setItem(KEYS.pocket, JSON.stringify(pocketItems.slice(0, 8)));
    return true;
  } catch (error) {
    console.error("Não consegui salvar o Bolso do Ghosty", error);
    pocketNotice = "Não consegui salvar no armazenamento deste app";
    return false;
  }
}

function showPetDropFeedback(message: string) {
  petDropFeedback = message;
  const stage = app.querySelector<HTMLElement>(".pet-stage");
  stage?.classList.add("has-drop-feedback");
  const prompt = stage?.querySelector<HTMLElement>(".pet-drop-prompt");
  if (prompt) prompt.textContent = message;
  if (petDropFeedbackTimer !== undefined) window.clearTimeout(petDropFeedbackTimer);
  petDropFeedbackTimer = window.setTimeout(() => {
    petDropFeedback = "";
    petDropFeedbackTimer = undefined;
    const stage = app.querySelector<HTMLElement>(".pet-stage");
    stage?.classList.remove("has-drop-feedback");
    const prompt = stage?.querySelector<HTMLElement>(".pet-drop-prompt");
    if (prompt && !pocketDropActive) prompt.textContent = "";
  }, 1800);
}

function setPetReceivingFile(receiving: boolean, position?: { x: number; y: number }, scale = 1) {
  const pet = app.querySelector<HTMLElement>(".tab-view .pet");
  const motion = pet ? petMotionEngines.get(pet) : undefined;
  if (receiving) {
    const x = position ? position.x / scale : undefined;
    const y = position ? position.y / scale : undefined;
    motion?.prepareForFile(x, y);
  }
  else motion?.cancelFileReceive();
}

function updatePetFileCursor(position: { x: number; y: number }, scale = 1) {
  const pet = app.querySelector<HTMLElement>(".tab-view .pet");
  const motion = pet ? petMotionEngines.get(pet) : undefined;
  motion?.updateFileCursor(position.x / scale, position.y / scale);
}

function addPocketItem(item: PocketItem, origin?: { x: number; y: number }) {
  if (pocketItems.some((existing) => existing.value === item.value && existing.kind === item.kind)
    || pendingPocketValues.has(item.value)) {
    setPetReceivingFile(false);
    pocketNotice = "Esse já está guardado";
    if (origin) showPetDropFeedback("Esse já está no Bolso");
    refreshPocketUi();
    return;
  }
  const pendingItemsNotInPocket = [...pendingPocketValues].filter((value) =>
    !pocketItems.some((existing) => existing.value === value),
  ).length;
  if (pocketItems.length + pendingItemsNotInPocket >= 8) {
    setPetReceivingFile(false);
    pocketNotice = "O bolso está cheio — tire algo antes";
    if (origin) showPetDropFeedback("O Bolso está cheio");
    refreshPocketUi();
    return;
  }
  pendingPocketValues.add(item.value);
  pocketItems.unshift(item);
  pocketItems = pocketItems.slice(0, 8);
  if (!savePocket()) {
    setPetReceivingFile(false);
    pocketItems = pocketItems.filter((existing) => existing.id !== item.id);
    pendingPocketValues.delete(item.value);
    if (origin) showPetDropFeedback("Não consegui guardar o arquivo");
    refreshPocketUi();
    return;
  }
  const pet = app.querySelector<HTMLElement>(".tab-view .pet");
  if (pet) {
    const petTarget = pet.querySelector<HTMLCanvasElement>(".pet-canvas") ?? pet;
    const bounds = petTarget.getBoundingClientRect();
    const start = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const end = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height * 0.17 };
    const morsel = document.createElement("div");
    morsel.className = "pocket-morsel";
    morsel.textContent = item.kind === "image" ? "▧" : item.kind === "text" ? "¶" : "▤";
    morsel.style.left = `${start.x}px`;
    morsel.style.top = `${start.y}px`;
    morsel.style.setProperty("--morsel-x", `${end.x - start.x}px`);
    morsel.style.setProperty("--morsel-y", `${end.y - start.y}px`);
    document.body.append(morsel);
    petMotionEngines.get(pet)?.gulp();
    playGhostySound("ingest");
    pocketNotice = `${petName} está comendo…`;
    const petHint = app.querySelector<HTMLElement>(".pet-profile-hint");
    if (petHint) petHint.textContent = `${petName} está comendo ${item.name}`;
    setPetMood("chewing", 1400);
    requestAnimationFrame(() => morsel.classList.add("is-flying"));
    window.setTimeout(() => morsel.remove(), 500);
  } else {
    pocketNotice = "Guardado no Bolso — o original continua no lugar";
  }
  pocketDropActive = false;
  refreshPocketUi();
  window.setTimeout(() => {
    pendingPocketValues.delete(item.value);
    if (pocketItems.some((saved) => saved.id === item.id)) {
      pocketNotice = "Guardado no bolso — o original continua no lugar";
      if (origin) showPetDropFeedback("Guardado no Bolso do Ghosty");
    }
    savePocket();
    refreshPocketUi();
  }, 1600);
}

function fileKind(path: string): PocketItem["kind"] {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(path) ? "image" : "file";
}

function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

async function captureClipboardText(intoPocket = false, origin?: { x: number; y: number }) {
  try {
    const copiedText = (await invoke<string>("read_clipboard_text")).trim();
    const text = copiedText.slice(0, MAX_SAVED_TEXT);
    if (!text) {
     if (intoPocket) pocketNotice = "A prancheta está vazia.";
     else clipboardNotice = "A área de transferência está vazia.";
      if (intoPocket) refreshPocketUi();
      else refreshClipboardUi();
      return;
    }
    if (intoPocket) {
      addPocketItem({ id: makeId(), name: text.replace(/\s+/g, " ").slice(0, 28) || "Texto", kind: "text", value: text, addedAt: Date.now(), truncated: copiedText.length > MAX_SAVED_TEXT }, origin);
      return;
    }
    const existing = clipboardEntries.filter((entry) => entry.text !== text);
    const pinned = existing.filter((entry) => entry.pinned);
    const fresh: ClipboardEntry = { id: makeId(), text, addedAt: Date.now() };
    const recent = [fresh, ...existing.filter((entry) => !entry.pinned)].slice(0, Math.max(0, 12 - pinned.length));
    clipboardEntries = [...pinned, ...recent].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.addedAt - a.addedAt);
   localStorage.setItem(KEYS.clipboard, JSON.stringify(clipboardEntries));
   clipboardNotice = copiedText.length > MAX_SAVED_TEXT ? "Guardei os primeiros 50 mil caracteres." : "Texto guardado nesta prancheta.";
    refreshClipboardUi();
 } catch {
   if (intoPocket) pocketNotice = "Não consegui ler o texto da prancheta.";
   else clipboardNotice = "Não consegui ler o texto da prancheta.";
    if (intoPocket) refreshPocketUi();
    else refreshClipboardUi();
  }
}

async function copyClipboardText(text: string) {
  try {
    await invoke("write_clipboard_text", { text });
    clipboardNotice = "Copiado para a área de transferência.";
 } catch {
   clipboardNotice = "Não consegui copiar este texto.";
 }
  refreshClipboardUi();
}

function startFocus() {
  const remaining = focusRemainingMs();
  if (focusState.running) {
    if (remaining === 0) {
      finishFocus();
      return;
    }
    recordFocusSegment(false);
    focusState.running = false;
    focusState.remainingMs = remaining;
    focusState.endsAt = 0;
    focusState.startedAt = 0;
  } else {
    const duration = Math.max(1, Math.min(180, Number(app.querySelector<HTMLInputElement>("#focus-minutes")?.value) || Math.round(focusState.durationMs / 60_000))) * 60_000;
    focusState.durationMs = duration;
    focusState.remainingMs = remaining > 0 ? remaining : duration;
    focusState.startedAt = Date.now();
    focusState.endsAt = Date.now() + focusState.remainingMs;
    focusState.running = true;
    petMoodOverride = "";
  }
  persistFocus();
  paintFocusTimer();
}

function resetFocus() {
  if (focusState.running) recordFocusSegment(false);
  focusState.running = false;
  focusState.endsAt = 0;
  focusState.startedAt = 0;
  focusState.remainingMs = focusState.durationMs;
  persistFocus();
  paintFocusTimer();
}

function paintFocusTimer() {
  const remaining = focusRemainingMs();
  const countdown = app.querySelector<HTMLElement>("#focus-countdown");
  if (countdown) countdown.textContent = formatDuration(remaining);
  const progress = app.querySelector<HTMLElement>("#focus-progress");
  if (progress) progress.style.setProperty("--progress", `${100 - (remaining / Math.max(1, focusState.durationMs)) * 100}%`);
  const toggle = app.querySelector<HTMLButtonElement>("[data-action=focus-toggle]");
  if (toggle) toggle.textContent = focusState.running ? "Pausar" : remaining === 0 ? "Recomeçar" : "Iniciar foco";
  const durationInput = app.querySelector<HTMLInputElement>("#focus-minutes");
  if (durationInput) durationInput.disabled = focusState.running;
  const status = app.querySelector<HTMLElement>("#focus-status");
  if (status) status.textContent = focusState.running ? "Ghosty está focando com você" : remaining === 0 ? "Ciclo completo · hora de alongar" : "Escolha de 1 a 180 minutos";
  updatePetAtmosphere();
  const moodLabel = app.querySelector<HTMLElement>(".pet-mood-label");
  if (moodLabel) moodLabel.textContent = petMoodLabel();
}

function finishFocus() {
  recordFocusSegment(true);
  focusState.running = false;
  focusState.remainingMs = 0;
  focusState.endsAt = 0;
  focusState.startedAt = 0;
  persistFocus();
  setPetMood("happy", 12_000);
  playGhostySound("complete");
  paintFocusTimer();
  app.querySelectorAll<HTMLElement>(".pet").forEach((pet) => petMotionEngines.get(pet)?.setState("finished"));
}

function tickFeatures() {
  if (focusState.running) {
    if (focusRemainingMs() === 0 && currentWindowLabel === "main") finishFocus();
    else {
      paintFocusTimer();
      if (currentWindowLabel === "main" && Date.now() % 5000 < 1000) persistFocus();
    }
  }
  if (petMoodOverride && Date.now() >= petMoodUntil) {
    petMoodOverride = "";
    updatePetAtmosphere();
    const moodLabel = app.querySelector<HTMLElement>(".pet-mood-label");
    if (moodLabel) moodLabel.textContent = petMoodLabel();
  }
}

async function refreshMediaInfo() {
  if (mediaRefreshBusy) return;
  mediaRefreshBusy = true;
  try {
    const nextInfo = await invoke<MediaInfo>("get_media_info", {
      knownTrackId: mediaInfo.artworkDataUrl ? mediaInfo.trackId : null,
    });
    if (nextInfo.trackId === mediaInfo.trackId && !nextInfo.artworkDataUrl) {
      nextInfo.artworkDataUrl = mediaInfo.artworkDataUrl;
    }
    mediaInfo = nextInfo;
  } catch {
    mediaInfo = {
      title: "", artist: "", playing: false, source: "", trackId: "", artworkDataUrl: "",
      positionMs: 0, durationMs: 0, canSeek: false,
    };
  } finally {
    mediaRefreshBusy = false;
  }
  mediaUpdatedAt = Date.now();
  paintMediaInfo();
}

function currentMediaPosition() {
  const elapsed = mediaInfo.playing ? Math.max(0, Date.now() - mediaUpdatedAt) : 0;
  const position = mediaInfo.positionMs + elapsed;
  return mediaInfo.durationMs > 0 ? Math.min(position, mediaInfo.durationMs) : position;
}

function paintCollapsedMediaProgress() {
  const miniProgress = app.querySelector<HTMLElement>(".media-peek-progress");
  if (!miniProgress) return;
  const duration = Math.max(0, mediaInfo.durationMs);
  const ratio = duration > 0 ? Math.min(1, currentMediaPosition() / duration) : 0;
  miniProgress.style.setProperty("--media-progress", `${ratio * 100}%`);
}

function paintMediaInfo() {
  app.querySelectorAll<HTMLElement>(".media-title").forEach((element) => { element.textContent = mediaInfo.title || "Nada tocando agora"; });
  app.querySelectorAll<HTMLElement>(".media-artist").forEach((element) => { element.textContent = mediaInfo.artist || "Quando algo tocar, aparece aqui"; });
  app.querySelectorAll<HTMLElement>(".media-play-icon").forEach((element) => { element.innerHTML = menuIcon(mediaInfo.playing ? "pause" : "play"); });
  const mediaCard = app.querySelector<HTMLElement>(".coucou-home[data-home-panel=media] .coucou-focus-card");
  if (mediaCard) {
    if (mediaInfo.artworkDataUrl) mediaCard.style.setProperty("--media-artwork", `url('${mediaInfo.artworkDataUrl}')`);
    else mediaCard.style.removeProperty("--media-artwork");
  }
  const progress = app.querySelector<HTMLInputElement>("#media-progress");
  const duration = Math.max(0, mediaInfo.durationMs);
  if (progress) {
    progress.max = String(Math.max(1, duration));
    progress.disabled = !mediaInfo.canSeek || duration <= 0;
    if (!mediaSeekDragging) progress.value = String(Math.min(currentMediaPosition(), duration || 0));
  }
  const positionLabel = app.querySelector<HTMLElement>(".media-position");
  if (positionLabel) positionLabel.textContent = formatMediaTime(mediaSeekDragging && progress ? Number(progress.value) : currentMediaPosition());
  const durationLabel = app.querySelector<HTMLElement>(".media-duration");
  if (durationLabel) durationLabel.textContent = formatMediaTime(duration);

  const mediaPeek = app.querySelector<HTMLElement>(".media-peek");
  const mediaPeekImage = mediaPeek?.querySelector<HTMLImageElement>("img");
  if (mediaPeekImage && (mediaPeekImage.getAttribute("src") ?? "") !== mediaInfo.artworkDataUrl) {
    if (mediaInfo.artworkDataUrl) mediaPeekImage.setAttribute("src", mediaInfo.artworkDataUrl);
    else mediaPeekImage.removeAttribute("src");
  }
  paintCollapsedMediaProgress();
  const hasPlayingArtwork = mediaInfo.playing && Boolean(mediaInfo.artworkDataUrl);
  const island = app.querySelector<HTMLElement>(".edge-island");
  island?.classList.toggle("is-media-playing", hasPlayingArtwork);
  syncCollapsedMediaCapsule(island);
  syncCodexMediaBubble(island);
}

function bindAudioMixerInputs(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>(".audio-app-volume").forEach((slider) => {
    if (slider.dataset.bound === "true") return;
    slider.dataset.bound = "true";
    slider.addEventListener("input", () => {
      const processId = Number(slider.dataset.appId);
      const value = Number(slider.value);
      const appVolume = audioMixerApps.find((item) => item.processId === processId);
      if (appVolume) appVolume.volume = value;
      const output = slider.closest<HTMLElement>(".audio-app-row")?.querySelector<HTMLOutputElement>("output");
      if (output) output.value = `${value}%`;
      void invoke("set_app_volume", { processId, value }).catch(() => undefined);
    });
  });
}

async function refreshAudioMixer() {
  if (audioMixerRefreshBusy) return;
  audioMixerRefreshBusy = true;
  try {
    audioMixerApps = await invoke<AudioAppVolume[]>("get_app_volumes");
  } catch {
    audioMixerApps = [];
  } finally {
    audioMixerRefreshBusy = false;
  }
  const list = app.querySelector<HTMLElement>(".audio-app-list");
  if (!list) return;
  const nextIds = audioMixerApps.map((item) => item.processId).join(",");
  const currentIds = [...list.querySelectorAll<HTMLElement>(".audio-app-row")].map((row) => row.dataset.appId).join(",");
  if (nextIds !== currentIds) {
    list.innerHTML = renderAudioMixerApps();
    bindAudioMixerInputs(list);
    return;
  }
  for (const audioApp of audioMixerApps) {
    const row = list.querySelector<HTMLElement>(`.audio-app-row[data-app-id="${audioApp.processId}"]`);
    const slider = row?.querySelector<HTMLInputElement>(".audio-app-volume");
    const output = row?.querySelector<HTMLOutputElement>("output");
    if (slider && document.activeElement !== slider) slider.value = String(audioApp.volume);
    if (output) output.value = `${audioApp.volume}%`;
  }
}

function setVolumeMixerOpen(value: boolean) {
  if (volumeMixerOpen === value) return;
  volumeMixerOpen = value;
  const home = app.querySelector<HTMLElement>(".coucou-home[data-home-panel=media]");
  if (!home) return;
  home.dataset.volumeMixer = value ? "open" : "closed";
  const toggle = home.querySelector<HTMLButtonElement>("[data-action=media-mixer]");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(value));
    toggle.textContent = value ? "Fechar mixer" : "Volume dos apps";
    toggle.title = value ? "Fechar controles de volume por aplicativo" : "Abrir controles de volume por aplicativo";
  }
  const panel = home.querySelector<HTMLElement>(".audio-mixer-panel");
  if (panel) {
    panel.dataset.open = String(value);
    panel.setAttribute("aria-hidden", String(!value));
    panel.inert = !value;
  }
  const pills = home.querySelector<HTMLElement>(".coucou-pill-card");
  if (pills) {
    pills.setAttribute("aria-hidden", String(value));
    pills.inert = value;
  }
  if (value) void refreshAudioMixer();
}

function launchShortcut(shortcut: Shortcut) {
  if (shortcut.action === "focus") {
    if (!focusState.running) startFocus();
    void openUtilityPopup("focus");
    return;
  }
  void invoke("open_targets", { targets: shortcut.targets }).catch(() => undefined);
}

function launchSearch(value: string) {
  const query = value.trim();
  if (!query) return;
  const match = [...shortcuts, ...LAUNCHER_DEFAULTS].find((item) => item.name.toLowerCase() === query.toLowerCase());
  if (match) {
    launchShortcut(match);
    return;
  }
  const isAddress = /^(https?:\/\/|ms-[a-z-]+:|shell:|[a-z]:[\\/])/i.test(query) || /\.(exe|lnk|url|pdf|docx?|xlsx?|pptx?)$/i.test(query);
  const target = isAddress ? query : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  void invoke("open_targets", { targets: [target] }).catch(() => undefined);
}

function bindPetInteractions(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>(".pet").forEach((pet) => {
    const motion = new PetMotionEngine(pet);
    petMotionEngines.set(pet, motion);
    if (latestCodexPetState && latestCodexPetState.state !== "idle") {
      const age = Date.now() - latestCodexPetState.occurredAt;
      const lifetime = latestCodexPetState.state === "finished" ? 2100 : latestCodexPetState.state === "question" ? 5000 : 30_000;
      if (age <= lifetime) motion.setState(latestCodexPetState.state, false, latestCodexPetState.detail);
    }
    pet.addEventListener("mouseenter", () => {
      if (petLoveTimer !== undefined) window.clearTimeout(petLoveTimer);
      petLoveTimer = window.setTimeout(() => {
        petLoveTimer = undefined;
        if (pet.matches(":hover") && Date.now() - lastPetLove > 6000) {
          lastPetLove = Date.now();
          motion.love();
          setPetMood("happy", 1500);
        }
      }, 2000);
    });
    pet.addEventListener("mouseleave", () => {
      if (petLoveTimer !== undefined) window.clearTimeout(petLoveTimer);
      petLoveTimer = undefined;
      motion.lookAt(0, 0);
    });
    pet.addEventListener("click", () => {
      if (petLoveTimer !== undefined) window.clearTimeout(petLoveTimer);
      petLoveTimer = undefined;
      const reaction = motion.poke();
      if (reaction === "dizzy") setPetMood("dizzy", 1550);
      else if (reaction === "annoyed") setPetMood("annoyed", 800);
    });
  });
}

function bindPocketDropzone(dropzone: HTMLElement) {
  dropzone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    pocketDropActive = true;
    dropzone.classList.add("is-dragging");
    setPetReceivingFile(true, { x: event.clientX, y: event.clientY });
  });
  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragging");
    updatePetFileCursor({ x: event.clientX, y: event.clientY });
  });
  dropzone.addEventListener("dragleave", (event) => {
    if (!dropzone.contains(event.relatedTarget as Node | null)) {
      pocketDropActive = false;
      dropzone.classList.remove("is-dragging");
      setPetReceivingFile(false);
    }
  });
  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    pocketDropActive = false;
    dropzone.classList.remove("is-dragging");
    const text = event.dataTransfer?.getData("text/plain").trim();
    if (text) {
      setPetReceivingFile(true, { x: event.clientX, y: event.clientY });
      addPocketItem({ id: makeId(), name: text.replace(/\s+/g, " ").slice(0, 28), kind: "text", value: text.slice(0, MAX_SAVED_TEXT), addedAt: Date.now(), truncated: text.length > MAX_SAVED_TEXT }, { x: event.clientX, y: event.clientY });
    }
    else setPetReceivingFile(false);
  });
}

async function bindNativeFileDrop() {
  try {
    await getCurrentWindow().onDragDropEvent(async (event) => {
      if (getCurrentWindow().label === "utility-popup" && utilityPopupMode === "chat") return;
      if (event.payload.type === "enter") {
        pocketDropActive = true;
        const utilityPopup = getCurrentWindow().label === "utility-popup";
        if (!utilityPopup) updateActiveTab("pet");
        if (!utilityPopup) setExpanded(true);
        app.querySelector<HTMLElement>(".edge-island")?.classList.add("is-file-dragging");
        const dropzone = app.querySelector<HTMLElement>("[data-dropzone=pocket]");
        dropzone?.classList.add("is-dragging");
        if (utilityPopup) {
          const prompt = dropzone?.querySelector<HTMLElement>("strong");
          if (prompt) prompt.textContent = "Pode soltar, eu pego!";
        }
        const prompt = dropzone?.querySelector<HTMLElement>(".pet-drop-prompt");
        if (prompt) prompt.textContent = "Pode soltar, eu pego!";
        nativeDragScale = await getCurrentWindow().scaleFactor().catch(() => 1);
        setPetReceivingFile(true, event.payload.position, nativeDragScale);
        return;
      }
      if (event.payload.type === "over") {
        app.querySelector<HTMLElement>(".edge-island")?.classList.add("is-file-dragging");
        app.querySelector("[data-dropzone=pocket]")?.classList.add("is-dragging");
        updatePetFileCursor(event.payload.position, nativeDragScale);
        return;
      }
      if (event.payload.type === "leave") {
        pocketDropActive = false;
        setPetReceivingFile(false);
        app.querySelector<HTMLElement>(".edge-island")?.classList.remove("is-file-dragging");
        const dropzone = app.querySelector<HTMLElement>("[data-dropzone=pocket]");
        dropzone?.classList.remove("is-dragging");
        if (getCurrentWindow().label === "utility-popup") {
          const prompt = dropzone?.querySelector<HTMLElement>("strong");
          if (prompt) prompt.textContent = "Solte um arquivo ou texto";
        }
        const prompt = dropzone?.querySelector<HTMLElement>(".pet-drop-prompt");
        if (prompt) prompt.textContent = pocketItems.length ? "Arraste mais alguma coisa" : "Solte um arquivo ou texto no Ghosty";
        return;
      }

      pocketDropActive = false;
      app.querySelector<HTMLElement>(".edge-island")?.classList.remove("is-file-dragging");
      const dropzone = app.querySelector<HTMLElement>("[data-dropzone=pocket]");
      dropzone?.classList.remove("is-dragging");
      const prompt = dropzone?.querySelector<HTMLElement>(".pet-drop-prompt");
      const paths = event.payload.paths.filter((path) => path.trim().length > 0);
      if (paths.length === 0) {
        setPetReceivingFile(false);
        pocketNotice = "Não recebi o arquivo. Solte-o sobre o Ghosty novamente.";
        showPetDropFeedback("Não recebi o arquivo");
        if (getCurrentWindow().label === "utility-popup") {
          const prompt = dropzone?.querySelector<HTMLElement>("strong");
          if (prompt) prompt.textContent = "Não recebi o arquivo";
        }
        if (prompt) prompt.textContent = "Não recebi o arquivo";
        updateActiveTab(activeTab);
        return;
      }
      if (prompt) prompt.textContent = `${petName} está comendo…`;
      if (getCurrentWindow().label === "utility-popup") {
        const popupPrompt = dropzone?.querySelector<HTMLElement>("strong");
        if (popupPrompt) popupPrompt.textContent = "Guardando no Bolso…";
      }
      const origin = { x: event.payload.position.x / nativeDragScale, y: event.payload.position.y / nativeDragScale };
      updatePetFileCursor(event.payload.position, nativeDragScale);
      for (const path of paths) {
        addPocketItem({ id: makeId(), name: fileName(path), kind: fileKind(path), value: path, addedAt: Date.now() }, origin);
      }
    });
  } catch (error) {
    console.error("Não consegui ativar o arrasto de arquivos", error);
    pocketNotice = "O recebimento de arquivos não foi ativado";
    updateActiveTab(activeTab);
  }
}

function bindTabContent(tabView: HTMLElement) {
  bindPetInteractions(tabView);
  bindAudioMixerInputs(tabView);
  tabView.querySelectorAll<HTMLButtonElement>("[data-action=home-view]").forEach((button) => button.addEventListener("click", () => {
    const view = button.dataset.homeView;
    if (view === "now" || view === "activity" || view === "github" || view === "vercel" || view === "media") updateActiveHomeView(view);
  }));
  tabView.querySelector<HTMLButtonElement>("[data-action=open-panels-tab]")?.addEventListener("click", openPanelsInBar);
  if (activeTab === "panels") bindDashboardPopup(tabView);
  tabView.querySelector<HTMLButtonElement>("[data-action=open-shortcuts]")?.addEventListener("click", () => openSettingsWindow("shortcuts"));
  const volumeSlider = tabView.querySelector<HTMLInputElement>("#volume");
  volumeSlider?.addEventListener("input", (event) => {
    volume = Number((event.target as HTMLInputElement).value);
    const output = tabView.querySelector("#volume-value");
    if (output) output.textContent = `${volume}%`;
    void invoke("system_volume", { value: volume }).catch(() => undefined);
  });

  tabView.querySelector<HTMLButtonElement>("[data-action=media-mixer]")?.addEventListener("click", () => setVolumeMixerOpen(!volumeMixerOpen));
  tabView.querySelector<HTMLButtonElement>("[data-action=media-mixer-close]")?.addEventListener("click", () => setVolumeMixerOpen(false));
  const mediaProgress = tabView.querySelector<HTMLInputElement>("#media-progress");
  mediaProgress?.addEventListener("pointercancel", () => { mediaSeekDragging = false; });
  mediaProgress?.addEventListener("input", () => {
    mediaSeekDragging = true;
    const position = tabView.querySelector<HTMLElement>(".media-position");
    if (position) position.textContent = formatMediaTime(Number(mediaProgress.value));
  });
  mediaProgress?.addEventListener("change", () => {
    const positionMs = Number(mediaProgress.value);
    void invoke("seek_media_position", { positionMs })
      .then(() => refreshMediaInfo())
      .catch(() => refreshMediaInfo())
      .finally(() => { mediaSeekDragging = false; });
  });

  tabView.querySelectorAll<HTMLButtonElement>("[data-action^=media-]").forEach((button) => {
    button.addEventListener("click", () => {
      const actions: Record<string, string> = { "media-previous": "previous", "media-toggle": "play-pause", "media-next": "next" };
      const action = actions[button.dataset.action ?? ""];
      if (!action) return;
      void invoke("media_control", { action }).then(() => window.setTimeout(() => void refreshMediaInfo(), 500)).catch(() => undefined);
    });
  });
  tabView.querySelectorAll<HTMLElement>("[data-action=refresh-media]").forEach((button) => button.addEventListener("click", () => void refreshMediaInfo()));
  tabView.querySelector("[data-action=focus-toggle]")?.addEventListener("click", startFocus);
  tabView.querySelector("[data-action=focus-reset]")?.addEventListener("click", resetFocus);
  tabView.querySelector<HTMLInputElement>("#focus-minutes")?.addEventListener("change", (event) => {
    if (focusState.running) return;
    focusState.durationMs = Math.max(1, Math.min(180, Number((event.target as HTMLInputElement).value) || 25)) * 60_000;
    focusState.remainingMs = focusState.durationMs;
    persistFocus();
    paintFocusTimer();
  });

  tabView.querySelectorAll<HTMLElement>("[data-action=launch-item]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.launchId;
    const shortcut = [...shortcuts, ...LAUNCHER_DEFAULTS].find((item) => item.id === id);
    if (shortcut) launchShortcut(shortcut);
  }));
  tabView.querySelectorAll<HTMLInputElement>("[data-launcher-search]").forEach((input) => {
    input.addEventListener("input", () => {
      const searchText = input.value.trim();
      const query = searchText.toLowerCase();
      tabView.querySelectorAll<HTMLElement>(".launch-item").forEach((item) => {
        const matches = !!query && !!item.dataset.launchName?.includes(query);
        item.hidden = !!query && !matches;
        item.classList.toggle("is-search-match", matches);
      });
      const state = query && !focusState.running ? "searching" : focusState.running ? "working" : "idle";
      setPetActivity(state, state === "searching" ? searchText : "");
    });
    input.addEventListener("blur", () => {
      setPetActivity(focusState.running ? "working" : "idle");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        launchSearch(input.value);
      }
    });
  });

  tabView.querySelector("[data-action=clipboard-capture]")?.addEventListener("click", () => void captureClipboardText());
  tabView.querySelector("[data-action=pocket-clipboard]")?.addEventListener("click", (event) => {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    void captureClipboardText(true, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  });
  bindClipboardEntryActions(tabView);
  bindPocketItemActions(tabView);
  tabView.querySelectorAll<HTMLElement>("[data-dropzone=pocket]").forEach(bindPocketDropzone);

  tabView.querySelectorAll<HTMLButtonElement>("[data-action=open-utility-popup]").forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.popup;
    if (mode === "focus" || mode === "focus-summary" || mode === "codex-activity" || mode === "pocket" || mode === "customize" || mode === "clipboard" || mode === "dashboard" || mode === "chat") void openUtilityPopup(mode);
  }));
  bindGithubActions(tabView);

  const form = tabView.querySelector<HTMLFormElement>("[data-action=shortcut-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = (form.elements.namedItem("action-name") as HTMLInputElement).value.trim();
    const targets = (form.elements.namedItem("action-targets") as HTMLTextAreaElement).value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (!name || targets.length === 0) return;
    shortcuts.push({ id: makeId(), name: name.slice(0, 24), glyph: "↗", targets, custom: true });
    persistShortcuts();
    refreshShortcutsScreen();
  });
  tabView.querySelector("[data-action=toggle-shortcut-form]")?.addEventListener("click", () => {
    const customForm = tabView.querySelector<HTMLFormElement>("[data-action=shortcut-form]");
    if (!customForm) return;
    customForm.hidden = !customForm.hidden;
    if (!customForm.hidden) (customForm.elements.namedItem("action-name") as HTMLInputElement).focus();
  });
  tabView.querySelectorAll<HTMLButtonElement>("[data-action=run-shortcut]").forEach((button) => button.addEventListener("click", () => {
    const shortcut = shortcuts.find((item) => item.id === button.dataset.shortcutId);
    if (shortcut) launchShortcut(shortcut);
  }));
  tabView.querySelectorAll<HTMLButtonElement>("[data-action=remove-shortcut]").forEach((button) => button.addEventListener("click", () => {
    shortcuts = shortcuts.filter((item) => item.id !== button.dataset.shortcutId);
    persistShortcuts();
    refreshShortcutsScreen();
  }));

  const grid = tabView.querySelector<HTMLElement>("[data-dropzone=shortcuts]");
  if (grid) {
    grid.addEventListener("dragover", (event) => { event.preventDefault(); grid.classList.add("is-dragging"); });
    grid.addEventListener("dragleave", () => grid.classList.remove("is-dragging"));
    grid.addEventListener("drop", (event) => {
      event.preventDefault();
      grid.classList.remove("is-dragging");
      const target = (event.target as HTMLElement).closest<HTMLElement>(".shortcut-item");
      const targetId = target?.dataset.shortcutId ?? "";
      if (!draggedId || draggedId === targetId) return;
      const from = shortcuts.findIndex((item) => item.id === draggedId);
      const to = targetId ? shortcuts.findIndex((item) => item.id === targetId) : shortcuts.length - 1;
      if (from < 0 || to < 0) return;
      const [moved] = shortcuts.splice(from, 1);
      shortcuts.splice(Math.min(to, shortcuts.length), 0, moved);
      draggedId = "";
      persistShortcuts();
      refreshShortcutsScreen();
    });
    grid.querySelectorAll<HTMLElement>(".shortcut-item").forEach((item) => {
      item.addEventListener("dragstart", (event) => {
        draggedId = item.dataset.shortcutId ?? "";
        item.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", draggedId);
      });
      item.addEventListener("dragend", () => { draggedId = ""; item.classList.remove("is-dragging"); grid.classList.remove("is-dragging"); });
    });
  }
  updatePetAtmosphere();
  bindOnboarding(tabView);
}

function bindPocketItemActions(container: ParentNode) {
  container.querySelectorAll<HTMLButtonElement>("[data-action=ask-pocket]").forEach((button) => button.addEventListener("click", () => {
    const item = pocketItems.find((entry) => entry.id === button.dataset.pocketId);
    if (item) askAboutPocketItem(item);
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=open-pocket]").forEach((button) => button.addEventListener("click", () => {
    const item = pocketItems.find((entry) => entry.id === button.dataset.pocketId);
    if (!item) return;
    if (item.kind === "text") void copyClipboardText(item.value);
    else void invoke("open_targets", { targets: [item.value] }).catch(() => undefined);
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=remove-pocket]").forEach((button) => button.addEventListener("click", () => {
    pocketItems = pocketItems.filter((entry) => entry.id !== button.dataset.pocketId);
    savePocket();
    refreshPocketUi();
  }));
}

function bindClipboardEntryActions(container: ParentNode) {
  container.querySelectorAll<HTMLButtonElement>("[data-action=copy-clipboard]").forEach((button) => button.addEventListener("click", () => {
    const entry = clipboardEntries.find((item) => item.id === button.dataset.clipboardId);
    if (entry) void copyClipboardText(entry.text);
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=toggle-clipboard-pin]").forEach((button) => button.addEventListener("click", () => {
    const entry = clipboardEntries.find((item) => item.id === button.dataset.clipboardId);
    if (!entry) return;
    entry.pinned = !entry.pinned;
    clipboardEntries.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.addedAt - a.addedAt);
    localStorage.setItem(KEYS.clipboard, JSON.stringify(clipboardEntries));
    refreshClipboardUi();
  }));
  container.querySelectorAll<HTMLButtonElement>("[data-action=remove-clipboard]").forEach((button) => button.addEventListener("click", () => {
    clipboardEntries = clipboardEntries.filter((item) => item.id !== button.dataset.clipboardId);
    localStorage.setItem(KEYS.clipboard, JSON.stringify(clipboardEntries));
    refreshClipboardUi();
  }));
}

function refreshClipboardUi() {
  const lists = app.querySelectorAll<HTMLElement>(".clipboard-list");
  lists.forEach((list) => {
    list.innerHTML = renderClipboardEntries(list.closest(".utility-clipboard") ? 12 : 3);
    bindClipboardEntryActions(list);
  });
  app.querySelectorAll<HTMLElement>(".clipboard-status").forEach((status) => { status.textContent = clipboardNotice; });
  app.querySelectorAll<HTMLElement>(".home-clipboard-count").forEach((count) => { count.textContent = String(clipboardEntries.length); });
  refreshUtilityPopupSubtitle();
}

function refreshPocketUi() {
  const status = app.querySelector<HTMLElement>(".pocket-status");
  if (status) status.textContent = pocketNotice;
  const items = app.querySelector<HTMLElement>(".pocket-items");
  if (items) {
    items.innerHTML = renderPocketItems();
    bindPocketItemActions(items);
  }
  const dropPrompt = app.querySelector<HTMLElement>(".pocket-dropzone strong");
  if (dropPrompt) dropPrompt.textContent = pocketDropActive ? "Pode soltar, eu pego!" : "Solte um arquivo ou texto";
  app.querySelectorAll<HTMLElement>(".home-pocket-count").forEach((count) => { count.textContent = `${pocketItems.length}/8`; });
  refreshUtilityPopupSubtitle();
  updatePetAtmosphere();
}

function refreshUtilityPopupSubtitle() {
  const subtitle = app.querySelector<HTMLElement>("[data-popup-subtitle]");
  if (!subtitle || !utilityPopupMode) return;
  if (utilityPopupMode === "pocket") subtitle.textContent = `${pocketItems.length}/8 itens · os originais ficam no lugar`;
  else if (utilityPopupMode === "clipboard") subtitle.textContent = `${clipboardEntries.length} itens recentes`;
}

function updateActiveTab(tab: MenuTab) {
  const previousTab = activeTab;
  activeTab = tab;
  if (tab !== "home") volumeMixerOpen = false;
  const tabView = app.querySelector<HTMLElement>(".tab-view");
  if (!tabView) return;

  app.querySelectorAll<HTMLButtonElement>(".menu-tabs [data-tab]").forEach((button) => {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  tabView.innerHTML = renderActiveTab();
  bindTabContent(tabView);
  const island = app.querySelector<HTMLElement>(".edge-island");
  if (island) applyIslandVariables(island);
  if (expanded) animateIsland(true);
  if (tab === "home" && previousTab !== "home") void refreshMediaInfo();
  if (tab === "panels") {
    if (weatherLocation && !updatesPaused && (!weatherSnapshot || Date.now() - weatherSnapshot.checkedAt > 30 * 60_000)) void refreshWeather();
    if (googleAccount.connected && !updatesPaused && (!googleSnapshot || Date.now() - googleSnapshot.checkedAt > 5 * 60_000)) void refreshGoogleSnapshot();
  }
}

function updateActiveHomeView(view: HomeView) {
  activeHomeView = view;
  if (view !== "media") volumeMixerOpen = false;
  if (view === "github" || view === "vercel") activeHomeIntegration = view;
  const tabView = app.querySelector<HTMLElement>(".tab-view");
  if (!tabView || activeTab !== "home") return;
  const subtitle = app.querySelector<HTMLElement>(".header-title small");
  if (subtitle) subtitle.textContent = `${homeViewLabel(view)}${updatesPaused ? " · pausado" : ""}`;
  tabView.innerHTML = renderHomePage();
  bindTabContent(tabView);
  const island = app.querySelector<HTMLElement>(".edge-island");
  if (island) applyIslandVariables(island);
  if (expanded) animateIsland(true);
  if (view === "media") {
    void refreshMediaInfo();
    if (volumeMixerOpen) void refreshAudioMixer();
  }
}

function renderDisplayOptions() {
  if (displays.length === 0) return '<p class="settings-note">Nenhum monitor foi encontrado.</p>';
  const selectedId = getSelectedDisplayIds()[0];
  return displays.map((display) => `
    <label class="display-option">
      <input type="radio" name="selected-display" data-display-id="${escapeHtml(display.id)}" ${selectedId === display.id ? "checked" : ""} />
      <span><strong>${escapeHtml(display.name)}${display.isPrimary ? " · principal" : ""}</strong><small>${display.width} × ${display.height}</small></span>
    </label>`).join("");
}

function paintAppUpdateUi() {
  const status = app.querySelector<HTMLElement>("#app-update-status");
  if (status) status.textContent = appUpdateStatus;
  const checkButton = app.querySelector<HTMLButtonElement>("[data-action=check-app-update]");
  if (checkButton) {
    checkButton.disabled = appUpdateChecking || appUpdateInstalling;
    checkButton.textContent = appUpdateChecking ? "Verificando…" : "Verificar agora";
  }
  const installButton = app.querySelector<HTMLButtonElement>("[data-action=install-app-update]");
  if (installButton) {
    installButton.hidden = !availableAppUpdate;
    installButton.disabled = appUpdateChecking || appUpdateInstalling;
    installButton.textContent = appUpdateInstalling ? "Instalando…" : "Instalar e reiniciar";
  }
  app.querySelectorAll<HTMLButtonElement>(".settings-button").forEach((button) => {
    button.classList.toggle("has-app-update", Boolean(availableAppUpdate));
    button.setAttribute("aria-label", availableAppUpdate ? "Configurações — atualização disponível" : "Abrir configurações");
    button.title = availableAppUpdate ? "Atualização do Ghosty disponível" : "Configurações";
  });
}

async function checkForAppUpdate(manual = false) {
  if (appUpdateChecking || appUpdateInstalling) return;
  if (window.location.port === "1420") {
    if (manual) appUpdateStatus = "A verificação de atualizações fica disponível na versão instalada.";
    paintAppUpdateUi();
    return;
  }
  appUpdateChecking = true;
  if (manual) appUpdateStatus = "Procurando uma versão nova…";
  paintAppUpdateUi();
  try {
    const checkedUpdate = await checkAppUpdate();
    if (availableAppUpdate && availableAppUpdate !== checkedUpdate) {
      await availableAppUpdate.close().catch(() => undefined);
    }
    availableAppUpdate = checkedUpdate;
    appUpdateStatus = availableAppUpdate
      ? `A versão ${availableAppUpdate.version} está disponível.`
      : "O Ghosty já está na versão mais recente.";
  } catch {
    appUpdateStatus = manual
      ? "Não foi possível verificar agora. Confira a conexão e tente novamente."
      : "Não foi possível consultar atualizações agora.";
  } finally {
    appUpdateChecking = false;
    paintAppUpdateUi();
  }
}

async function installAppUpdate() {
  const update = availableAppUpdate;
  if (!update || appUpdateInstalling) return;
  appUpdateInstalling = true;
  appUpdateStatus = `Baixando a versão ${update.version}…`;
  paintAppUpdateUi();
  try {
    let downloadedBytes = 0;
    let totalBytes = 0;
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        const progress = totalBytes > 0 ? ` ${Math.min(100, Math.floor(downloadedBytes / totalBytes * 100))}%` : "";
        appUpdateStatus = `Baixando a atualização…${progress}`;
        paintAppUpdateUi();
      } else if (event.event === "Finished") {
        appUpdateStatus = "Instalação pronta. Reiniciando o Ghosty…";
        paintAppUpdateUi();
      }
    });
    appUpdateStatus = "A atualização foi iniciada. O instalador vai concluir e reiniciar o Ghosty.";
    paintAppUpdateUi();
    await relaunch();
  } catch {
    appUpdateInstalling = false;
    const failedUpdate = availableAppUpdate;
    availableAppUpdate = null;
    if (failedUpdate) void failedUpdate.close().catch(() => undefined);
    appUpdateStatus = "Não foi possível instalar a atualização. Tente novamente ou baixe o instalador no GitHub.";
    paintAppUpdateUi();
  }
}

function refreshGoogleSettingsUi() {
  if (currentWindowLabel === "settings-window" && settingsTab === "panels") renderSettingsWindow();
}

function renderSettingsContent() {
  if (settingsTab === "shortcuts") {
    return `
      <div class="settings-shortcuts-view">
        <section class="quick-chat-shortcuts-banner">
          <span class="quick-chat-shortcuts-icon" aria-hidden="true">✦</span>
          <div><small>CHAT RÁPIDO</small><strong>Seus atalhos também são comandos do Ghosty</strong><p>No chat rápido, peça pelo nome para abrir um atalho que você salvou aqui. O Ghosty usa apenas os destinos configurados nesta tela.</p></div>
        </section>
        ${renderShortcutsPage()}
      </div>`;
  }
  if (settingsTab === "panels") return renderPanelsSettings();
  const lengthLabel = isVerticalEdge() ? "Altura da barrinha" : "Largura da barrinha";
  return `
    <div class="settings-page">
      <div class="settings-scroll">
        <section class="settings-context-card">
        <p class="settings-intro">Ajuste a barrinha e escolha a tela onde o Edge Ghosty aparece.</p>
        <section class="control-card setting-card app-update-card">
          <div class="setting-heading">Atualizações do Ghosty</div>
          <small class="app-update-status" id="app-update-status" role="status">${escapeHtml(appUpdateStatus)}</small>
          <div class="app-update-actions">
            <button class="reset-button" data-action="check-app-update" type="button" ${appUpdateChecking || appUpdateInstalling ? "disabled" : ""}>${appUpdateChecking ? "Verificando…" : "Verificar agora"}</button>
            <button class="reset-button" data-action="install-app-update" type="button" ${availableAppUpdate ? "" : "hidden"} ${appUpdateChecking || appUpdateInstalling ? "disabled" : ""}>${appUpdateInstalling ? "Instalando…" : "Instalar e reiniciar"}</button>
          </div>
        </section>
        <section class="control-card setting-card">
          <div class="setting-heading"><label for="bar-length">${lengthLabel}</label><output id="bar-length-value">${barLength} px</output></div>
          <input id="bar-length" type="range" min="${MIN_LENGTH}" max="${MAX_LENGTH}" step="${LENGTH_STEP}" value="${barLength}" />
          <label class="setting-custom-number"><span>Valor personalizado</span><span><input type="number" data-number-for="bar-length" min="${MIN_LENGTH}" max="${MAX_LENGTH}" step="${LENGTH_STEP}" value="${barLength}" aria-label="Valor personalizado para ${lengthLabel.toLowerCase()}" /> px</span></label>
          <div class="range-labels"><span>${MIN_LENGTH} px</span><span>${MAX_LENGTH} px</span></div>
        </section>
        <section class="control-card setting-card">
          <div class="setting-heading"><label for="bar-thickness">Espessura da barrinha</label><output id="bar-thickness-value">${barThickness} px</output></div>
          <input id="bar-thickness" type="range" min="${MIN_THICKNESS}" max="${MAX_THICKNESS}" value="${barThickness}" />
          <label class="setting-custom-number"><span>Valor personalizado</span><span><input type="number" data-number-for="bar-thickness" min="${MIN_THICKNESS}" max="${MAX_THICKNESS}" step="1" value="${barThickness}" aria-label="Valor personalizado para espessura da barrinha" /> px</span></label>
          <div class="range-labels"><span>${MIN_THICKNESS} px</span><span>${MAX_THICKNESS} px</span></div>
        </section>
        <section class="control-card setting-card">
          <div class="setting-heading"><label for="bar-position">Posição na borda</label><output id="bar-position-value">${barPosition}%</output></div>
          <p class="settings-note">Escolha onde a barrinha fica ao longo da lateral. Ela permanece dentro dos limites da tela.</p>
          <input id="bar-position" type="range" min="0" max="100" step="1" value="${barPosition}" />
          <div class="range-labels"><span>Início da borda</span><span>Fim da borda</span></div>
        </section>
        <section class="control-card setting-card">
          <div class="setting-heading">Como abrir o Ghosty</div>
          <p class="settings-note">Escolha se a barrinha abre ao passar o cursor ou ao clicar.</p>
          <div class="interaction-choice-list" role="radiogroup" aria-label="Modo de abertura">
            <label class="interaction-choice ${interactionMode === "hover" ? "is-selected" : ""}"><input type="radio" name="interaction-mode" value="hover" ${interactionMode === "hover" ? "checked" : ""} /><span><strong>Ao passar o cursor</strong><small>Abre ao encostar na barrinha.</small></span><i aria-hidden="true"></i></label>
            <label class="interaction-choice ${interactionMode === "click" ? "is-selected" : ""}"><input type="radio" name="interaction-mode" value="click" ${interactionMode === "click" ? "checked" : ""} /><span><strong>Ao clicar</strong><small>Fica aberto até você fechar no ×.</small></span><i aria-hidden="true"></i></label>
          </div>
        </section>
        <section class="control-card setting-card">
          <label class="setting-heading" for="edge-select">Borda da tela</label>
          <select id="edge-select" aria-label="Borda da tela">
            <option value="left" ${edge === "left" ? "selected" : ""}>Esquerda · vertical</option>
            <option value="right" ${edge === "right" ? "selected" : ""}>Direita · vertical</option>
            <option value="top" ${edge === "top" ? "selected" : ""}>Em cima · horizontal</option>
            <option value="bottom" ${edge === "bottom" ? "selected" : ""}>Em baixo · horizontal</option>
          </select>
        </section>
        <section class="control-card setting-card displays-card">
          <div class="setting-heading">Monitor</div>
          <small class="settings-note">Escolha uma tela para mostrar o Ghosty.</small>
          <div class="display-list">${renderDisplayOptions()}</div>
        </section>
        <section class="control-card setting-card">
          <div class="setting-heading">Inicialização do Windows</div>
          <label class="display-option startup-setting-option">
            <input type="checkbox" data-autostart-toggle ${autoStartEnabled ? "checked" : ""} ${autoStartLoading || autoStartBusy ? "disabled" : ""} />
            <span><strong>Iniciar com o Windows</strong><small>Disponível quando você entrar na sua conta.</small></span>
          </label>
          <small class="settings-note autostart-status" data-autostart-status role="status">${escapeHtml(autoStartStatusText())}</small>
        </section>
        <section class="control-card setting-card">
          <div class="setting-heading"><label for="close-delay">Tempo para recolher</label><output id="close-delay-value">${closeDelay} ms</output></div>
          <input id="close-delay" type="range" min="${MIN_CLOSE_DELAY}" max="${MAX_CLOSE_DELAY}" step="50" value="${closeDelay}" />
          <div class="range-labels"><span>imediato</span><span>mais lento</span></div>
        </section>
        <section class="control-card setting-card codex-integration-card">
          <div class="setting-heading">Ghosty e Codex</div>
          <p class="codex-integration-copy">Nas sessões locais do Codex, as bolinhas indicam atividade e o Ghosty mostra pedidos de aprovação e conclusões. Os hooks não capturam prompts, respostas ou resultados de ferramentas.</p>
          <small class="codex-integration-status" id="codex-hooks-status" role="status">${escapeHtml(codexHooksStatusMessage)}</small>
          <button class="reset-button codex-integration-toggle" id="codex-hooks-toggle" type="button" ${codexHooksBusy ? "disabled" : ""}>${codexHooksBusy ? "Aguarde…" : codexHooksEnabled ? codexHooksNeedsReview ? "Revisar atualização" : "Desconectar Codex" : "Conectar Codex"}</button>
          ${renderCodexHookPreview()}
        </section>
        <section class="control-card setting-card github-integration-card">
          <div class="setting-heading">GitHub</div>
          <p class="settings-note">Acompanhe PRs, revisões pedidas e CI. Prefira um token fine-grained com Metadata e Pull requests em leitura; Checks e Commit statuses permitem mostrar o CI. O token fica no Gerenciador de Credenciais do Windows.</p>
          <form class="github-token-form" id="github-token-form">
            <label class="visually-hidden" for="github-token">Token pessoal do GitHub</label>
            <input id="github-token" type="password" maxlength="2400" autocomplete="new-password" spellcheck="false" placeholder="github_pat_…" aria-label="Token pessoal do GitHub" />
            <button class="reset-button" data-action="github-save-token" type="submit">Conectar</button>
          </form>
          <small class="github-settings-status" data-github-status role="status">${escapeHtml(githubStatusMessage)}</small>
          <div class="github-settings-actions">
            <button class="text-button" data-action="github-token-help" type="button">Criar token de leitura ↗</button>
            <button class="text-button" data-action="github-clear-token" type="button" ${githubConnected ? "" : "hidden"}>Desconectar</button>
          </div>
        </section>
        <section class="control-card setting-card vercel-integration-card">
          <div class="setting-heading">Vercel</div>
          <p class="settings-note">Consulte as cinco implantações recentes da conta pessoal ou equipe. O Ghosty não inicia nem cancela implantações. O token fica no Gerenciador de Credenciais do Windows; atualizações param quando você pausa pela bandeja.</p>
          <form class="github-token-form" id="vercel-token-form">
            <label class="visually-hidden" for="vercel-token">Token pessoal da Vercel</label>
            <input id="vercel-token" type="password" maxlength="2048" autocomplete="new-password" spellcheck="false" placeholder="Token da Vercel" aria-label="Token pessoal da Vercel" />
            <button class="reset-button" data-action="vercel-save-token" type="submit" ${updatesPaused ? "disabled" : ""}>Conectar</button>
          </form>
          <label class="vercel-team-field" for="vercel-team-id"><span>Equipe (opcional)</span><input id="vercel-team-id" type="text" maxlength="120" autocomplete="off" spellcheck="false" value="${escapeHtml(vercelTeamId)}" placeholder="team_…" /><small>Deixe vazio para consultar a conta pessoal.</small></label>
          <small class="github-settings-status" data-vercel-status role="status">${escapeHtml(vercelStatusMessage)}</small>
          <div class="github-settings-actions">
            <button class="text-button" data-action="vercel-token-help" type="button">Criar token da Vercel ↗</button>
            <button class="text-button" data-action="vercel-clear-token" type="button" ${vercelConnected ? "" : "hidden"}>Desconectar</button>
          </div>
        </section>
        <section class="control-card setting-card sound-settings-card">
          <div class="setting-heading">Sons do Ghosty</div>
          <label class="display-option"><input id="sound-enabled" type="checkbox" ${soundEnabled ? "checked" : ""} /><span><strong>Ativar sons discretos</strong><small>Toques curtos em interações, ingestão e conclusão.</small></span></label>
          <label class="sound-volume-setting" for="sound-volume"><span>Volume dos sons</span><output id="sound-volume-value">${soundVolume}%</output></label>
          <input id="sound-volume" type="range" min="0" max="100" value="${soundVolume}" ${soundEnabled ? "" : "disabled"} />
        </section>
        <p class="settings-note">As curvas do notch acompanham o comprimento e a orientação da barrinha.</p>
        <section class="control-card setting-card">
          <div class="setting-heading">Animação de entrada</div>
          <p class="settings-note">Reproduza a introdução no topo da tela e abra o assistente de configuração ao terminar.</p>
          <button class="reset-button" data-action=replay-onboarding-greeting type="button">Reproduzir animação de entrada</button>
        </section>
        <button class="reset-button" data-action="reopen-onboarding">Abrir assistente de configuração</button>
        <button class="reset-button" data-action="reset-settings">Restaurar configurações padrão</button>
        </section>
      </div>
    </div>`;
}

function renderPanelsSettings() {
  const connected = googleAccount.connected;
  const configured = googleAccount.configured;
  return `<div class="settings-page panels-settings-page"><div class="settings-scroll"><section class="settings-context-card">
    <p class="settings-intro">Conecte serviços que o Ghosty pode resumir nos seus painéis. O login Google acontece no navegador e a senha nunca passa pelo app.</p>
    <section class="control-card setting-card google-workspace-settings">
      <div class="google-settings-heading"><div><span class="section-kicker">PAINÉIS DO GHOSTY</span><div class="setting-heading">Google Workspace</div></div><span class="google-connection-dot ${connected ? "is-connected" : googleAuthPending ? "is-pending" : ""}" aria-hidden="true"></span></div>
      <p class="settings-note">${connected ? `Conectado como <strong>${escapeHtml(googleAccount.email ?? "conta Google")}</strong>.` : "Conecte sua conta para ativar Gmail, Agenda e Tarefas."}</p>
      <small id="google-account-status" class="github-settings-status" role="status">${escapeHtml(googleStatusMessage)}</small>
      ${connected ? `<div class="google-workspace-actions"><button class="reset-button" data-action="google-refresh-settings" type="button" ${googleLoading || updatesPaused ? "disabled" : ""}>${googleLoading ? "Atualizando…" : "Atualizar agora"}</button><button class="text-button" data-action="google-disconnect" type="button">Desconectar deste dispositivo</button></div>` : `<div class="google-workspace-actions"><button class="reset-button" data-action="google-connect" type="button" ${!configured || googleAuthPending || googleStatusLoading ? "disabled" : ""}>${!configured ? "Indisponível nesta versão" : googleAuthPending ? "Aguardando Google…" : "Conectar Google"}</button>${googleAuthPending ? `<button class="text-button" data-action="google-auth-cancel" type="button">Cancelar login</button>` : ""}</div>`}
      <div class="google-permissions-note"><strong>Permissões solicitadas</strong><span>Gmail: ver cabeçalhos, marcar como lido e arquivar. A API exige escopo de modificação, embora o Ghosty não envie mensagens.</span><span>Agenda: somente leitura. Tarefas: listar, criar e concluir tarefas.</span><span>Os tokens ficam no Gerenciador de Credenciais do Windows. Remover a conexão apaga o token local; a autorização na conta Google pode ser revogada em <button class="text-button" data-action="google-open-link" data-google-url="https://myaccount.google.com/permissions" type="button">Permissões da Conta Google ↗</button>.</span></div>
      <small class="settings-note">Na primeira conexão, escolha sua conta Google no navegador e aprove as permissões acima. Você pode revogar o acesso a qualquer momento nas permissões da Conta Google.</small>
    </section>
    <section class="control-card setting-card dashboard-local-settings"><div class="setting-heading">Notificações e clima</div><p class="settings-note">Avisos resumidos ficam neste dispositivo. A cidade só é consultada depois que você a escolher; o Ghosty não pede localização automática.</p><button class="reset-button" data-action="open-dashboard" type="button">Ir para a aba Painéis na barra</button></section>
  </section></div></div>`;
}

function renderSettingsWindow() {
  document.body.dataset.window = "settings";
  const title = settingsTab === "shortcuts" ? "Atalhos" : settingsTab === "panels" ? "Painéis" : "Geral";
  const subtitle = settingsTab === "shortcuts"
    ? "Organize o que o Ghosty pode abrir por você."
    : settingsTab === "panels" ? "Conecte contas e configure seus painéis."
      : "Ajuste a barrinha, o comportamento e as integrações.";
  app.innerHTML = `
    <div class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-brand"><span class="settings-brand-mark">${menuIcon("brand")}</span><span><strong>Edge Ghosty</strong><small>Preferências</small></span></div>
        <nav class="settings-nav" aria-label="Configurações">
          <button class="settings-nav-item ${settingsTab === "general" ? "is-active" : ""}" data-settings-tab="general"><span>${menuIcon("settings")}</span>Geral</button>
          <button class="settings-nav-item ${settingsTab === "shortcuts" ? "is-active" : ""}" data-settings-tab="shortcuts"><span>${menuIcon("shortcuts")}</span>Atalhos</button>
          <button class="settings-nav-item ${settingsTab === "panels" ? "is-active" : ""}" data-settings-tab="panels"><span>${menuIcon("home")}</span>Painéis</button>
        </nav>
        <div class="settings-sidebar-pet">
          ${renderPetCharacter("settings-sidebar-ghosty")}
          <span><strong>${escapeHtml(petName)}</strong><small>sempre por perto</small></span>
        </div>
      </aside>
      <main class="settings-workspace">
        <header class="settings-window-header"><div><span class="settings-eyebrow">EDGE GHOSTY · CONFIGURAÇÕES</span><h1>${title}</h1><p>${subtitle}</p></div><button class="settings-window-close" data-action="settings-window-close" aria-label="Ocultar configurações" title="Fechar">×</button></header>
        <div class="settings-content">${renderSettingsContent()}</div>
      </main>
    </div>`;
  bindPetInteractions(app);
  app.querySelectorAll<HTMLButtonElement>("[data-settings-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.settingsTab;
    if (tab !== "general" && tab !== "shortcuts" && tab !== "panels") return;
    settingsTab = tab;
    localStorage.setItem(KEYS.settingsTab, tab);
    renderSettingsWindow();
  }));
  app.querySelector<HTMLButtonElement>("[data-action=settings-window-close]")?.addEventListener("click", () => {
    void getCurrentWindow().hide().catch(() => undefined);
  });
  if (settingsTab === "shortcuts") {
    const shortcutContent = app.querySelector<HTMLElement>(".settings-content");
    if (shortcutContent) bindTabContent(shortcutContent);
  }
  bindSettings();
}

function setExpanded(value: boolean) {
  if (expanded === value) return;
  const island = app.querySelector<HTMLElement>(".edge-island");
  if (!island) return;
  freezeIslandGeometry(island);
  expanded = value;
  island.classList.toggle("is-expanded", value);
  if (value) clearTaskCompletionToast(island);
  updateCodexApprovalPresentation();
  if (value && !onboardingLaunchGreetingActive) {
    const pet = island.querySelector<HTMLElement>(".pet");
    const motion = pet ? petMotionEngines.get(pet) : undefined;
    if (motion) {
      if (hasGreetedPet) motion.greet();
      else {
        hasGreetedPet = true;
        motion.welcome();
      }
    }
  }
  if (hoverCloseTimer !== undefined) {
    window.clearTimeout(hoverCloseTimer);
    hoverCloseTimer = undefined;
  }
  animateIsland(value);
}

function scheduleClose() {
  if (onboardingOpen) return;
  if (hoverCloseTimer !== undefined) window.clearTimeout(hoverCloseTimer);
  hoverCloseTimer = window.setTimeout(() => {
    hoverCloseTimer = undefined;
    const body = app.querySelector<HTMLElement>(".island-body");
    // DOM leave can arrive before the native cursor poll reports that the pointer exited.
    if (expanded && (body?.matches(":hover") || wasPointerInNativeIsland)) return;
    setExpanded(false);
  }, closeDelay);
}

function bindRange(
  selector: string,
  update: (value: number) => void,
  outputSelector: string,
  format: (value: number) => string,
) {
  app.querySelector<HTMLInputElement>(selector)?.addEventListener("input", (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    update(value);
    const output = app.querySelector<HTMLOutputElement>(outputSelector);
    if (output) output.value = format(value);
    const customNumber = app.querySelector<HTMLInputElement>(`[data-number-for="${selector.slice(1)}"]`);
    if (customNumber) customNumber.value = String(value);
    const island = app.querySelector<HTMLElement>(".edge-island");
    if (island) {
      applyIslandVariables(island);
      const body = island.querySelector<HTMLElement>(".island-body");
      if (body) publishNativeHitBounds(body);
    }
    persistSettings();
  });
}

function bindCustomRangeNumbers() {
  app.querySelectorAll<HTMLInputElement>("[data-number-for]").forEach((input) => input.addEventListener("change", () => {
    const id = input.dataset.numberFor;
    const range = id ? app.querySelector<HTMLInputElement>(`#${id}`) : null;
    if (!range) return;
    const minimum = Number(range.min);
    const maximum = Number(range.max);
    const step = Number(range.step) || 1;
    const typed = Number(input.value);
    const bounded = Math.max(minimum, Math.min(maximum, Number.isFinite(typed) ? typed : Number(range.value)));
    const snapped = Math.max(minimum, Math.min(maximum, minimum + Math.round((bounded - minimum) / step) * step));
    input.value = String(snapped);
    range.value = String(snapped);
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  }));
}

function bindSettings() {
  app.querySelector<HTMLButtonElement>("[data-action=check-app-update]")?.addEventListener("click", () => void checkForAppUpdate(true));
  app.querySelector<HTMLButtonElement>("[data-action=install-app-update]")?.addEventListener("click", () => void installAppUpdate());
  app.querySelector<HTMLButtonElement>("#codex-hooks-toggle")?.addEventListener("click", () => void toggleCodexHooks());
  app.querySelector<HTMLButtonElement>("[data-action=codex-hook-apply]")?.addEventListener("click", () => void applyCodexHookChange());
  app.querySelector<HTMLButtonElement>("[data-action=codex-hook-cancel]")?.addEventListener("click", () => {
    codexHookPreview = null;
    codexHooksStatusMessage = codexHooksNeedsReview
      ? "Atualização pendente. Nada foi alterado; revise quando quiser."
      : codexHooksEnabled ? "Hook conectado." : "Desativado. O Ghosty não acompanha sessões do Codex.";
    render();
  });
  app.querySelector<HTMLFormElement>("#github-token-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveGithubToken();
  });
  app.querySelector<HTMLFormElement>("#vercel-token-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveVercelToken();
  });
  app.querySelector<HTMLButtonElement>("[data-action=vercel-clear-token]")?.addEventListener("click", () => void clearVercelToken());
  app.querySelector<HTMLButtonElement>("[data-action=google-connect]")?.addEventListener("click", () => void startGoogleAuth());
  app.querySelector<HTMLButtonElement>("[data-action=google-auth-cancel]")?.addEventListener("click", () => void cancelGoogleAuth());
  app.querySelector<HTMLButtonElement>("[data-action=google-disconnect]")?.addEventListener("click", () => void disconnectGoogleWorkspace());
  app.querySelector<HTMLButtonElement>("[data-action=google-refresh-settings]")?.addEventListener("click", () => void refreshGoogleSnapshot());
  app.querySelectorAll<HTMLButtonElement>("[data-action=google-open-link]").forEach((button) => button.addEventListener("click", () => {
    const target = safeQuickChatWebsiteUrl(button.dataset.googleUrl);
    if (target) void invoke("open_targets", { targets: [target] }).catch((error) => {
      googleStatusMessage = String(error);
      refreshGoogleSettingsUi();
    });
  }));
  app.querySelector<HTMLButtonElement>("[data-action=open-dashboard]")?.addEventListener("click", () => {
    openPanelsInBar();
  });
  app.querySelector<HTMLButtonElement>("[data-action=vercel-token-help]")?.addEventListener("click", () => {
    void invoke("open_targets", { targets: ["https://vercel.com/account/tokens"] }).catch(() => undefined);
  });
  app.querySelector<HTMLInputElement>("#vercel-team-id")?.addEventListener("change", (event) => {
    vercelTeamId = (event.currentTarget as HTMLInputElement).value.trim();
    localStorage.setItem(KEYS.vercelTeamId, vercelTeamId);
    vercelSnapshot = null;
    if (vercelConnected && !updatesPaused) void refreshVercelSnapshot();
  });
  app.querySelector<HTMLButtonElement>("[data-action=github-clear-token]")?.addEventListener("click", () => void clearGithubToken());
  app.querySelector<HTMLButtonElement>("[data-action=github-token-help]")?.addEventListener("click", () => {
    void invoke("open_targets", { targets: ["https://github.com/settings/personal-access-tokens/new"] }).catch(() => undefined);
  });
  app.querySelector<HTMLInputElement>("#sound-enabled")?.addEventListener("change", (event) => {
    soundEnabled = (event.target as HTMLInputElement).checked;
    localStorage.setItem(KEYS.soundsEnabled, String(soundEnabled));
    setGhostySoundEnabled(soundEnabled);
    const slider = app.querySelector<HTMLInputElement>("#sound-volume");
    if (slider) slider.disabled = !soundEnabled;
    if (soundEnabled) playGhostySound("tap");
  });
  app.querySelector<HTMLInputElement>("#sound-volume")?.addEventListener("input", (event) => {
    soundVolume = Number((event.target as HTMLInputElement).value);
    localStorage.setItem(KEYS.soundVolume, String(soundVolume));
    setGhostySoundVolume(soundVolume / 100);
    const output = app.querySelector<HTMLOutputElement>("#sound-volume-value");
    if (output) output.value = `${soundVolume}%`;
  });
  if (currentWindowLabel === "settings-window") {
    app.querySelector<HTMLInputElement>("[data-autostart-toggle]")?.addEventListener("change", (event) => {
      void setAutoStartEnabled((event.target as HTMLInputElement).checked);
    });
  }
  app.querySelector<HTMLButtonElement>("[data-action=reopen-onboarding]")?.addEventListener("click", () => {
    if (currentWindowLabel === "settings-window") void invoke("open_onboarding").catch(() => undefined);
    else openOnboarding();
  });
  app.querySelector<HTMLButtonElement>("[data-action=replay-onboarding-greeting]")?.addEventListener("click", () => {
    if (currentWindowLabel === "settings-window") void invoke("replay_onboarding_greeting").catch(() => undefined);
    else void replayOnboardingLaunchGreeting();
  });
  bindRange("#bar-length", (value) => { barLength = value; }, "#bar-length-value", (value) => `${value} px`);
  bindRange("#bar-thickness", (value) => { barThickness = value; }, "#bar-thickness-value", (value) => `${value} px`);
  bindRange("#bar-position", (value) => { barPosition = value; }, "#bar-position-value", (value) => `${value}%`);
  bindRange("#close-delay", (value) => { closeDelay = value; }, "#close-delay-value", (value) => `${value} ms`);
  bindCustomRangeNumbers();

  app.querySelectorAll<HTMLInputElement>("[name=interaction-mode]").forEach((input) => input.addEventListener("change", () => {
    const value = input.value;
    if (value !== "hover" && value !== "click") return;
    interactionMode = value;
    localStorage.setItem(KEYS.interactionMode, value);
    app.querySelectorAll<HTMLElement>(".interaction-choice").forEach((choice) => {
      choice.classList.toggle("is-selected", choice.querySelector<HTMLInputElement>("input")?.checked === true);
    });
  }));
  app.querySelectorAll<HTMLInputElement>("#bar-length, #bar-thickness, #bar-position")
    .forEach((input) => input.addEventListener("change", () => void applyDisplayLayout()));
  app.querySelectorAll<HTMLInputElement>("[data-number-for]").forEach((input) => input.addEventListener("change", () => void applyDisplayLayout()));

  app.querySelector<HTMLSelectElement>("#edge-select")?.addEventListener("change", (event) => {
    edge = (event.target as HTMLSelectElement).value as Edge;
    persistSettings();
    render();
    void applyDisplayLayout();
  });
  app.querySelectorAll<HTMLInputElement>("[data-display-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.displayId!;
      selectedDisplayIds = [id];
      allDisplays = false;
      persistSettings();
      render();
      void applyDisplayLayout();
    });
  });
}

function bindCodexApprovalButtons(container: ParentNode) {
  container.querySelectorAll<HTMLButtonElement>("[data-ghosty-approval]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const requestId = button.dataset.requestId;
      const decision = button.dataset.ghostyApproval;
      if (requestId && (decision === "allow" || decision === "deny")) {
        void resolveCodexApproval(requestId, decision);
      }
    });
  });
}

function completeOnboardingLaunchGreeting() {
  if (!onboardingLaunchGreetingActive) return;
  launchGreetingRenderer?.stop();
  launchGreetingRenderer = null;
  launchGreetingStartedAt = null;
  onboardingLaunchGreetingActive = false;
  onboardingLaunchDocking = true;
  onboardingLaunchDockOffset = null;
  render();

  const dockingStartedAt = performance.now();
  const dockDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 760;
  const dockGhosty = (now: number) => {
    if (!onboardingLaunchDocking) return;
    const island = app.querySelector<HTMLElement>(".edge-island");
    const body = island?.querySelector<HTMLElement>(".island-body");
    const stage = island?.querySelector<HTMLElement>(".launch-greeting-stage");
    const hero = island?.querySelector<HTMLElement>(".onboarding-hero");
    if (!body || !stage || !hero) {
      onboardingLaunchDocking = false;
      render();
      return;
    }

    // Track the destination every frame while the island expands. This keeps the
    // dock motion attached to the hero even as the onboarding layout is still moving.
    const progress = Math.min(1, Math.max(0, (now - dockingStartedAt) / dockDuration));
    const eased = 1 - Math.pow(1 - progress, 3);
    const bodyRect = body.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const targetX = heroRect.left + heroRect.width / 2 - (bodyRect.left + bodyRect.width / 2);
    const targetY = heroRect.top + heroRect.height / 2 - (bodyRect.top + 75);
    const x = targetX * eased;
    const y = targetY * eased;
    const scale = 1 - 0.3 * eased;
    onboardingLaunchDockOffset = { x, y, scale };
    stage.style.setProperty("--launch-dock-x", `${x}px`);
    stage.style.setProperty("--launch-dock-y", `${y}px`);
    stage.style.setProperty("--launch-dock-scale", String(scale));

    if (progress < 1) {
      window.requestAnimationFrame(dockGhosty);
      return;
    }

    onboardingLaunchDockTimer = window.setTimeout(() => {
      onboardingLaunchDockTimer = undefined;
      if (!onboardingLaunchDocking) return;
      onboardingLaunchDocking = false;
      onboardingLaunchDockOffset = null;
      onboardingWelcomeOptionsRevealing = true;
      render();
      onboardingWelcomeRevealTimer = window.setTimeout(() => {
        onboardingWelcomeRevealTimer = undefined;
        onboardingWelcomeOptionsRevealing = false;
        app.querySelector<HTMLElement>(".edge-island")?.classList.remove("onboarding-options-revealing");
      }, 680);
    }, 40);
  };
  window.requestAnimationFrame(dockGhosty);
}

function resetOnboardingLaunchTransition() {
  if (onboardingLaunchDockTimer !== undefined) window.clearTimeout(onboardingLaunchDockTimer);
  if (onboardingWelcomeRevealTimer !== undefined) window.clearTimeout(onboardingWelcomeRevealTimer);
  onboardingLaunchDockTimer = undefined;
  onboardingWelcomeRevealTimer = undefined;
  onboardingLaunchDocking = false;
  onboardingWelcomeOptionsRevealing = false;
  onboardingLaunchDockOffset = null;
}

async function replayOnboardingLaunchGreeting() {
  if (currentWindowLabel !== "main" || onboardingLaunchGreetingActive || onboardingLaunchDocking || launchGreetingReplayRestore) return;
  await mainStartupPromise?.catch(() => undefined);
  if (onboardingLaunchGreetingActive || onboardingLaunchDocking || launchGreetingReplayRestore) return;

  resetOnboardingLaunchTransition();
  launchGreetingReplayRestore = { edge, barPosition, onboardingIntroStarted };
  edge = "top";
  barPosition = DEFAULTS.barPosition;
  onboardingOpen = true;
  onboardingStep = "welcome";
  onboardingIntroStarted = true;
  onboardingSelectedShortcutIds = new Set(shortcuts.slice(0, 3).map((shortcut) => shortcut.id));
  onboardingInteractionMode = interactionMode;
  activeTab = "home";
  onboardingLaunchGreetingActive = true;
  expanded = false;
  render();

  await applyDisplayLayout(false);
  if (onboardingLaunchGreetingActive) startOnboardingLaunchGreeting();
}

function startOnboardingLaunchGreeting() {
  if (!onboardingOpen || !onboardingLaunchGreetingActive) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    onboardingLaunchGreetingActive = false;
    render();
    setExpanded(true);
    return;
  }

  setExpanded(true);
  const startedAt = performance.now();
  launchGreetingStartedAt = startedAt;
  const pet = app.querySelector<HTMLElement>(".launch-greeting-pet");
  const motion = pet ? petMotionEngines.get(pet) : undefined;
  motion?.welcome(startedAt, true);
  const canvas = app.querySelector<HTMLCanvasElement>(".launch-greeting-effects");
  if (!canvas) {
    completeOnboardingLaunchGreeting();
    return;
  }
  launchGreetingRenderer = new LaunchGreeting(canvas);
  launchGreetingRenderer.start(startedAt, completeOnboardingLaunchGreeting);
}

function render() {
  if (currentWindowLabel === "settings-window") {
    renderSettingsWindow();
    return;
  }
  const previousIsland = app.querySelector<HTMLElement>(".edge-island");
  const previousLaunchPet = previousIsland?.querySelector<HTMLElement>(".launch-greeting-pet");
  if (previousLaunchPet) {
    petMotionEngines.get(previousLaunchPet)?.dispose();
    petMotionEngines.delete(previousLaunchPet);
  }
  launchGreetingRenderer?.stop();
  launchGreetingRenderer = null;
  const previousBody = previousIsland?.querySelector<HTMLElement>(".island-body");
  const previousGeometry = previousBody
    && previousIsland?.dataset.edge === edge
    && (expanded || previousIsland.classList.contains("is-media-capsule"))
    ? {
      width: previousBody.getBoundingClientRect().width,
      height: previousBody.getBoundingClientRect().height,
      radius: currentRadius(getComputedStyle(previousBody)),
    }
    : null;
  app.innerHTML = `
    <section class="edge-island ${expanded ? "is-expanded" : ""} ${mediaInfo.playing && mediaInfo.artworkDataUrl ? "is-media-playing" : ""} ${shouldShowCollapsedMediaCapsule(previousIsland) ? "is-media-capsule" : ""} ${codexTaskRunning && mediaInfo.playing ? "is-codex-media-active" : ""} ${onboardingOpen ? "onboarding-open" : ""} ${onboardingLaunchGreetingActive ? "onboarding-launch-greeting" : ""} ${onboardingLaunchDocking ? "onboarding-launch-docking" : ""} ${onboardingWelcomeOptionsRevealing ? "onboarding-options-revealing" : ""} ${codexTaskRunning ? "is-task-running" : ""} ${pendingCodexApprovals.length > 0 ? "is-approval-pending" : ""}" aria-label="Edge Ghosty">
      <div class="island-body">
        <button class="peek-line" aria-label="${codexTaskRunning ? "Uma tarefa do Codex está em andamento. Abrir Edge Ghosty." : "Abrir Edge Ghosty"}"><span></span><span></span><span></span></button>
        <div class="media-peek" aria-hidden="true"><img alt="" draggable="false"${mediaInfo.artworkDataUrl ? ` src="${escapeHtml(mediaInfo.artworkDataUrl)}"` : ""}></div>
        <div class="media-peek-progress" aria-hidden="true" style="--media-progress:${mediaInfo.durationMs > 0 ? Math.min(1, currentMediaPosition() / mediaInfo.durationMs) * 100 : 0}%"><span></span></div>
        ${onboardingLaunchGreetingActive || onboardingLaunchDocking ? `<div class="launch-greeting-stage pet-stage" aria-hidden="true" style="--launch-dock-x:${onboardingLaunchDockOffset?.x ?? 0}px;--launch-dock-y:${onboardingLaunchDockOffset?.y ?? 0}px;--launch-dock-scale:${onboardingLaunchDockOffset?.scale ?? 1}"><canvas class="launch-greeting-effects"></canvas>${renderLaunchGreetingPet()}</div>` : ""}
        <div class="island-content">
          <header class="menu-header">
            ${onboardingOpen ? '<div class="onboarding-brand">EDGE GHOSTY</div>' : `<nav class="menu-tabs" role="group" aria-label="Seções do Edge Ghosty">
              <button class="icon-button menu-tab ${activeTab === "home" ? "is-active" : ""}" aria-pressed="${activeTab === "home"}" data-tab="home" aria-label="Início" title="Início">${menuIcon("home")}</button>
              <button class="icon-button menu-tab ${activeTab === "pet" ? "is-active" : ""}" aria-pressed="${activeTab === "pet"}" data-tab="pet" aria-label="Pet" title="Pet">${menuIcon("pet")}</button>
              <button class="icon-button menu-tab ${activeTab === "panels" ? "is-active" : ""}" aria-pressed="${activeTab === "panels"}" data-tab="panels" aria-label="Painéis" title="Painéis">${menuIcon("panels")}${dashboardUnreadCount() ? `<i>${Math.min(99, dashboardUnreadCount())}</i>` : ""}</button>
            </nav>`}
            ${onboardingOpen ? "" : `<div class="menu-header-actions">
              <button class="icon-button settings-button ${availableAppUpdate ? "has-app-update" : ""}" data-action="settings" aria-label="${availableAppUpdate ? "Configurações — atualização disponível" : "Abrir configurações"}" title="${availableAppUpdate ? "Atualização do Ghosty disponível" : "Configurações"}">${menuIcon("settings")}</button>
              <button class="icon-button close-button" data-action="close" aria-label="Fechar" title="Fechar">${menuIcon("close")}</button>
            </div>`}
          </header>
          <main class="tab-view" role="tabpanel">${renderActiveTab()}</main>
        </div>
        <div class="ghosty-inline-approval" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="ghosty-inline-approval-title">
          ${renderPetCharacter("ghosty-inline-approval-pet")}
          <div class="ghosty-inline-approval-card">
            <span class="ghosty-inline-approval-kicker">SUA DECISÃO</span>
            <strong id="ghosty-inline-approval-title">Autorizar esta ação?</strong>
            <small class="ghosty-inline-approval-tool" id="ghosty-inline-approval-tool"></small>
            <p class="ghosty-inline-approval-description" id="ghosty-inline-approval-description"></p>
            <div class="ghosty-approval-actions">
              <button type="button" data-ghosty-approval="deny">Recusar</button>
              <button type="button" data-ghosty-approval="allow">Aprovar</button>
            </div>
            <p class="ghosty-approval-error" role="status" hidden></p>
          </div>
        </div>
      </div>
      <div class="ghosty-completion" aria-hidden="true">
        <div class="pet ghosty-completion-pet" data-skin="${petSkin}" data-accessory="${petAccessory}" data-mood="happy" aria-hidden="true">
          <canvas class="pet-canvas" aria-hidden="true"></canvas>
        </div>
        <div class="ghosty-completion-card">
          <span class="ghosty-completion-kicker">PRONTINHO!</span>
          <strong id="ghosty-completion-copy">Tarefa concluída!</strong>
          <small class="ghosty-approval-tool" id="ghosty-approval-tool" hidden></small>
          <p class="ghosty-approval-description" id="ghosty-approval-description" hidden></p>
          <div class="ghosty-approval-actions" hidden>
            <button type="button" data-ghosty-approval="deny">Recusar</button>
            <button type="button" data-ghosty-approval="allow">Aprovar</button>
          </div>
          <p class="ghosty-approval-error" role="status" hidden></p>
        </div>
      </div>
      <div class="codex-media-bubble" aria-hidden="true"><span></span></div>
      <span class="task-completion-live" id="ghosty-completion-live" role="status" aria-live="polite"></span>
    </section>`;

  if (activeTab === "home") {
    const subtitle = app.querySelector<HTMLElement>(".header-title small");
    if (subtitle) subtitle.textContent = `${homeViewLabel()}${updatesPaused ? " · pausado" : ""}`;
  }

  const island = app.querySelector<HTMLElement>(".edge-island")!;
  applyIslandVariables(island);

  const body = island.querySelector<HTMLElement>(".island-body")!;
  if (previousGeometry) setBodyGeometry(body, previousGeometry.width, previousGeometry.height, previousGeometry.radius);
  else if (!expanded && island.classList.contains("is-media-capsule")) {
    const collapsedSize = collapsedIslandSize(island);
    setBodyGeometry(body, collapsedSize.width, collapsedSize.height, 14);
  } else {
    const rect = body.getBoundingClientRect();
    setBodyPosition(body, rect.width, rect.height);
  }
  syncCodexMediaBubble(island);
  publishNativeHitBounds(body);
  body.addEventListener("pointerenter", () => {
    if (hoverCloseTimer !== undefined) {
      window.clearTimeout(hoverCloseTimer);
      hoverCloseTimer = undefined;
    }
    if (interactionMode !== "hover") return;
    setExpanded(true);
  });
  body.addEventListener("pointerleave", () => {
    const pet = app.querySelector<HTMLElement>(".tab-view .pet");
    if (pet) petMotionEngines.get(pet)?.lookAt(0, 0);
    if (interactionMode === "hover" && expanded) scheduleClose();
  });
  island.querySelector(".peek-line")?.addEventListener("click", (event) => {
    event.stopPropagation();
    setExpanded(!expanded);
  });
  body.addEventListener("click", (event) => {
    if (interactionMode !== "click" || expanded) return;
    event.stopPropagation();
    setExpanded(true);
  });

  body.addEventListener("pointermove", (event) => {
    if (!expanded) return;
    const pet = app.querySelector<HTMLElement>(".tab-view .pet");
    const motion = pet ? petMotionEngines.get(pet) : undefined;
    if (!pet || !motion) return;
    const rect = pet.getBoundingClientRect();
    const x = (event.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width * 0.55);
    const y = (event.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height * 0.55);
    motion.lookAt(x, y);
  });

  app.querySelector("[data-action=settings]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    openSettingsWindow("general");
  });
  app.querySelector("[data-action=close]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    setExpanded(false);
  });
  app.querySelector("[data-action=reset-settings]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    barLength = DEFAULTS.length;
    barThickness = DEFAULTS.thickness;
    barPosition = DEFAULTS.barPosition;
    edge = DEFAULTS.edge;
    closeDelay = DEFAULTS.closeDelay;
    interactionMode = DEFAULTS.interactionMode;
    onboardingInteractionMode = interactionMode;
    localStorage.setItem(KEYS.interactionMode, interactionMode);
    allDisplays = false;
    selectedDisplayIds = displays.find((display) => display.isPrimary)
      ? [displays.find((display) => display.isPrimary)!.id]
      : displays.slice(0, 1).map((display) => display.id);
    persistSettings();
    render();
    void applyDisplayLayout();
  });
  bindSettings();

  const tabView = island.querySelector<HTMLElement>(".tab-view");
  if (tabView) bindTabContent(tabView);
  if (onboardingLaunchGreetingActive || onboardingLaunchDocking) {
    const pet = island.querySelector<HTMLElement>(".launch-greeting-pet");
    if (pet) {
      const motion = new PetMotionEngine(pet);
      petMotionEngines.set(pet, motion);
      if (launchGreetingStartedAt !== null) motion.welcome(launchGreetingStartedAt, true);
    }
    const canvas = island.querySelector<HTMLCanvasElement>(".launch-greeting-effects");
    if (canvas && launchGreetingStartedAt !== null) {
      launchGreetingRenderer = new LaunchGreeting(canvas);
      launchGreetingRenderer.start(launchGreetingStartedAt, completeOnboardingLaunchGreeting);
    }
  }
  if (onboardingOpen && !onboardingIntroStarted) {
    onboardingIntroStarted = true;
    window.setTimeout(() => {
      if (onboardingLaunchGreetingActive) {
        startOnboardingLaunchGreeting();
        return;
      }
      const pet = app.querySelector<HTMLElement>(".onboarding-pet");
      if (!pet) return;
      petMotionEngines.get(pet)?.welcome();
      setPetMood("happy", 3600);
    }, 220);
  }
  const completionPet = island.querySelector<HTMLElement>(".ghosty-completion");
  if (completionPet) bindPetInteractions(completionPet);
  const inlineApproval = island.querySelector<HTMLElement>(".ghosty-inline-approval");
  if (inlineApproval) bindPetInteractions(inlineApproval);
  bindCodexApprovalButtons(island);
  updateCodexApprovalPresentation();
  paintFocusTimer();
  island.addEventListener("click", (event) => {
    const tabButton = (event.target as Element).closest<HTMLButtonElement>("[data-tab]");
    if (!tabButton) return;
    event.stopPropagation();
    updateActiveTab(tabButton.dataset.tab as MenuTab);
  });

  if (previousGeometry) animateIsland(true);

  
}

async function startMainWindow() {
  render();
  void checkForAppUpdate();
  if (appUpdateCheckInterval === undefined) {
    appUpdateCheckInterval = window.setInterval(() => void checkForAppUpdate(), 6 * 60 * 60 * 1000);
  }
  void refreshAutoStartStatus();
  void refreshCodexHooksStatus();
  try { updatesPaused = await invoke<boolean>("is_updates_paused"); } catch { /* Tray not initialized in older app builds. */ }
  refreshHomeStatusUi();
  void refreshGithubStatus();
  void refreshVercelStatus();
  void loadGoogleWorkspace(true);
  if (weatherLocation && !updatesPaused && (!weatherSnapshot || Date.now() - weatherSnapshot.checkedAt > 30 * 60_000)) void refreshWeather();
  if (weatherRefreshInterval === undefined) {
    weatherRefreshInterval = window.setInterval(() => {
      if (weatherLocation && !updatesPaused && (!weatherSnapshot || Date.now() - weatherSnapshot.checkedAt > 30 * 60_000)) void refreshWeather();
    }, 5 * 60_000);
  }
  if (githubRefreshInterval === undefined) {
    githubRefreshInterval = window.setInterval(() => {
      if (githubConnected && !updatesPaused) void refreshGithubSnapshot();
    }, 5 * 60_000);
  }
  if (vercelRefreshInterval === undefined) {
    vercelRefreshInterval = window.setInterval(() => {
      if (vercelConnected && !updatesPaused) void refreshVercelSnapshot();
    }, 5 * 60_000);
  }
  if (googleRefreshInterval === undefined) {
    googleRefreshInterval = window.setInterval(() => {
      if (googleAccount.connected && !updatesPaused && (!googleSnapshot || Date.now() - googleSnapshot.checkedAt > 5 * 60_000)) void refreshGoogleSnapshot();
    }, 60_000);
  }
  let nextMediaRefreshAt = 0;
  let nextMixerRefreshAt = 0;
  window.setInterval(() => {
    const mediaViewOpen = expanded && activeTab === "home" && activeHomeView === "media";
    const now = Date.now();
    if (now >= nextMediaRefreshAt) {
      nextMediaRefreshAt = now + (mediaViewOpen ? 1500 : 4000);
      void refreshMediaInfo();
    }
    paintCollapsedMediaProgress();
    if (!mediaViewOpen) return;
    paintMediaInfo();
    if (volumeMixerOpen && now >= nextMixerRefreshAt) {
      nextMixerRefreshAt = now + 2200;
      void refreshAudioMixer();
    }
  }, 250);
  window.setInterval(() => void pollCodexHookEvents(), 300);
  await bindNativeFileDrop();
  void invoke<number>("get_system_volume").then((value) => {
    volume = value;
    const slider = app.querySelector<HTMLInputElement>("#volume");
    if (slider) slider.value = String(volume);
    const output = app.querySelector<HTMLElement>("#volume-value");
    if (output) output.textContent = `${volume}%`;
  }).catch(() => undefined);
  void refreshMediaInfo();
  try {
    displays = await invoke<DisplayInfo[]>("list_displays");
    if (allDisplays || localStorage.getItem(KEYS.displays) === null) {
      const primary = displays.find((display) => display.isPrimary) ?? displays[0];
      selectedDisplayIds = primary ? [primary.id] : [];
    } else {
      const selected = selectedDisplayIds.find((id) => displays.some((display) => display.id === id));
      const primary = displays.find((display) => display.isPrimary) ?? displays[0];
      selectedDisplayIds = selected ? [selected] : primary ? [primary.id] : [];
    }
    allDisplays = false;
    persistSettings();
    render();
    await applyDisplayLayout(expanded);
  } catch {
    // Keep the notch usable if monitor enumeration is temporarily unavailable.
  }
}

async function startSettingsWindow() {
  renderSettingsWindow();
  const currentWindow = getCurrentWindow();
  void currentWindow.onCloseRequested((event) => {
    event.preventDefault();
    void currentWindow.hide().catch(() => undefined);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") void currentWindow.hide().catch(() => undefined);
  });
  void refreshAutoStartStatus();
  void checkForAppUpdate();
  void refreshCodexHooksStatus();
  void refreshGithubStatus();
  void refreshVercelStatus();
  void loadGoogleWorkspace(false);
  try {
    displays = await invoke<DisplayInfo[]>("list_displays");
    if (!selectedDisplayIds.some((id) => displays.some((display) => display.id === id))) {
      const primary = displays.find((display) => display.isPrimary) ?? displays[0];
      selectedDisplayIds = primary ? [primary.id] : [];
    }
    renderSettingsWindow();
  } catch {
    // Settings stay usable if monitor enumeration is temporarily unavailable.
  }
}

void listen<LayoutUpdate>("edge-ghosty-layout-updated", ({ payload }) => {
  if (payload.activeLabel === getCurrentWindow().label) return;
  edge = payload.edge;
  barLength = payload.barLength;
  barThickness = payload.barThickness;
  barPosition = payload.positionPercent;
  closeDelay = payload.closeDelay;
  allDisplays = false;
  selectedDisplayIds = payload.selectedDisplayIds.slice(0, 1);
  if (currentWindowLabel === "settings-window") renderSettingsWindow();
  else render();
});

void listen<CursorPosition>("edge-ghosty-cursor", ({ payload }) => {
  const inIsland = payload.inside;
  const bodyRect = app.querySelector<HTMLElement>(".island-body")?.getBoundingClientRect();
  const pointerInBody = Boolean(bodyRect
    && payload.x >= bodyRect.left && payload.x <= bodyRect.right
    && payload.y >= bodyRect.top && payload.y <= bodyRect.bottom);
  const pointerOnApproval = !expanded && pendingCodexApprovals.length > 0 && !pointerInBody;
  if (inIsland) {
    if (hoverCloseTimer !== undefined) {
      window.clearTimeout(hoverCloseTimer);
      hoverCloseTimer = undefined;
    }
    if (interactionMode === "hover" && !expanded && !pointerOnApproval) setExpanded(true);
  } else if (!inIsland && wasPointerInNativeIsland && expanded) {
    if (interactionMode === "hover") scheduleClose();
  }
  wasPointerInNativeIsland = inIsland;
});

void listen<QuickChatEvent>("edge-ghosty-quick-chat-event", ({ payload }) => {
  if (utilityPopupMode !== "chat") return;
  const params = payload.params ?? {};
  if (payload.method === "item/started") {
    const item = params.item && typeof params.item === "object" ? params.item as Record<string, unknown> : {};
    if (item.type === "fileChange" && typeof item.id === "string" && Array.isArray(item.changes)) {
      const preview = item.changes.map((change) => {
        if (!change || typeof change !== "object") return "";
        const entry = change as Record<string, unknown>;
        return [entry.kind, entry.path, entry.diff].filter((part) => typeof part === "string" && part).join("\n");
      }).filter(Boolean).join("\n\n").slice(0, 12_000);
      quickChatFileChangePreviews.set(item.id, preview);
    }
    return;
  }
  if (payload.method === "item/completed") {
    const item = params.item && typeof params.item === "object" ? params.item as Record<string, unknown> : {};
    if (typeof item.id === "string") quickChatFileChangePreviews.delete(item.id);
  }
  if (payload.requestId !== undefined && [
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/permissions/requestApproval",
  ].includes(payload.method)) {
    const approval = {
      requestId: payload.requestId,
      method: payload.method,
      params,
      preview: payload.method === "item/fileChange/requestApproval" && typeof params.itemId === "string"
        ? quickChatFileChangePreviews.get(params.itemId)
        : undefined,
    };
    quickChatApprovals = [...quickChatApprovals.filter((pending) => String(pending.requestId) !== String(approval.requestId)), approval];
    paintQuickChatMessages(true);
    setQuickChatPetState("approval");
    if (quickChatAutoApproveSession) void answerQuickChatApproval(approval, true, true);
    return;
  }
  if (payload.method === "serverRequest/resolved" && params.requestId !== undefined) {
    quickChatApprovals = quickChatApprovals.filter((pending) => String(pending.requestId) !== String(params.requestId));
    quickChatApprovalBusy.delete(String(params.requestId));
    paintQuickChatMessages();
    return;
  }
  if (payload.method === "server/disconnected") {
    quickChatServiceStarted = false;
    quickChatAuthenticated = false;
    quickChatCancelRequested = false;
    quickChatApprovals = [];
    quickChatApprovalBusy.clear();
    quickChatFileChangePreviews.clear();
    quickChatAutoApproveSession = false;
    quickChatSessionPermissionNotice = "";
    quickChatLoginPending = false;
    quickChatLoginCompletedAt = 0;
    if (quickChatLoading) {
      const pending = [...quickChatMessages].reverse().find((message) => message.role === "assistant" && message.pending);
      if (pending) {
        pending.pending = false;
        pending.text = "A conexão com o Codex foi encerrada. Tente novamente.";
      }
      quickChatLoading = false;
      paintQuickChatMessages(true);
      updateQuickChatSendControl();
      setQuickChatPetState("error");
    } else {
      quickChatError = "A conexão com o Codex foi encerrada.";
      paintQuickChatMessages();
    }
    return;
  }
  if (payload.method === "item/agentMessage/delta") {
    const delta = typeof params.delta === "string" ? params.delta : "";
    if (!delta) return;
    const pending = [...quickChatMessages].reverse().find((message) => message.role === "assistant" && message.pending);
    if (!pending) return;
    pending.text += delta;
    paintQuickChatMessages();
    return;
  }
  if (payload.method === "turn/completed") {
    const turn = params.turn && typeof params.turn === "object" ? params.turn as Record<string, unknown> : {};
    const status = String(turn.status ?? params.status ?? "completed");
    const pending = [...quickChatMessages].reverse().find((message) => message.role === "assistant" && message.pending);
    const linkToOpen = pending && status === "completed" && !quickChatCancelRequested
      ? quickChatSingleHttpUrl(pending.text)
      : null;
    if (pending) {
      pending.pending = false;
      if (status !== "completed" && !pending.text) pending.text = `A resposta terminou com o estado “${status}”.`;
    }
    quickChatLoading = false;
    quickChatCancelRequested = false;
    paintQuickChatMessages(true);
    updateQuickChatSendControl();
    setQuickChatPetState(status === "completed" ? "finished" : "error", status);
    if (linkToOpen) {
      void invoke("open_targets", { targets: [linkToOpen] }).catch((error) => {
        console.warn("Não consegui abrir automaticamente o link da resposta do Ghosty.", error);
      });
    }
    return;
  }
  if (payload.method === "account/login/completed") {
    const success = params.success === true;
    if (success) {
      quickChatLoginFailed = false;
      quickChatLoginCompletedAt = Date.now();
      quickChatError = "";
      void refreshQuickChatStatus();
    } else {
      quickChatLoginPending = false;
      quickChatLoginFailed = true;
      quickChatLoginCompletedAt = 0;
      quickChatError = typeof params.error === "string" && params.error
        ? `Login não concluído: ${params.error}`
        : "Login não concluído. Você pode tentar novamente.";
      paintQuickChatMessages();
      paintQuickChatControls();
      updateQuickChatSendControl();
    }
    return;
  }
  if (payload.method === "account/updated") {
    void refreshQuickChatStatus();
  }
});
if (currentWindowLabel === "main") {
  void listen("edge-ghosty-quick-chat", () => { void openUtilityPopup("chat"); });
  void listen("edge-ghosty-open-onboarding", () => openOnboarding());
  void listen("edge-ghosty-replay-onboarding-greeting", () => { void replayOnboardingLaunchGreeting(); });
  void listen<string>("edge-ghosty-tray-command", async ({ payload }) => {
    if (payload !== "open" && payload !== "settings") return;
    if (payload === "settings") {
      openSettingsWindow("general");
      return;
    }
    await getCurrentWindow().show().catch(() => undefined);
    await getCurrentWindow().setFocus().catch(() => undefined);
    setExpanded(true);
  });
}
void listen<boolean>("edge-ghosty-pause-updated", ({ payload }) => {
  updatesPaused = payload;
  if (payload) {
    githubStatusMessage = "Atualizações pausadas pela bandeja do sistema.";
    vercelStatusMessage = "Atualizações pausadas pela bandeja do sistema.";
  } else {
    if (githubConnected) githubStatusMessage = `Conectado como @${githubSnapshot?.login ?? "GitHub"}.`;
    if (vercelConnected) vercelStatusMessage = `Conectado à Vercel${vercelSnapshot ? ` como ${vercelSnapshot.username}` : ""}.`;
  }
  refreshGithubCard();
  refreshGithubSettingsUi();
  refreshVercelSettingsUi();
  refreshHomeStatusUi();
  if (!payload) {
    if (githubConnected) void refreshGithubSnapshot();
    if (vercelConnected) void refreshVercelSnapshot();
    if (googleAccount.connected) void refreshGoogleSnapshot();
  }
});
void listen<GithubSnapshot | null>("edge-ghosty-github-snapshot", ({ payload }) => {
  githubSnapshot = payload;
  if (payload) {
    githubConnected = true;
    githubStatusMessage = `Conectado como @${payload.login}.`;
  } else {
    githubConnected = false;
    githubStatusMessage = "GitHub desconectado.";
  }
  refreshGithubCard();
  refreshGithubSettingsUi();
});
void listen<VercelSnapshot | null>("edge-ghosty-vercel-snapshot", ({ payload }) => {
  vercelSnapshot = payload;
  if (payload) {
    vercelConnected = true;
    vercelStatusMessage = `Conectado à Vercel como ${payload.username}.`;
  } else {
    vercelConnected = false;
    vercelStatusMessage = "Vercel desconectada.";
  }
  refreshGithubCard();
  refreshVercelSettingsUi();
});
void listen<GoogleSnapshot | null>("edge-ghosty-google-snapshot", ({ payload }) => {
  applyGoogleSnapshot(payload, true);
});
void listen<string>("edge-ghosty-google-error", ({ payload }) => {
  googleError = payload;
  googleStatusMessage = payload;
  refreshDashboardIfVisible();
  if (currentWindowLabel === "settings-window") refreshGoogleSettingsUi();
});
void listen<PetReactionSignal>("edge-ghosty-pet-reaction", ({ payload }) => {
  receiveGhostyReaction(payload);
});
if (currentWindowLabel === "utility-popup") window.setInterval(() => {
  if (utilityPopupMode === "focus") paintFocusTimer();
}, 250);
else window.setInterval(tickFeatures, 1000);

window.addEventListener("storage", (event) => {
  if (event.key === KEYS.openPanelsRequest) {
    if (currentWindowLabel !== "settings-window" && currentWindowLabel !== "utility-popup") {
      updateActiveTab("panels");
      setExpanded(true);
    }
    return;
  }
  if (event.key === KEYS.settingsTab) {
    settingsTab = readChoice(KEYS.settingsTab, ["general", "shortcuts", "panels"], "general");
    if (currentWindowLabel === "settings-window") renderSettingsWindow();
    return;
  }
  if ([KEYS.length, KEYS.thickness, KEYS.barPosition, KEYS.edge, KEYS.closeDelay, KEYS.displays, KEYS.interactionMode].includes(event.key ?? "")) {
    if (externalLayoutSyncTimer !== undefined) window.clearTimeout(externalLayoutSyncTimer);
    externalLayoutSyncTimer = window.setTimeout(() => {
      externalLayoutSyncTimer = undefined;
      barLength = readNumber(KEYS.length, DEFAULTS.length, MIN_LENGTH, MAX_LENGTH, LENGTH_STEP);
      barThickness = readNumber(KEYS.thickness, DEFAULTS.thickness, MIN_THICKNESS, MAX_THICKNESS);
      barPosition = readNumber(KEYS.barPosition, DEFAULTS.barPosition, 0, 100);
      edge = readEdge();
      closeDelay = readNumber(KEYS.closeDelay, DEFAULTS.closeDelay, MIN_CLOSE_DELAY, MAX_CLOSE_DELAY, 50);
      selectedDisplayIds = readDisplayIds();
      interactionMode = readChoice(KEYS.interactionMode, ["hover", "click"], "hover");
      if (currentWindowLabel === "settings-window") {
        renderSettingsWindow();
        return;
      }
      const island = app.querySelector<HTMLElement>(".edge-island");
      if (island) {
        applyIslandVariables(island);
        const body = island.querySelector<HTMLElement>(".island-body");
        if (body) {
          const rect = body.getBoundingClientRect();
          setBodyPosition(body, rect.width, rect.height);
          if (expanded) animateIsland(true);
          publishNativeHitBounds(body);
        }
      }
    }, 60);
    return;
  }
  if (event.key === KEYS.codexActivity) {
    codexActivity = loadCodexActivity();
    refreshCodexActivityUi();
    return;
  }
  if (event.key === KEYS.dashboardView) {
    dashboardView = readChoice(KEYS.dashboardView, ["overview", "email", "calendar", "tasks", "notifications", "weather"], "overview");
    refreshDashboardIfVisible();
    return;
  }
  if (event.key === KEYS.dashboardNotifications) {
    dashboardNotifications = readDashboardNotifications();
    refreshDashboardIfVisible();
    return;
  }
  if (event.key === KEYS.weatherLocation) {
    weatherLocation = readWeatherLocation();
    weatherSnapshot = readWeatherSnapshot();
    refreshDashboardIfVisible();
    return;
  }
  if (event.key === KEYS.weatherSnapshot) {
    weatherSnapshot = readWeatherSnapshot();
    refreshDashboardIfVisible();
    return;
  }
  if (event.key === KEYS.quickChatDraft) {
    quickChatDraft = event.newValue ?? "";
    if (currentWindowLabel === "utility-popup" && utilityPopupMode === "chat") {
      const input = app.querySelector<HTMLInputElement>("#quick-chat-input");
      if (input) input.value = quickChatDraft;
    }
    return;
  }
  if (event.key === KEYS.soundsEnabled) {
    soundEnabled = event.newValue === "true";
    setGhostySoundEnabled(soundEnabled);
    return;
  }
  if (event.key === KEYS.soundVolume) {
    soundVolume = readNumber(KEYS.soundVolume, 24, 0, 100);
    setGhostySoundVolume(soundVolume / 100);
    return;
  }
  if (event.key === KEYS.focusHistory) {
    focusHistory = readFocusHistory();
    paintFocusSummary();
    return;
  }
  if (event.key === KEYS.quickChatWebsiteCache) {
    quickChatWebsiteCache = readQuickChatWebsiteCache();
    return;
  }
  if (event.key === KEYS.quickChatEntry) {
    if (currentWindowLabel === "utility-popup" && localStorage.getItem(KEYS.utilityPopup) === "chat") {
      quickChatEntryPending = Date.now() - Number(localStorage.getItem(KEYS.quickChatEntry) ?? 0) < 1600;
      if (quickChatEntryPending) renderUtilityPopup();
    }
    return;
  }
  if (event.key === KEYS.utilityPopup) {
    if (currentWindowLabel === "utility-popup") {
      quickChatEntryPending = localStorage.getItem(KEYS.utilityPopup) === "chat"
        && Date.now() - Number(localStorage.getItem(KEYS.quickChatEntry) ?? 0) < 1600;
      renderUtilityPopup();
      if (utilityPopupMode && utilityPopupBlurTimer !== undefined) {
        window.clearTimeout(utilityPopupBlurTimer);
        utilityPopupBlurTimer = undefined;
      }
    }
    return;
  }
  if (event.key === KEYS.pocket) pocketItems = readPocketItems();
  else if (event.key === KEYS.clipboard) clipboardEntries = readClipboardEntries();
  else if (event.key === KEYS.shortcuts) shortcuts = readShortcuts();
  else if (event.key === KEYS.petName) petName = localStorage.getItem(KEYS.petName) || "Ghosty";
  else if (event.key === KEYS.petSkin) petSkin = readChoice(KEYS.petSkin, ["pearl", "smoke", "midnight", "mint", "coral", "lavender"], "pearl");
  else if (event.key === KEYS.petAccessory) petAccessory = readChoice(KEYS.petAccessory, ["none", "star", "bow", "halo", "leaf", "crown"], "none");
  else if (event.key === KEYS.focus) focusState = readFocusState();
  else return;

  if (currentWindowLabel === "utility-popup") {
    if (event.key === KEYS.focus) paintFocusTimer();
    else if (event.key === KEYS.pocket) refreshPocketUi();
    else if (event.key === KEYS.clipboard) refreshClipboardUi();
    else if ([KEYS.petName, KEYS.petSkin, KEYS.petAccessory].includes(event.key)) {
      if (utilityPopupMode === "chat") updatePetAtmosphere();
      else renderUtilityPopup();
    }
    return;
  }
  if (currentWindowLabel === "settings-window") {
    if (event.key === KEYS.shortcuts) renderSettingsWindow();
    else if (event.key === KEYS.petName) renderSettingsWindow();
    return;
  }

  if (event.key === KEYS.focus || event.key === KEYS.pocket || event.key === KEYS.petName || event.key === KEYS.petSkin || event.key === KEYS.petAccessory) {
    updatePetAtmosphere();
    app.querySelectorAll<HTMLElement>(".pet-name").forEach((name) => { name.textContent = petName; });
    app.querySelectorAll<HTMLElement>(".pet").forEach((pet) => {
      pet.setAttribute("aria-label", petName);
      pet.dataset.skin = petSkin;
      pet.dataset.accessory = petAccessory;
    });
  }
  if (event.key === KEYS.pocket) refreshPocketUi();
  else if (event.key === KEYS.clipboard) refreshClipboardUi();
  else if (event.key === KEYS.shortcuts) updateActiveTab(activeTab);
  paintFocusTimer();
});
if (currentWindowLabel === "main") mainStartupPromise = startMainWindow();
else if (currentWindowLabel === "utility-popup") startUtilityPopupWindow();
else if (currentWindowLabel === "settings-window") void startSettingsWindow();
else {
  render();
  bindNativeFileDrop();
  void refreshMediaInfo();
  let nextMediaRefreshAt = 0;
  window.setInterval(() => {
    const now = Date.now();
    if (now < nextMediaRefreshAt) return;
    nextMediaRefreshAt = now + 4000;
    void refreshMediaInfo();
  }, 1000);
  void invoke<number>("get_system_volume").then((value) => { volume = value; }).catch(() => undefined);
}
