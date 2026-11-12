type Skin = "pearl" | "smoke" | "midnight" | "mint" | "coral" | "lavender";
type Accessory = "none" | "star" | "bow" | "halo" | "leaf" | "crown";
export type PetState = "idle" | "working" | "thinking" | "searching" | "approval" | "question" | "error" | "finished" | "ratelimit" | "sleeping" | "dizzy";
export type PetEmote = "love" | "surprised" | "proud" | "wink" | "yawn" | "happy" | "annoyed";
type EyeShape = "pill" | "wide" | "dot" | "line" | "flat" | "happy" | "content" | "closed" | "spiral" | "heart" | "star" | "tired" | "wink" | "cup";
type Channel = "squashX" | "squashY" | "lift" | "tilt" | "roll" | "offsetX" | "hands" | "eyeScale" | "morph" | "mouth" | "badgeScale";
type Easing = "linear" | "in" | "out" | "inOut" | "back";
type BadgeKind = "dots" | "bang" | "question" | "dot";
type ParticleKind = "heart" | "star" | "spark" | "sweat" | "z";
type Rgb = [number, number, number];

type Particle = {
  type: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  rot: number;
  size: number;
};

type GreetingPose = {
  scale: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  tilt: number;
  eye: EyeShape;
  eyeRoll: number;
  open: number;
  lookX: number;
  lookY: number;
  handLeft: number;
  handRight: number;
  wave: number;
  launch?: boolean;
  bodyHeight?: number;
  tint?: number;
  halo?: number;
  haloBlue?: number;
  badge?: number;
};

type MotionStep = {
  channel: Channel;
  value: number;
  at: number;
  duration: number;
  easing?: Easing;
};

type ScheduledStep = MotionStep & { startsAt: number; priority: number; version: number };

type Track = {
  value: number;
  from: number;
  to: number;
  startsAt: number;
  duration: number;
  easing: Easing;
  priority: number;
};

type Palette = { top: string; middle: string; bottom: string; edge: string; glint: string };

const PALETTES: Record<Skin, Palette> = {
  pearl: { top: "#85828a", middle: "#615e66", bottom: "#3a383f", edge: "#a6a2aa", glint: "#f0edf1" },
  smoke: { top: "#71808a", middle: "#4a5760", bottom: "#293138", edge: "#99a7ad", glint: "#e5f0f4" },
  midnight: { top: "#76738e", middle: "#4f4d63", bottom: "#302f40", edge: "#9692ac", glint: "#e9e5ff" },
  mint: { top: "#73958b", middle: "#4e7168", bottom: "#304c46", edge: "#a8c9bd", glint: "#e9fff5" },
  coral: { top: "#a77c79", middle: "#805955", bottom: "#533b3b", edge: "#d3aaa0", glint: "#fff0e7" },
  lavender: { top: "#9484a8", middle: "#675b7b", bottom: "#403951", edge: "#c2b2d8", glint: "#f7edff" },
};

const CHANNELS: Channel[] = ["squashX", "squashY", "lift", "tilt", "roll", "offsetX", "hands", "eyeScale", "morph", "mouth", "badgeScale"];

const STATE_COLORS: Record<PetState, Rgb> = {
  idle: [230, 233, 238],
  working: [59, 158, 255],
  thinking: [139, 92, 246],
  searching: [99, 101, 242],
  approval: [245, 165, 36],
  question: [34, 211, 238],
  error: [244, 80, 94],
  finished: [52, 211, 153],
  ratelimit: [251, 146, 60],
  sleeping: [148, 162, 184],
  dizzy: [244, 114, 182],
};

const STATE_TINT: Record<PetState, number> = {
  idle: 0,
  working: 0.72,
  thinking: 0.72,
  searching: 0.72,
  approval: 0.78,
  question: 0.75,
  error: 0.78,
  finished: 0.35,
  ratelimit: 0.72,
  sleeping: 0.32,
  dizzy: 0.7,
};

const STATE_BADGES: Record<PetState, BadgeKind | null> = {
  idle: null,
  working: "dots",
  thinking: "dots",
  searching: "dots",
  approval: "bang",
  question: "question",
  error: "dot",
  finished: "dot",
  ratelimit: "dot",
  sleeping: null,
  dizzy: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function roundedRectPoint(progress: number, width: number, height: number, radius: number): [number, number] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const r = clamp(radius, 0, Math.min(halfWidth, halfHeight));
  const arc = Math.PI * r / 2;
  const straightX = width - 2 * r;
  const straightY = height - 2 * r;
  const perimeter = 2 * straightX + 2 * straightY + 4 * arc;
  const rightMiddle = (straightX + arc + straightY / 2) / perimeter;
  let distance = ((progress + rightMiddle) % 1) * perimeter;
  if (distance < straightX) return [-halfWidth + r + distance, -halfHeight];
  distance -= straightX;
  if (distance < arc) {
    const angle = -Math.PI / 2 + distance / r;
    return [halfWidth - r + Math.cos(angle) * r, -halfHeight + r + Math.sin(angle) * r];
  }
  distance -= arc;
  if (distance < straightY) return [halfWidth, -halfHeight + r + distance];
  distance -= straightY;
  if (distance < arc) {
    const angle = distance / r;
    return [halfWidth - r + Math.cos(angle) * r, halfHeight - r + Math.sin(angle) * r];
  }
  distance -= arc;
  if (distance < straightX) return [halfWidth - r - distance, halfHeight];
  distance -= straightX;
  if (distance < arc) {
    const angle = Math.PI / 2 + distance / r;
    return [-halfWidth + r + Math.cos(angle) * r, halfHeight - r + Math.sin(angle) * r];
  }
  distance -= arc;
  if (distance < straightY) return [-halfWidth, halfHeight - r - distance];
  distance -= straightY;
  const angle = Math.PI + distance / r;
  return [-halfWidth + r + Math.cos(angle) * r, -halfHeight + r + Math.sin(angle) * r];
}

function rgba(color: Rgb, alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function easing(value: number, type: Easing) {
  const t = clamp(value, 0, 1);
  if (type === "linear") return t;
  if (type === "in") return t * t * t;
  if (type === "inOut") return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  if (type === "back") {
    const c1 = 1.7;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }
  return 1 - (1 - t) ** 3;
}

function makeTrack(): Track {
  return { value: 0, from: 0, to: 0, startsAt: 0, duration: 0, easing: "out", priority: 0 };
}

/** Canvas renderer and independent motion channels for Ghosty. */
export class PetMotionEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;
  private readonly tracks = Object.fromEntries(CHANNELS.map((channel) => [channel, makeTrack()])) as Record<Channel, Track>;
  private readonly versions = Object.fromEntries(CHANNELS.map((channel) => [channel, 0])) as Record<Channel, number>;
  private readonly pending: ScheduledStep[] = [];
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  /** False while the canvas is clipped away (e.g. island collapsed); no frames are drawn then. */
  private onScreen = true;
  private readonly visibilityObserver: IntersectionObserver;
  private readonly appearanceObserver: MutationObserver;
  /** Wakes the sleeping loop for the next blink (see sleepUntilNextBeat). */
  private wakeTimer: number | undefined;
  private gazeSettled = false;
  private previousFrame = 0;
  private nextBlinkAt = performance.now() + 1500 + Math.random() * 2000;
  private blinkStartedAt = 0;
  private doubleBlinkAt = 0;
  private gazeX = 0;
  private gazeY = 0;
  private targetGazeX = 0;
  private targetGazeY = 0;
  private pointerTracking = false;
  private activity: PetState = "idle";
  private stateStartedAt = performance.now();
  private approvalBounce = 0;
  private stateColor: Rgb = [...STATE_COLORS.idle];
  private targetStateColor: Rgb = [...STATE_COLORS.idle];
  private badge: BadgeKind | null = null;
  private badgeColor = STATE_COLORS.idle;
  private pendingBadge: { kind: BadgeKind | null; color: Rgb; at: number } | null = null;
  private activityDetail = "";
  private readonly activityTooltip: HTMLElement | null;
  private activityTooltipTimer: number | undefined;
  private activityMarkerHovered = false;
  private pointerIsInsidePet = false;
  private pointerClientX = 0;
  private pointerClientY = 0;
  private lastAmbientParticleAt = performance.now();
  private readonly particles: Particle[] = [];
  private readonly particleBursts: { type: ParticleKind; count: number; at: number }[] = [];
  private emote: PetEmote | null = null;
  private emoteStartedAt = 0;
  private emoteUntil = 0;
  private waveStartedAt = 0;
  private waveUntil = 0;
  private shortGreetingStartedAt = 0;
  private shortGreetingTilt = 0;
  private greetingBlinkAt: number[] = [];
  private greetingStartedAt = 0;
  private greetingIsLaunch = false;
  private greetingExit: { startedAt: number; duration: number; pose: GreetingPose } | null = null;
  private activeEyeShape: EyeShape = "pill";
  private outgoingEyeShape: EyeShape = "pill";
  private eyeShapeTransitionAt = 0;
  private sparkStartedAt = 0;
  private skin: Skin = "pearl";
  private accessory: Accessory = "none";
  private receivingFile = false;
  private fileReturnActive = false;
  private fileReturnStartedAt = 0;
  private fileLocked = false;
  private fileCaptured = false;
  private fileLockAt = 0;
  private fileCursorX = 0;
  private fileCursorY = 0;
  private fileCursorAt = 0;
  private fileCursorSpeed = 0;
  private fileBodyX = 0;
  private fileBodyXVelocity = 0;
  private fileBodyTargetX = 0;
  private fileTilt = 0;
  private fileHop = 0;
  private fileMouth = 0;
  private fileMouthTarget = 0;
  private fileMouthVelocity = 0;
  private ingestStartedAt = 0;
  private heartStartedAt = 0;
  private slapTimes: number[] = [];
  private disposed = false;

  constructor(private readonly root: HTMLElement) {
    const canvas = root.querySelector<HTMLCanvasElement>(".pet-canvas");
    if (!canvas) throw new Error("PetMotionEngine requires a .pet-canvas element");
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.activityTooltip = root.querySelector<HTMLElement>(".pet-activity-tooltip");
    root.addEventListener("pointermove", this.onPointerMove);
    root.addEventListener("pointerleave", this.onPointerLeave);
    this.syncAppearance();
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.refreshActivityTooltip();
      // Resizing clears the bitmap, so a sleeping loop must draw again.
      this.requestFrame();
    });
    this.resizeObserver.observe(root);
    // Ancestor overflow clipping counts, so a pet inside the collapsed island reads as off-screen.
    this.visibilityObserver = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);
      if (visible === this.onScreen) return;
      this.onScreen = visible;
      if (!visible) {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.clearWake();
        return;
      }
      this.previousFrame = 0;
      this.requestFrame();
    });
    this.visibilityObserver.observe(this.canvas);
    // Skin, accessory and mood are read from data attributes on each frame.
    this.appearanceObserver = new MutationObserver(() => this.requestFrame());
    this.appearanceObserver.observe(root, { attributes: true, attributeFilter: ["data-skin", "data-accessory", "data-mood"] });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.reducedMotion.addEventListener("change", this.onMotionPreferenceChange);
    this.resize();
    this.requestFrame();
  }

  setAppearance(skin: Skin, accessory: Accessory, mood: string) {
    this.skin = skin;
    this.accessory = accessory;
    this.applyMood(mood);
    this.requestFrame();
  }

  private applyMood(mood: string) {
    if (mood === "focused") this.setState("working");
    else if (this.activity === "working") this.setState("idle");
  }

  lookAt(x: number, y: number) {
    this.targetGazeX = clamp(x, -1, 1);
    this.targetGazeY = clamp(y, -1, 1);
    this.pointerTracking = Math.abs(x) + Math.abs(y) > 0.04;
    this.requestFrame();
  }

  blink() {
    if (this.reducedMotion.matches || this.activity === "sleeping" || this.activity === "dizzy") return;
    this.blinkStartedAt = performance.now();
    this.requestFrame();
  }

  setState(state: PetState, force = false, detail?: string) {
    if (this.greetingIsLaunch && this.greetingStartedAt && performance.now() < this.greetingStartedAt + 4600) return;
    if (detail !== undefined) this.activityDetail = detail.trim();
    else if (this.activity !== state) this.activityDetail = "";
    if (state === "idle") this.activityDetail = "";
    if (this.activity === state && !force) {
      this.refreshActivityTooltip();
      return;
    }
    const previous = this.activity;
    this.interruptGreet();
    this.activity = state;
    this.stateStartedAt = performance.now();
    this.targetStateColor = [...STATE_COLORS[state]];
    this.emote = null;
    this.emoteUntil = 0;

    const nextBadge = STATE_BADGES[state];
    if (this.reducedMotion.matches) {
      this.pendingBadge = null;
      this.badge = nextBadge;
      this.badgeColor = STATE_COLORS[state];
      this.snap("badgeScale", nextBadge ? 1 : 0);
    } else if (nextBadge !== this.badge) {
      this.pendingBadge = { kind: nextBadge, color: STATE_COLORS[state], at: performance.now() + 100 };
      this.play([{ channel: "badgeScale", value: 0, at: 0, duration: 90, easing: "inOut" }], 3);
    } else {
      this.badgeColor = STATE_COLORS[state];
    }

    if (state === "question") {
      this.play([{ channel: "tilt", value: 0.17, at: 0, duration: 220, easing: "out" }], 2);
    } else if (previous === "question") {
      this.play([{ channel: "tilt", value: 0, at: 0, duration: 260, easing: "inOut" }], 2);
    }

    switch (state) {
      case "working":
      case "thinking":
      case "searching":
        this.blink();
        break;
      case "approval":
        this.play([
          { channel: "lift", value: -6, at: 0, duration: 150, easing: "out" },
          { channel: "lift", value: 0, at: 150, duration: 300, easing: "back" },
          { channel: "squashY", value: 0.05, at: 0, duration: 130, easing: "out" },
          { channel: "squashY", value: 0, at: 170, duration: 280, easing: "back" },
        ], 2);
        break;
      case "question":
        this.blink();
        break;
      case "error":
        this.play([
          { channel: "offsetX", value: 0.08, at: 0, duration: 50, easing: "out" },
          { channel: "offsetX", value: -0.08, at: 50, duration: 70, easing: "inOut" },
          { channel: "offsetX", value: 0.05, at: 120, duration: 70, easing: "inOut" },
          { channel: "offsetX", value: 0, at: 190, duration: 90, easing: "out" },
        ], 2);
        break;
      case "finished":
        this.doRoll(950, 1);
        if (!this.reducedMotion.matches) this.particleBursts.push({ type: "spark", count: 5, at: performance.now() + 500 });
        break;
      case "ratelimit":
        this.emit("sweat", 1);
        this.lastAmbientParticleAt = performance.now();
        break;
      case "dizzy":
        this.playDizzy();
        break;
      case "idle":
        if (previous !== "idle") {
          this.play([{ channel: "tilt", value: 0, at: 0, duration: 260, easing: "inOut" }], 1);
          this.blink();
        }
        break;
      case "sleeping":
        this.emit("z", 1);
        this.lastAmbientParticleAt = performance.now();
        break;
    }
    this.restartActivityTooltipTimer();
    this.requestFrame();
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointerIsInsidePet = true;
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    this.updateActivityMarkerHover();
  };

  private readonly onPointerLeave = () => {
    this.pointerIsInsidePet = false;
    this.setActivityMarkerHovered(false);
  };

  private updateActivityMarkerHover() {
    if (!this.pointerIsInsidePet) return;
    const rect = this.canvas.getBoundingClientRect();
    const logicalWidth = this.canvasLogicalWidth(rect);
    const scaleX = rect.width / logicalWidth;
    const scaleY = rect.height / 100;
    const markerX = rect.left + (logicalWidth / 2 + 28) * scaleX;
    const markerY = rect.top + 18 * scaleY;
    const radiusX = 14 * scaleX;
    const radiusY = 14 * scaleY;
    const dx = (this.pointerClientX - markerX) / radiusX;
    const dy = (this.pointerClientY - markerY) / radiusY;
    const markerVisible = !!this.badge && this.value("morph") < 0.25 && !!this.getActivityExplanation();
    this.setActivityMarkerHovered(markerVisible && dx * dx + dy * dy <= 1);
  }

  private setActivityMarkerHovered(hovered: boolean) {
    if (this.activityMarkerHovered === hovered) return;
    this.activityMarkerHovered = hovered;
    this.restartActivityTooltipTimer();
  }

  private restartActivityTooltipTimer() {
    if (this.activityTooltipTimer !== undefined) {
      window.clearTimeout(this.activityTooltipTimer);
      this.activityTooltipTimer = undefined;
    }
    this.hideActivityTooltip();
    if (!this.activityMarkerHovered || !this.getActivityExplanation() || !this.activityTooltip) return;
    this.activityTooltipTimer = window.setTimeout(() => {
      this.activityTooltipTimer = undefined;
      if (this.activityMarkerHovered) this.showActivityTooltip();
    }, 1000);
  }

  private getActivityExplanation(): string | null {
    switch (this.activity) {
      case "working": return "Seu temporizador de foco está em andamento.";
      case "thinking": return "Ghosty está no estado de pensamento.";
      case "searching": return this.activityDetail
        ? `Buscando “${this.activityDetail}” nos atalhos.`
        : "Buscando um app ou atalho.";
      case "approval": return "Ghosty está esperando sua confirmação.";
      case "question": return "Ghosty precisa de uma resposta para continuar.";
      case "error": return "A última ação encontrou um erro.";
      case "finished": return this.activityDetail || "O ciclo de foco foi concluído.";
      case "ratelimit": return "Ghosty precisa esperar antes de tentar de novo.";
      default: return null;
    }
  }

  private showActivityTooltip() {
    const tooltip = this.activityTooltip;
    const explanation = this.getActivityExplanation();
    if (!tooltip || !explanation || !this.activityMarkerHovered) return;
    tooltip.textContent = explanation;
    tooltip.setAttribute("aria-hidden", "false");
    tooltip.classList.add("is-visible");
    this.positionActivityTooltip();
  }

  private refreshActivityTooltip() {
    const tooltip = this.activityTooltip;
    if (!tooltip?.classList.contains("is-visible")) return;
    const explanation = this.getActivityExplanation();
    if (!explanation) {
      this.hideActivityTooltip();
      return;
    }
    tooltip.textContent = explanation;
    this.positionActivityTooltip();
  }

  private positionActivityTooltip() {
    const tooltip = this.activityTooltip;
    if (!tooltip) return;
    const rootRect = this.root.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const logicalWidth = this.canvasLogicalWidth(canvasRect);
    const markerX = canvasRect.left + (logicalWidth / 2 + 28) / logicalWidth * canvasRect.width;
    const markerY = canvasRect.top + 18 / 100 * canvasRect.height;
    const boundary = this.root.closest<HTMLElement>(".pet-stage, .home-context-card, .pet-profile, .pet-page") ?? this.root.parentElement;
    const boundaryRect = boundary?.getBoundingClientRect() ?? rootRect;
    const leftRoom = markerX - boundaryRect.left - 10;
    const rightRoom = boundaryRect.right - markerX - 10;
    tooltip.style.maxWidth = "";
    const useLeft = rightRoom < tooltip.offsetWidth && leftRoom > rightRoom;
    const availableRoom = useLeft ? leftRoom : rightRoom;
    tooltip.style.maxWidth = `${Math.max(80, Math.min(190, availableRoom))}px`;
    tooltip.classList.toggle("is-left", useLeft);
    const verticalInset = Math.min(tooltip.offsetHeight / 2 + 8, boundaryRect.height / 2);
    const centerY = clamp(markerY, boundaryRect.top + verticalInset, boundaryRect.bottom - verticalInset);
    tooltip.style.left = `${markerX - rootRect.left}px`;
    tooltip.style.top = `${centerY - rootRect.top}px`;
  }

  private hideActivityTooltip() {
    if (!this.activityTooltip) return;
    this.activityTooltip.classList.remove("is-visible", "is-left");
    this.activityTooltip.setAttribute("aria-hidden", "true");
  }

  triggerEmote(emote: PetEmote, duration = 1800) {
    if (this.greetingIsLaunch && this.greetingStartedAt && performance.now() < this.greetingStartedAt + 4600) return;
    this.interruptGreet();
    const now = performance.now();
    this.emote = emote;
    this.emoteStartedAt = now;
    this.emoteUntil = now + (emote === "annoyed" ? 800 : duration);
    switch (emote) {
      case "love":
        if (!this.reducedMotion.matches) this.emit("heart", 4);
        this.play([
          { channel: "lift", value: -3, at: 0, duration: 160, easing: "out" },
          { channel: "lift", value: 0, at: 160, duration: 300, easing: "back" },
        ], 2);
        break;
      case "surprised":
        this.play([
          { channel: "eyeScale", value: 0.25, at: 0, duration: 120, easing: "out" },
          { channel: "eyeScale", value: 0, at: 120, duration: 500, easing: "inOut" },
          { channel: "lift", value: -9, at: 0, duration: 140, easing: "out" },
          { channel: "lift", value: 0, at: 140, duration: 380, easing: "back" },
        ], 2);
        break;
      case "proud":
        if (!this.reducedMotion.matches) this.emit("star", 5);
        this.play([
          { channel: "tilt", value: -0.14, at: 0, duration: 220, easing: "out" },
          { channel: "tilt", value: -0.14, at: 220, duration: Math.max(0, duration - 500), easing: "linear" },
          { channel: "tilt", value: 0, at: Math.max(0, duration - 280), duration: 280, easing: "inOut" },
        ], 2);
        break;
      case "wink":
        this.play([
          { channel: "tilt", value: 0.12, at: 0, duration: 160, easing: "out" },
          { channel: "tilt", value: 0.12, at: 160, duration: Math.max(0, duration - 400), easing: "linear" },
          { channel: "tilt", value: 0, at: Math.max(0, duration - 240), duration: 240, easing: "inOut" },
        ], 2);
        break;
      case "yawn":
        this.play([
          { channel: "squashY", value: 0.12, at: 0, duration: 500, easing: "inOut" },
          { channel: "squashY", value: 0, at: 500, duration: 500, easing: "inOut" },
          { channel: "squashX", value: -0.06, at: 0, duration: 500, easing: "inOut" },
          { channel: "squashX", value: 0, at: 500, duration: 500, easing: "inOut" },
        ], 2);
        if (!this.reducedMotion.matches) this.particleBursts.push({ type: "z", count: 2, at: now + 700 });
        break;
      case "happy":
        break;
      case "annoyed":
        break;
    }
    this.requestFrame();
  }

  greet() {
    const now = performance.now();
    this.greetingExit = null;
    this.greetingStartedAt = 0;
    this.shortGreetingStartedAt = this.reducedMotion.matches ? 0 : now;
    this.greetingBlinkAt = this.reducedMotion.matches ? [] : [now + 550, now + 1500];
    this.nextBlinkAt = now + 3000;
    this.waveStartedAt = this.reducedMotion.matches ? 0 : now + 450;
    this.waveUntil = this.reducedMotion.matches ? 0 : now + 1550;
    this.emote = "happy";
    this.emoteStartedAt = now;
    this.emoteUntil = now + 2050;
    this.play([
      { channel: "lift", value: -1.8, at: 0, duration: 220, easing: "out" },
      { channel: "lift", value: 0, at: 220, duration: 220, easing: "back" },
      { channel: "hands", value: 1, at: 250, duration: 280, easing: "out" },
      { channel: "hands", value: 0, at: 1550, duration: 200, easing: "inOut" },
      { channel: "squashY", value: -0.05, at: 250, duration: 100, easing: "out" },
      { channel: "squashY", value: 0, at: 350, duration: 260, easing: "back" },
      { channel: "squashX", value: 0.04, at: 250, duration: 100, easing: "out" },
      { channel: "squashX", value: 0, at: 350, duration: 260, easing: "back" },
    ], 4);
    this.requestFrame();
  }

  welcome(startAt = performance.now(), launchGreeting = false) {
    const now = startAt;
    this.greetingExit = null;
    this.greetingIsLaunch = launchGreeting;
    this.shortGreetingStartedAt = 0;
    this.emote = null;
    this.emoteUntil = 0;
    this.greetingBlinkAt = [];
    this.nextBlinkAt = now + 5000;
    this.waveStartedAt = this.reducedMotion.matches ? 0 : now + 1520;
    this.waveUntil = this.reducedMotion.matches ? 0 : now + 2580;
    this.greetingStartedAt = this.reducedMotion.matches ? 0 : now;
    this.play([
      { channel: "hands", value: 0, at: 0, duration: 0, easing: "linear" },
    ], 4);
    this.requestFrame();
  }

  interruptGreet() {
    const now = performance.now();
    const pose = this.currentGreetingPose(now);
    if (this.value("hands") <= 0.01 && now >= this.waveUntil && !this.greetingStartedAt && !this.greetingExit) return;
    if (pose) this.greetingExit = { startedAt: now, duration: 180, pose };
    this.waveStartedAt = 0;
    this.waveUntil = 0;
    this.shortGreetingStartedAt = 0;
    this.greetingBlinkAt = [];
    this.greetingStartedAt = 0;
    this.play([{ channel: "hands", value: 0, at: 0, duration: 150, easing: "inOut" }], 3);
  }

  doRoll(duration = 950, turns = 1) {
    this.play([
      { channel: "roll", value: Math.PI * 2 * turns, at: 0, duration, easing: "inOut" },
      { channel: "roll", value: 0, at: duration, duration: 0, easing: "linear" },
    ], 3);
  }

  animateMorph(target: number, duration = 520) {
    this.play([{ channel: "morph", value: clamp(target, 0, 1), at: 0, duration, easing: "inOut" }], 3);
  }

  resetMorph() {
    this.animateMorph(0, 620);
  }

  love() {
    this.triggerEmote("love", 1800);
  }

  annoy() {
    this.squash();
    this.emote = "annoyed";
    this.emoteStartedAt = performance.now();
    this.emoteUntil = this.emoteStartedAt + 800;
    this.requestFrame();
  }

  squash() {
    this.play([
      { channel: "squashY", value: -0.22, at: 0, duration: 70, easing: "out" },
      { channel: "squashY", value: 0.1, at: 70, duration: 130, easing: "out" },
      { channel: "squashY", value: 0, at: 200, duration: 170, easing: "inOut" },
      { channel: "squashX", value: 0.16, at: 0, duration: 70, easing: "out" },
      { channel: "squashX", value: -0.05, at: 70, duration: 130, easing: "out" },
      { channel: "squashX", value: 0, at: 200, duration: 170, easing: "inOut" },
    ], 3);
  }

  poke(): "annoyed" | "dizzy" | "ignored" {
    this.interruptGreet();
    if (this.activity === "dizzy") return "ignored";
    const now = performance.now();
    this.slapTimes = this.slapTimes.filter((time) => now - time < 1700);
    this.slapTimes.push(now);
    if (this.slapTimes.length >= 3) {
      this.slapTimes = [];
      this.squash();
      this.dizzy();
      return "dizzy";
    }
    this.annoy();
    return "annoyed";
  }

  dizzy() {
    this.setState("dizzy", true);
  }

  private playDizzy() {
    this.doRoll(1300, 2);
  }

  prepareForFile(x?: number, y?: number) {
    if (this.receivingFile) return;
    const continuingFileMotion = this.fileReturnActive || this.ingestStartedAt > 0;
    this.receivingFile = true;
    this.fileReturnActive = false;
    this.fileReturnStartedAt = 0;
    this.fileLocked = false;
    this.fileCaptured = false;
    this.fileLockAt = 0;
    this.fileCursorSpeed = 0;
    if (!continuingFileMotion) {
      this.fileBodyX = 0;
      this.fileBodyXVelocity = 0;
      this.fileTilt = 0;
      this.fileHop = 0;
      this.fileMouth = 0;
      this.fileMouthVelocity = 0;
    }
    this.fileBodyTargetX = 0;
    this.fileMouthTarget = 0.2;
    this.fileCursorAt = 0;
    if (x !== undefined && y !== undefined) this.updateFileCursor(x, y);
    this.interruptGreet();
    this.emote = null;
    this.emoteUntil = 0;
    this.blink();
    if (this.reducedMotion.matches) {
      this.snap("hands", 1);
      this.snap("morph", 1);
      this.requestFrame();
      return;
    }
    this.play([
      { channel: "morph", value: 1, at: 0, duration: 380, easing: "back" },
      { channel: "hands", value: 1, at: 80, duration: 260, easing: "back" },
    ], 4);
    this.requestFrame();
  }

  updateFileCursor(x: number, y: number) {
    if (!this.receivingFile) return;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const now = performance.now();
    const localX = x - rect.left;
    const localY = y - rect.top;
    const elapsed = this.fileCursorAt ? (now - this.fileCursorAt) / 1000 : 0;
    if (elapsed > 0.001) {
      this.fileCursorSpeed = Math.hypot(localX - this.fileCursorX, localY - this.fileCursorY) / elapsed;
    }
    this.fileCursorX = localX;
    this.fileCursorY = localY;
    this.fileCursorAt = now;

    const viewWidth = this.canvasLogicalWidth(rect);
    const maxTravel = Math.max(0, viewWidth / 2 - 46);
    this.fileBodyTargetX = clamp((localX / rect.width - 0.5) * viewWidth, -maxTravel, maxTravel);
    const unit = rect.width / viewWidth;
    const centerX = rect.width / 2 + this.fileBodyX * unit;
    const centerY = rect.height / 2;
    const distance = Math.hypot(localX - centerX, localY + 14 - centerY);
    if (!this.fileLocked && distance < 60 && this.fileCursorSpeed < 180) {
      this.fileLocked = true;
      this.fileLockAt = now;
    } else if (this.fileLocked && distance > 90) {
      this.fileLocked = false;
      this.fileLockAt = 0;
    }
    this.fileMouthTarget = this.fileLocked ? 0.42 : 0.2;
    this.lookAt((localX - centerX) / Math.max(1, rect.width / 2), (localY + 10 - centerY) / Math.max(1, rect.height / 2));
    this.requestFrame();
  }

  cancelFileReceive() {
    if (!this.receivingFile) return;
    this.receivingFile = false;
    this.fileReturnActive = true;
    this.fileReturnStartedAt = performance.now();
    this.fileLocked = false;
    this.fileCaptured = false;
    this.fileLockAt = 0;
    this.fileMouthTarget = 0;
    this.fileBodyTargetX = 0;
    this.fileCursorSpeed = 0;
    this.ingestStartedAt = 0;
    this.lookAt(0, 0);
    if (this.reducedMotion.matches) {
      this.snap("hands", 0);
      this.snap("morph", 0);
      this.snap("eyeScale", 0);
      this.snap("squashY", 0);
      this.snap("mouth", 0);
      this.fileReturnActive = false;
      this.fileReturnStartedAt = 0;
      this.fileBodyX = 0;
      this.fileBodyXVelocity = 0;
      this.fileTilt = 0;
      this.fileHop = 0;
      this.fileMouth = 0;
      this.fileMouthVelocity = 0;
      this.requestFrame();
      return;
    }
    this.play([
      { channel: "hands", value: 0, at: 0, duration: 260, easing: "inOut" },
      { channel: "morph", value: 0, at: 30, duration: 420, easing: "inOut" },
      { channel: "eyeScale", value: 0, at: 0, duration: 220, easing: "inOut" },
      { channel: "squashY", value: 0, at: 0, duration: 240, easing: "inOut" },
    ], 4);
    this.requestFrame();
  }

  eat() {
    this.gulp();
  }

  gulp() {
    const wasReceivingFile = this.receivingFile;
    if (!wasReceivingFile && this.ingestStartedAt && performance.now() - this.ingestStartedAt < 1280) return;
    this.fileCaptured = wasReceivingFile && this.fileLocked;
    if (wasReceivingFile) this.snap("mouth", this.fileMouth);
    this.receivingFile = false;
    this.fileReturnActive = false;
    this.fileReturnStartedAt = 0;
    this.fileLocked = false;
    this.fileMouthTarget = 0;
    this.fileBodyTargetX = 0;
    this.fileCursorSpeed = 0;
    this.fileLockAt = 0;
    this.ingestStartedAt = performance.now();
    this.blink();
    if (this.reducedMotion.matches) {
      this.fileHop = 0;
      this.snap("mouth", 0);
      this.snap("hands", 0);
      this.snap("morph", 0);
      this.snap("eyeScale", 0);
      this.ingestStartedAt = 0;
      this.requestFrame();
      return;
    }
    const steps: MotionStep[] = [
      { channel: "mouth", value: 1, at: 80, duration: 150, easing: "back" },
      { channel: "mouth", value: 0, at: 380, duration: 90, easing: "inOut" },
      { channel: "hands", value: 1, at: 0, duration: wasReceivingFile ? 100 : 170, easing: "back" },
      { channel: "hands", value: 0, at: 740, duration: 270, easing: "inOut" },
      { channel: "morph", value: 1, at: 0, duration: wasReceivingFile ? 80 : 220, easing: "back" },
      { channel: "morph", value: 0, at: 930, duration: 350, easing: "inOut" },
      { channel: "squashY", value: -0.08, at: 0, duration: 80, easing: "out" },
      { channel: "squashY", value: 0.06, at: 80, duration: 300, easing: "inOut" },
      { channel: "squashY", value: -0.18, at: 380, duration: 70, easing: "out" },
      { channel: "squashY", value: 0.1, at: 450, duration: 130, easing: "out" },
      { channel: "squashY", value: 0, at: 580, duration: 70, easing: "inOut" },
      { channel: "squashX", value: 0.06, at: 0, duration: 80, easing: "out" },
      { channel: "squashX", value: -0.03, at: 80, duration: 300, easing: "inOut" },
      { channel: "squashX", value: 0.14, at: 380, duration: 70, easing: "out" },
      { channel: "squashX", value: -0.05, at: 450, duration: 130, easing: "out" },
      { channel: "squashX", value: 0, at: 580, duration: 70, easing: "inOut" },
    ];
    steps.push({ channel: "tilt", value: 0, at: 930, duration: 350, easing: "inOut" });
    this.play(steps, 4);
    this.requestFrame();
  }

  dispose() {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.clearWake();
    this.appearanceObserver.disconnect();
    if (this.activityTooltipTimer !== undefined) window.clearTimeout(this.activityTooltipTimer);
    this.root.removeEventListener("pointermove", this.onPointerMove);
    this.root.removeEventListener("pointerleave", this.onPointerLeave);
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.reducedMotion.removeEventListener("change", this.onMotionPreferenceChange);
  }

  private readonly onVisibilityChange = () => {
    if (document.hidden) {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.clearWake();
      return;
    }
    this.previousFrame = 0;
    this.requestFrame();
  };

  private readonly onMotionPreferenceChange = () => {
    if (this.reducedMotion.matches) {
      this.fileHop = 0;
      this.pending.length = 0;
      this.pendingBadge = null;
      for (const channel of CHANNELS) {
        const track = this.tracks[channel];
        track.from = track.value;
        track.to = 0;
        track.startsAt = performance.now();
        track.duration = 0;
      }
      this.heartStartedAt = 0;
      this.sparkStartedAt = 0;
      this.particleBursts.length = 0;
      this.particles.length = 0;
      if (this.fileReturnActive) {
        this.fileReturnActive = false;
        this.fileReturnStartedAt = 0;
        this.fileBodyX = 0;
        this.fileBodyXVelocity = 0;
        this.fileTilt = 0;
        this.fileMouth = 0;
        this.fileMouthVelocity = 0;
      }
      this.emote = null;
      this.emoteUntil = 0;
      this.waveStartedAt = 0;
      this.waveUntil = 0;
      this.shortGreetingStartedAt = 0;
      this.greetingStartedAt = 0;
      this.greetingExit = null;
      this.shortGreetingTilt = 0;
      this.greetingBlinkAt = [];
      this.blinkStartedAt = 0;
      this.doubleBlinkAt = 0;
      this.snap("badgeScale", this.badge ? 1 : 0);
    }
    this.requestFrame();
  };

  private syncAppearance() {
    const skin = this.root.dataset.skin;
    const accessory = this.root.dataset.accessory;
    this.skin = skin === "smoke" || skin === "midnight" || skin === "mint" || skin === "coral" || skin === "lavender" ? skin : "pearl";
    this.accessory = accessory === "star" || accessory === "bow" || accessory === "halo" || accessory === "leaf" || accessory === "crown" ? accessory : "none";
    // Runs every frame: no frame request here, or the loop could never rest.
    this.applyMood(this.root.dataset.mood ?? "calm");
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private requestFrame() {
    if (this.disposed || this.frame || document.hidden || !this.onScreen) return;
    this.clearWake();
    this.frame = requestAnimationFrame(this.renderFrame);
  }

  private clearWake() {
    if (this.wakeTimer === undefined) return;
    window.clearTimeout(this.wakeTimer);
    this.wakeTimer = undefined;
  }

  /**
   * Nothing moves until the next blink: the loop stops drawing and a timer wakes it
   * then. Every public animation entry point requests a frame, so it restarts at once.
   * Adapted from Coucou's island loop, which stops when nothing is animating.
   */
  private sleepUntilNextBeat(now: number) {
    this.clearWake();
    const wakeAt = Math.min(this.nextBlinkAt, this.doubleBlinkAt > 0 ? this.doubleBlinkAt : Number.POSITIVE_INFINITY);
    this.wakeTimer = window.setTimeout(() => {
      this.wakeTimer = undefined;
      this.previousFrame = 0;
      this.requestFrame();
    }, Math.max(16, wakeAt - now));
  }

  /** True when the next frame would draw exactly what is already on the canvas. */
  private isAtRest(now: number) {
    const reduced = this.reducedMotion.matches;
    const staticActivity = this.activity === "idle"
      || (reduced && this.activity !== "dizzy" && this.activity !== "finished" && this.activity !== "sleeping" && this.activity !== "ratelimit");
    if (!staticActivity) return false;
    if (this.pending.length || this.pendingBadge || this.particleBursts.length || this.particles.length) return false;
    for (const channel of CHANNELS) {
      const track = this.tracks[channel];
      if (track.duration > 0 && now < track.startsAt + track.duration) return false;
    }
    if (this.emote || this.greetingStartedAt || this.shortGreetingStartedAt || this.greetingExit || this.waveUntil > 0) return false;
    if (this.ingestStartedAt || this.receivingFile || this.fileReturnActive) return false;
    if (!reduced && (this.badge === "dots" || this.accessory === "star")) return false;
    if (this.blinkStartedAt && now - this.blinkStartedAt < 220) return false;
    if (this.sparkStartedAt && now - this.sparkStartedAt < 1400) return false;
    if (this.heartStartedAt && now - this.heartStartedAt < 1000) return false;
    if (this.eyeShapeTransitionAt && now - this.eyeShapeTransitionAt < 140) return false;
    if (Math.abs(this.approvalBounce) > 0.01 || Math.abs(this.shortGreetingTilt) > 0.001 || Math.abs(this.fileHop) > 0.01) return false;
    if (!this.gazeSettled) return false;
    for (let index = 0; index < 3; index += 1) {
      if (Math.abs(this.targetStateColor[index] - this.stateColor[index]) > 0.5) return false;
    }
    return true;
  }

  private readonly renderFrame = (timestamp: number) => {
    this.frame = 0;
    if (!this.root.isConnected) {
      this.dispose();
      return;
    }
    const now = timestamp || performance.now();
    const delta = this.previousFrame ? clamp((now - this.previousFrame) / 1000, 0, 0.05) : 1 / 60;
    this.previousFrame = now;
    this.syncAppearance();
    this.advance(now, delta);
    this.updateActivityMarkerHover();
    this.draw(now);
    if (this.isAtRest(now)) this.sleepUntilNextBeat(now);
    else this.requestFrame();
  };

  private play(steps: MotionStep[], priority: number) {
    if (this.reducedMotion.matches) return;
    const channels = new Set(steps.map((step) => step.channel));
    const versions = new Map<Channel, number>();
    for (const channel of channels) {
      if (this.tracks[channel].priority > priority) continue;
      this.versions[channel] += 1;
      versions.set(channel, this.versions[channel]);
    }
    const startsAt = performance.now();
    for (const step of steps) {
      const version = versions.get(step.channel);
      if (version === undefined) continue;
      this.pending.push({ ...step, startsAt: startsAt + step.at, priority, version });
    }
    this.pending.sort((a, b) => a.startsAt - b.startsAt);
    this.requestFrame();
  }

  private snap(channel: Channel, value: number) {
    this.versions[channel] += 1;
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      if (this.pending[index].channel === channel) this.pending.splice(index, 1);
    }
    const track = this.tracks[channel];
    track.value = value;
    track.from = value;
    track.to = value;
    track.startsAt = performance.now();
    track.duration = 0;
    track.priority = 0;
  }

  private advance(now: number, delta: number) {
    while (this.pending.length && this.pending[0].startsAt <= now) {
      const step = this.pending.shift()!;
      if (step.version !== this.versions[step.channel]) continue;
      this.startTrack(step, step.startsAt);
    }
    for (const channel of CHANNELS) this.updateTrack(this.tracks[channel], now);

    if (this.pendingBadge && now >= this.pendingBadge.at) {
      const next = this.pendingBadge;
      this.pendingBadge = null;
      this.badge = next.kind;
      this.badgeColor = next.color;
      if (next.kind) this.play([{ channel: "badgeScale", value: 1, at: 0, duration: 280, easing: "back" }], 3);
    }
    for (let index = this.particleBursts.length - 1; index >= 0; index -= 1) {
      const burst = this.particleBursts[index];
      if (now < burst.at) continue;
      this.emit(burst.type, burst.count);
      this.particleBursts.splice(index, 1);
    }
    const colorMix = 1 - Math.pow(0.002, delta);
    for (let index = 0; index < 3; index += 1) {
      this.stateColor[index] += (this.targetStateColor[index] - this.stateColor[index]) * colorMix;
    }
    const bounceTarget = this.activity === "approval" && !this.reducedMotion.matches
      ? -Math.abs(Math.sin((now / 1000) * 5.2)) * 2.1
      : 0;
    this.approvalBounce += (bounceTarget - this.approvalBounce) * (1 - Math.pow(0.0008, delta));
    const shortWaveActive = this.shortGreetingStartedAt && this.waveStartedAt > 0 && now >= this.waveStartedAt && now < this.waveUntil;
    const shortWaveTime = shortWaveActive ? (now - this.waveStartedAt) / 1000 : 0;
    const shortWaveTiltTarget = shortWaveActive ? -0.06 + Math.sin(shortWaveTime * Math.PI * 2 * 1.2) * 0.07 : 0;
    this.shortGreetingTilt += (shortWaveTiltTarget - this.shortGreetingTilt) * (1 - Math.pow(0.0008, delta));
    const fileHopTarget = !this.reducedMotion.matches && this.fileLocked && this.fileLockAt > 0
      ? -5 * Math.sin(Math.PI * clamp((now - this.fileLockAt) / 150, 0, 1))
      : 0;
    this.fileHop += (fileHopTarget - this.fileHop) * (1 - Math.exp(-delta / 0.045));
    if (this.emote && now >= this.emoteUntil) {
      this.emote = null;
      this.emoteUntil = 0;
    }
    if (this.greetingStartedAt && now - this.greetingStartedAt >= 4600) {
      this.greetingStartedAt = 0;
      this.waveStartedAt = 0;
      this.waveUntil = 0;
      this.play([{ channel: "hands", value: 0, at: 0, duration: 150, easing: "inOut" }], 4);
    }
    if (this.shortGreetingStartedAt && this.waveUntil > 0 && now >= this.waveUntil) {
      this.shortGreetingStartedAt = 0;
      this.waveStartedAt = 0;
      this.waveUntil = 0;
    }
    if (this.ingestStartedAt && now - this.ingestStartedAt >= 1280) this.ingestStartedAt = 0;
    if (this.activity === "dizzy" && now - this.stateStartedAt > 1550) this.setState("idle");
    if (this.activity === "finished" && now - this.stateStartedAt > 2100) this.setState("idle");

    if ((this.activity === "sleeping" || this.activity === "ratelimit") && now - this.lastAmbientParticleAt >= 1300) {
      this.lastAmbientParticleAt = now;
      if (this.activity === "sleeping") this.emit("z", 1);
      else if (Math.random() < 0.5) this.emit("sweat", 1);
    }

    if (this.receivingFile || this.ingestStartedAt || this.fileReturnActive) this.stepFileMotion(delta, now);
    while (this.greetingBlinkAt.length && now >= this.greetingBlinkAt[0]) {
      this.blinkStartedAt = this.greetingBlinkAt.shift()!;
    }
    const searchingLook = this.activity === "searching";
    const thinkingLook = this.activity === "thinking";
    const pointerX = this.pointerTracking ? this.targetGazeX * 0.62 : 0;
    const pointerY = this.pointerTracking ? this.targetGazeY * 0.5 : 0;
    const seconds = now / 1000;
    const targetX = searchingLook
      ? this.reducedMotion.matches ? 0 : Math.sin(seconds * 2.6) * 0.6
      : thinkingLook
        ? pointerX * 0.35 + 0.55 * 0.55
        : this.activity === "sleeping"
          ? 0
          : this.activity === "dizzy"
            ? this.reducedMotion.matches ? 0 : Math.sin(seconds * 9) * 0.25
            : pointerX;
    const targetY = searchingLook
      ? this.reducedMotion.matches ? 0 : -0.06
      : thinkingLook
        ? pointerY * 0.3 + 0.55 * 0.5
        : this.activity === "sleeping"
          ? -0.14
          : this.activity === "dizzy"
            ? 0
            : pointerY;
    const follow = this.reducedMotion.matches ? 1 : 1 - Math.pow(0.0025, delta);
    this.gazeX += (targetX - this.gazeX) * follow;
    this.gazeY += (targetY - this.gazeY) * follow;
    this.gazeSettled = Math.abs(targetX - this.gazeX) < 0.002 && Math.abs(targetY - this.gazeY) < 0.002;
    if (this.doubleBlinkAt > 0 && now >= this.doubleBlinkAt) {
      if (!this.reducedMotion.matches && this.activity !== "sleeping" && this.activity !== "dizzy") {
        this.blinkStartedAt = now;
      }
      this.doubleBlinkAt = 0;
    }
    if (now >= this.nextBlinkAt) {
      if (!this.reducedMotion.matches && this.activity !== "sleeping" && this.activity !== "dizzy") {
        this.blinkStartedAt = now;
        if (Math.random() < 0.22) this.doubleBlinkAt = now + 230;
      }
      this.nextBlinkAt = now + 2200 + Math.random() * 3200;
    }
    for (const particle of this.particles) particle.age += delta;
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      if (this.particles[index].age >= this.particles[index].life) this.particles.splice(index, 1);
    }
  }

  private stepFileMotion(delta: number, now: number) {
    let remaining = delta;
    while (remaining > 0) {
      const dt = Math.min(1 / 240, remaining);
      const response = this.receivingFile && this.fileLocked ? 0.18 : 0.35;
      const damping = this.receivingFile && this.fileLocked ? 0.75 : 0.7;
      const omega = (2 * Math.PI) / response;
      const targetX = this.receivingFile ? this.fileBodyTargetX : 0;
      const acceleration = omega * omega * (targetX - this.fileBodyX) - 2 * damping * omega * this.fileBodyXVelocity;
      this.fileBodyXVelocity += acceleration * dt;
      this.fileBodyX += this.fileBodyXVelocity * dt;
      if (this.receivingFile || this.fileReturnActive) {
        const mouthOmega = (2 * Math.PI) / 0.25;
        const mouthAcceleration = mouthOmega * mouthOmega * (this.fileMouthTarget - this.fileMouth) - 2 * 0.6 * mouthOmega * this.fileMouthVelocity;
        this.fileMouthVelocity += mouthAcceleration * dt;
        this.fileMouth = clamp(this.fileMouth + this.fileMouthVelocity * dt, 0, 0.5);
      }
      remaining -= dt;
    }
    const rect = this.canvas.getBoundingClientRect();
    const horizontalVelocity = this.fileBodyXVelocity * rect.width / this.canvasLogicalWidth(rect);
    const targetTilt = clamp(horizontalVelocity * 0.0015, -0.18, 0.18);
    this.fileTilt += (targetTilt - this.fileTilt) * (1 - Math.pow(0.0005, delta));
    if (this.fileReturnActive && now >= this.fileReturnStartedAt + 260
      && Math.abs(this.fileBodyX) < 0.08
      && Math.abs(this.fileBodyXVelocity) < 0.5
      && Math.abs(this.fileTilt) < 0.003
      && this.fileMouth < 0.005) {
      this.fileReturnActive = false;
      this.fileReturnStartedAt = 0;
      this.fileBodyX = 0;
      this.fileBodyXVelocity = 0;
      this.fileTilt = 0;
      this.fileMouth = 0;
      this.fileMouthVelocity = 0;
    }
  }

  private emit(type: ParticleKind, count: number) {
    if (this.reducedMotion.matches) return;
    for (let index = 0; index < count; index += 1) {
      const isZ = type === "z";
      this.particles.push({
        type,
        x: (Math.random() - 0.5) * 0.9 + (isZ ? 0.55 : 0),
        y: -0.7 - Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.35 + (isZ ? 0.18 : 0),
        vy: -(0.45 + Math.random() * 0.35),
        age: -index * 0.14,
        life: 1.3 + Math.random() * 0.5,
        rot: Math.random() * Math.PI * 2,
        size: 0.15 + Math.random() * 0.08,
      });
    }
  }

  private startTrack(step: ScheduledStep, startAt: number) {
    const track = this.tracks[step.channel];
    this.updateTrack(track, startAt);
    if (track.priority > step.priority) return;
    track.from = track.value;
    track.to = step.value;
    track.startsAt = startAt;
    track.duration = step.duration;
    track.easing = step.easing ?? "out";
    track.priority = step.priority;
    if (step.duration <= 0) this.updateTrack(track, startAt);
  }

  private updateTrack(track: Track, now: number) {
    if (track.duration <= 0 || now >= track.startsAt + track.duration) {
      track.value = track.to;
      track.priority = 0;
      return;
    }
    if (now < track.startsAt) return;
    const progress = (now - track.startsAt) / track.duration;
    const eased = easing(progress, track.easing);
    track.value = track.from + (track.to - track.from) * eased;
  }

  private value(channel: Channel) {
    return this.tracks[channel].value;
  }

  private blinkOpenness(now: number) {
    if (this.reducedMotion.matches || this.blinkStartedAt === 0) return 1;
    const progress = (now - this.blinkStartedAt) / 200;
    if (progress >= 1) return 1;
    if (progress < 0.35) return 1 - 0.94 * easing(progress / 0.35, "inOut");
    return 0.06 + 0.94 * easing((progress - 0.35) / 0.65, "out");
  }

  private draw(now: number) {
    const ctx = this.context;
    if (!ctx || this.canvas.width === 0 || this.canvas.height === 0) return;
    const viewWidth = this.canvasLogicalWidth();
    ctx.setTransform(this.canvas.width / viewWidth, 0, 0, this.canvas.height / 100, 0, 0);
    ctx.clearRect(0, 0, viewWidth, 100);

    const t = now / 1000;
    const breath = this.reducedMotion.matches || this.activity !== "sleeping" ? 0 : Math.sin(t * 1.8) * 0.035;
    const activeEmote = this.emote && now < this.emoteUntil ? this.emote : null;
    const greeting = this.currentGreetingPose(now);
    const mouth = this.receivingFile || this.fileReturnActive ? this.fileMouth : this.value("mouth");
    const palette = PALETTES[this.skin];
    const idleX = 1 - breath * 0.57;
    const idleY = 1 + breath;
    const ingestElapsed = this.ingestStartedAt ? now - this.ingestStartedAt : -1;
    const chewPhase = ingestElapsed >= 650 && ingestElapsed < 930 ? ((ingestElapsed - 650) % 140) / 140 : -1;
    const chewX = chewPhase >= 0 ? 0.03 * Math.sin(Math.PI * chewPhase) : 0;
    const chewY = chewPhase >= 0 ? -0.05 * Math.sin(Math.PI * chewPhase) : 0;
    const lift = this.value("lift") + this.approvalBounce + this.fileHop;
    const fileMotionActive = this.receivingFile || this.ingestStartedAt || this.fileReturnActive;
    const tilt = this.value("tilt") + this.value("roll") + this.shortGreetingTilt + (fileMotionActive ? this.fileTilt : 0) + (greeting?.tilt ?? 0);
    const eyeOpen = this.blinkOpenness(now) * (greeting?.open ?? 1);

    ctx.save();
    const fileOffsetX = fileMotionActive ? this.fileBodyX : 0;
    if (greeting?.launch) this.drawGreetingHalo(ctx, greeting, viewWidth, lift);
    ctx.translate(
      viewWidth / 2 + this.value("offsetX") * 30 + fileOffsetX + (greeting?.x ?? 0),
      (greeting?.launch ? 60 : 51) + lift + (greeting?.y ?? 0),
    );
    ctx.rotate(tilt);
    ctx.scale(idleX * (1 + this.value("squashX") + chewX) * (greeting?.sx ?? 1) * (greeting?.scale ?? 1), idleY * (1 + this.value("squashY") + chewY) * (greeting?.sy ?? 1) * (greeting?.scale ?? 1));
    if (!greeting?.launch) this.drawHandStems(ctx, palette, now, greeting);
    const body = this.drawBody(ctx, palette, greeting);
    this.drawMouth(ctx, body, this.value("morph"), mouth);
    this.drawFace(ctx, body, eyeOpen, now, activeEmote, greeting);
    this.drawHands(ctx, palette, now, greeting);
    this.drawAccessory(ctx, palette, now);
    if (greeting?.launch) this.drawGreetingBadge(ctx, greeting);
    ctx.restore();

    this.drawParticles(ctx);
    this.drawActivityMarker(ctx, now);
  }

  private canvasLogicalWidth(rect?: DOMRect) {
    if (!this.canvas.closest(".pet-stage")) return 100;
    if (rect) return rect.height ? (rect.width / rect.height) * 100 : 100;
    return this.canvas.height ? (this.canvas.width / this.canvas.height) * 100 : 100;
  }

  private welcomePose(now: number): GreetingPose | null {
    if (!this.greetingStartedAt || this.reducedMotion.matches) return null;
    const t = (now - this.greetingStartedAt) / 1000;
    if (t < 0 || t >= 4.6) return null;

    const segment = (start: number, end: number) => clamp((t - start) / (end - start), 0, 1);
    const growBack = easing(segment(0.02, 0.45), "back");
    const bodyScale = (3 + (58 - 3) * growBack) / 58;
    const pose: GreetingPose = {
      scale: bodyScale,
      x: 0,
      y: -35 * (1 - easing(segment(0.02, 0.45), "out")),
      sx: 1,
      sy: 1,
      tilt: 0,
      eye: "dot",
      eyeRoll: 0,
      open: 1,
      lookX: 0,
      lookY: 0,
      handLeft: 0,
      handRight: 0,
      wave: -1,
    };

    pose.handLeft = t < 2.58
      ? easing(segment(1.36, 1.5), "back")
      : 1 - easing(segment(2.58, 2.77), "in");
    pose.handRight = t < 2.58
      ? easing(segment(1.4, 1.58), "back")
      : 1 - easing(segment(2.61, 2.8), "in");
    if (t >= 1.52 && t < 2.58) pose.wave = t - 1.52;

    if (t >= 1.25 && t < 1.52) {
      const dip = Math.sin(Math.PI * segment(1.25, 1.52));
      pose.y += bodyScale * 8.8 * dip;
      pose.sy = 1 - 0.06 * dip;
      pose.sx = 1 + 0.04 * dip;
      pose.eyeRoll = dip;
    }
    if (t >= 1.52 && t < 2.8) {
      const waveTime = t - 1.52;
      const fade = 1 - segment(2.58, 2.8);
      pose.x += Math.sin(waveTime * 2 * Math.PI * 0.9) * 2.68 * fade;
      pose.tilt += Math.sin(waveTime * 2 * Math.PI * 0.9 + 0.6) * 0.05 * fade;
      pose.y += Math.sin(waveTime * 2 * Math.PI * 1.8) * 0.44 * fade;
    }
    if (t >= 2.58 && t < 3.2) {
      pose.y += bodyScale * 4.8 * Math.sin(Math.PI * segment(2.58, 3.2));
    }

    if (t >= 0.6 && t < 0.82) pose.eye = "happy";
    if ((t >= 2.45 && t < 2.58) || (t >= 2.85 && t < 3.2)) pose.eye = "happy";
    if (t >= 1.25 && t < 1.52) pose.eyeRoll = Math.sin(Math.PI * segment(1.25, 1.52));

    const blink = (start: number) => {
      const phase = segment(start, start + 0.12);
      return phase > 0 && phase < 1 ? 1 - Math.sin(Math.PI * phase) * 0.94 : 1;
    };
    pose.open = Math.min(blink(1.95), blink(3.8));

    if (t >= 0.82 && t < 1.25) pose.lookY = -0.2;
    if (t >= 1.52 && t < 2.45) { pose.lookX = 0.55; pose.lookY = -0.45; }
    if (t >= 2.45 && t < 3.2) { pose.lookX = -0.3; pose.lookY = 0.6; }
    if (t >= 3.2) {
      const settle = easing(segment(3.2, 3.55), "inOut");
      pose.lookX = -0.3 * (1 - settle);
      pose.lookY = 0.6 * (1 - settle);
    }
    return pose;
  }

  /** Coucou's launch choreography, mapped into Ghosty's existing Canvas renderer. */
  private launchGreetingPose(now: number): GreetingPose | null {
    if (!this.greetingStartedAt || this.reducedMotion.matches) return null;
    const t = (now - this.greetingStartedAt) / 1000;
    if (t < 0) return null;
    if (t >= 4.6) {
      this.greetingStartedAt = 0;
      this.greetingIsLaunch = false;
      return null;
    }

    const segment = (start: number, end: number) => clamp((t - start) / (end - start), 0, 1);
    const back = (value: number) => {
      const amount = clamp(value, 0, 1);
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * (amount - 1) ** 3 + c1 * (amount - 1) ** 2;
    };
    const easeIn = (value: number) => clamp(value, 0, 1) ** 3;
    const easeInOut = (value: number) => {
      const amount = clamp(value, 0, 1);
      return amount < 0.5 ? 4 * amount ** 3 : 1 - (-2 * amount + 2) ** 3 / 2;
    };
    const easeOut = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;
    const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

    const centerX = 320;
    const centerY = 90;
    const bodyHeight = t < 0.2 ? 0 : mix(58 * 0.15, 58, back(segment(0.2, 0.6)));
    const landY = centerY + 0.12 * 58;
    const peakY = centerY - 0.15 * 58;
    const dipY = centerY + 0.36 * 58;
    const springY = centerY - 0.1 * 58;
    const sinkY = centerY + 0.3 * 58;
    const drift1 = centerX - 0.16 * 58;
    const drift2 = centerX - 0.45 * 58;
    const drift3 = centerX - 0.57 * 58;
    const drift4 = centerX - 0.85 * 58;

    let x: number;
    if (t < 0.85) x = centerX;
    else if (t < 1.2) x = mix(centerX, drift1, easeInOut(segment(0.85, 1.2)));
    else if (t < 1.3) x = mix(drift1, drift2, easeIn(segment(1.2, 1.3)));
    else if (t < 1.45) x = mix(drift2, drift3, easeInOut(segment(1.3, 1.45)));
    else if (t < 2.4) x = mix(drift3, drift4, easeInOut(segment(1.45, 2.4)));
    else if (t < 2.85) x = drift4;
    else x = mix(drift4, centerX, easeInOut(segment(2.85, 3.45)));

    let y: number;
    if (t < 0.2) y = 10;
    else if (t < 0.6) y = mix(10, landY, easeIn(segment(0.2, 0.6)));
    else if (t < 0.73) y = mix(landY, peakY, easeOut(segment(0.6, 0.73)));
    else if (t < 0.9) y = mix(peakY, centerY, easeInOut(segment(0.73, 0.9)));
    else if (t < 1.2) y = centerY;
    else if (t < 1.3) y = mix(centerY, dipY, easeIn(segment(1.2, 1.3)));
    else if (t < 1.45) y = mix(dipY, springY, easeOut(segment(1.3, 1.45)));
    else if (t < 1.6) y = mix(springY, centerY, easeInOut(segment(1.45, 1.6)));
    else if (t < 2.4) y = centerY;
    else if (t < 2.7) y = mix(centerY, sinkY, easeInOut(segment(2.4, 2.7)));
    else if (t < 2.85) y = sinkY;
    else y = mix(sinkY, centerY, easeInOut(segment(2.85, 3.45)));

    if (t >= 1.45 && t < 2.45) {
      const waveTime = t - 1.45;
      y += Math.sin(waveTime * 2 * Math.PI * 5) * 0.02 * 58 * clamp(waveTime / 0.08, 0, 1);
    }

    const landSquash = t >= 0.52 && t < 0.68 ? Math.sin(Math.PI * segment(0.52, 0.68)) : 0;
    const bounce = t >= 0.62 && t < 0.84 ? Math.sin(Math.PI * segment(0.62, 0.84)) : 0;
    let sx = 1 + 0.14 * landSquash - 0.1 * bounce;
    let sy = 1 - 0.14 * landSquash + 0.18 * bounce;
    const plunge = t >= 1.18 && t < 1.42 ? Math.sin(Math.PI * segment(1.18, 1.42)) : 0;
    const spring = t >= 1.3 && t < 1.46 ? Math.sin(Math.PI * segment(1.3, 1.46)) : 0;
    sx += 0.12 * plunge - 0.18 * spring;
    sy -= 0.12 * plunge - 0.25 * spring;
    let sink = 0;
    if (t >= 2.38 && t < 2.7) sink = easeInOut(segment(2.38, 2.7));
    else if (t >= 2.7 && t < 2.85) sink = 1 - easeInOut(segment(2.7, 2.85));
    sx += 0.18 * sink;
    sy -= 0.14 * sink;
    const micro = t >= 3.7 && t < 3.82 ? Math.sin(Math.PI * segment(3.7, 3.82)) : 0;
    sx += 0.08 * micro;
    sy -= 0.07 * micro;

    let eye: EyeShape = "dot";
    if (t >= 0.55 && t < 0.8) eye = "happy";
    if (t >= 2.4 && t < 2.7) eye = "content";
    const blink = (start: number) => {
      const phase = segment(start, start + 0.12);
      return phase > 0 && phase < 1 ? 1 - Math.sin(Math.PI * phase) * 0.94 : 1;
    };
    const open = Math.min(blink(1.95), blink(3.05), blink(3.7));

    let lookX = 0;
    let lookY = 0;
    if (t >= 1.45 && t < 2.4) { lookX = 0.55; lookY = -0.45; }
    else if (t >= 2.4 && t < 2.85) { lookX = -0.3; lookY = 0.6; }
    else if (t >= 2.85 && t < 3.45) { lookX = 0.3; lookY = 0.6; }
    else if (t >= 3.45) {
      const settle = easeInOut(segment(3.45, 3.8));
      lookX = 0.3 * (1 - settle);
      lookY = 0.6 * (1 - settle);
    }

    const handLeft = t < 2.45
      ? back(segment(1.3, 1.44))
      : 1 - easeIn(segment(2.45, 2.67));
    const handRight = t < 2.45
      ? back(segment(1.34, 1.48))
      : 1 - easeIn(segment(2.48, 2.7));
    const wave = t >= 1.45 && t < 2.45 ? t - 1.45 : -1;

    return {
      launch: true,
      bodyHeight,
      scale: bodyHeight / 120,
      x: (x - centerX) * (2 / 3),
      y: (y - centerY) * (2 / 3),
      sx,
      sy,
      tilt: 0,
      eye,
      eyeRoll: 0,
      open,
      lookX,
      lookY,
      handLeft,
      handRight,
      wave,
      tint: 0.6 * easeInOut(segment(3.85, 4.15)),
      halo: easeOut(segment(0.3, 0.7)),
      haloBlue: segment(3.85, 4.15),
      badge: back(segment(2.72, 3.0)),
    };
  }

  private currentGreetingPose(now: number): GreetingPose | null {
    if (this.greetingStartedAt) return this.greetingIsLaunch ? this.launchGreetingPose(now) : this.welcomePose(now);
    const exit = this.greetingExit;
    if (!exit) return null;
    const progress = clamp((now - exit.startedAt) / exit.duration, 0, 1);
    if (progress >= 1) {
      this.greetingExit = null;
      return null;
    }
    const amount = easing(progress, "inOut");
    const pose = exit.pose;
    return {
      scale: lerp(pose.scale, 1, amount),
      x: lerp(pose.x, 0, amount),
      y: lerp(pose.y, 0, amount),
      sx: lerp(pose.sx, 1, amount),
      sy: lerp(pose.sy, 1, amount),
      tilt: lerp(pose.tilt, 0, amount),
      eye: pose.eye,
      eyeRoll: lerp(pose.eyeRoll, 0, amount),
      open: lerp(pose.open, 1, amount),
      lookX: lerp(pose.lookX, this.gazeX, amount),
      lookY: lerp(pose.lookY, this.gazeY, amount),
      handLeft: lerp(pose.handLeft, 0, amount),
      handRight: lerp(pose.handRight, 0, amount),
      wave: -1,
      launch: pose.launch,
      bodyHeight: lerp(pose.bodyHeight ?? 0, 0, amount),
      tint: lerp(pose.tint ?? 0, 0, amount),
      halo: lerp(pose.halo ?? 0, 0, amount),
      haloBlue: lerp(pose.haloBlue ?? 0, 1, amount),
      badge: lerp(pose.badge ?? 0, 0, amount),
    };
  }

  private handPose(side: number, now: number, greeting: GreetingPose | null) {
    const gesture = greeting
      ? side < 0 ? greeting.handLeft : greeting.handRight
      : this.value("hands");
    const longWaveTime = greeting?.wave ?? -1;
    const longWave = longWaveTime >= 0;
    const shortWave = !greeting && !this.reducedMotion.matches && now >= this.waveStartedAt && now < this.waveUntil && this.waveStartedAt > 0;
    const waving = greeting?.launch ? side < 0 && longWave : side > 0 && (longWave || shortWave);
    const waveTime = longWave ? longWaveTime : shortWave ? (now - this.waveStartedAt) / 1000 : 0;
    const waveX = waving
      ? longWave ? Math.cos(waveTime * Math.PI * 5) * 0.9 : Math.cos(waveTime * 13) * 2.1 * easing(clamp(waveTime / 0.18, 0, 1), "out")
      : 0;
    const waveY = waving
      ? longWave ? Math.sin(waveTime * Math.PI * 5 + 0.8) * 1.6 : -14 * easing(clamp(waveTime / 0.18, 0, 1), "out") + Math.sin(waveTime * 13) * 3.2 * easing(clamp(waveTime / 0.18, 0, 1), "out")
      : longWave && (greeting?.launch ? side > 0 : side < 0)
        ? Math.sin(longWaveTime * 6) * 1.4
        : 0;
    return {
      x: side * (35 + gesture * 5 + waveX),
      y: 7 - gesture * 5 + waveY,
      rotation: waving
        ? longWave ? -0.5 + Math.sin(waveTime * Math.PI * 5) * 0.21 : (-0.5 + Math.sin(waveTime * 13) * 0.35) * easing(clamp(waveTime / 0.18, 0, 1), "out")
        : side * -0.08,
    };
  }

  private drawHandStems(ctx: CanvasRenderingContext2D, palette: Palette, now: number, greeting: GreetingPose | null) {
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const gesture = greeting ? side < 0 ? greeting.handLeft : greeting.handRight : this.value("hands");
      if (gesture < 0.01) continue;
      const hand = this.handPose(side, now, greeting);
      ctx.save();
      ctx.globalAlpha = clamp(gesture, 0, 1);
      ctx.beginPath();
      ctx.moveTo(side * 29, 8);
      ctx.quadraticCurveTo(side * 34, hand.y + 4, hand.x, hand.y);
      ctx.strokeStyle = palette.bottom;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawGreetingHalo(ctx: CanvasRenderingContext2D, greeting: GreetingPose, viewWidth: number, lift: number) {
    const bodyHeight = greeting.bodyHeight ?? 0;
    if (bodyHeight <= 0 || !greeting.halo) return;
    const blue = greeting.haloBlue ?? 0;
    const red = Math.round(lerp(232, 59, blue));
    const green = Math.round(lerp(195, 158, blue));
    const blueChannel = Math.round(lerp(154, 255, blue));
    const centerX = viewWidth / 2 + greeting.x;
    const centerY = 60 + lift + greeting.y;
    const halfWidth = bodyHeight * 0.67;
    for (const [radiusMultiplier, opacity] of [[2.6, 0.18], [4.2, 0.07]] as const) {
      const radius = halfWidth * radiusMultiplier * (2 / 3);
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      gradient.addColorStop(0, `rgba(${red},${green},${blueChannel},${opacity * greeting.halo})`);
      gradient.addColorStop(1, `rgba(${red},${green},${blueChannel},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawGreetingBadge(ctx: CanvasRenderingContext2D, greeting: GreetingPose) {
    const bodyHeight = greeting.bodyHeight ?? 0;
    const scale = clamp(greeting.badge ?? 0, 0, 1);
    if (bodyHeight <= 0 || scale <= 0.01) return;
    const coordinateScale = 80 / bodyHeight;
    const halfHeight = bodyHeight / 2 * coordinateScale;
    const halfWidth = bodyHeight * 0.67 * coordinateScale;
    const radius = halfHeight * 0.3;
    ctx.save();
    ctx.translate(-halfWidth * 0.78, -halfHeight * 0.72);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(0, 0, radius + halfHeight * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3BA0F5";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0B1B3A";
    for (const position of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.arc(position * radius * 0.5, 0, radius * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBody(ctx: CanvasRenderingContext2D, palette: Palette, greeting: GreetingPose | null = null) {
    const path = new Path2D();
    const morph = clamp(this.value("morph"), 0, 1);
    const steps = 72;
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps;
      const angle = progress * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const organicX = Math.sign(cos) * Math.pow(Math.abs(cos), 2 / 2.5) * 40 * (1 + Math.sin(angle * 2.1) * 0.055);
      const organicY = Math.sign(sin) * Math.pow(Math.abs(sin), 2 / 2.5) * 40 * (1 + Math.cos(angle * 3) * 0.035);
      const [roundedX, roundedY] = roundedRectPoint(progress, 88, 88, 30);
      const x = lerp(organicX, roundedX, morph);
      const y = lerp(organicY, roundedY, morph);
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();

    const fill = ctx.createLinearGradient(-16, -42, 17, 40);
    fill.addColorStop(0, palette.top);
    fill.addColorStop(0.5, palette.middle);
    fill.addColorStop(1, palette.bottom);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, .3)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = fill;
    ctx.fill(path);
    ctx.restore();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1.25;
    ctx.stroke(path);

    const tintAmount = STATE_TINT[this.activity] * 0.72 * (1 - morph);
    if (tintAmount > 0) {
      const tint = ctx.createLinearGradient(0, -40, 0, 40);
      tint.addColorStop(0, rgba(this.stateColor, 0));
      tint.addColorStop(1, rgba(this.stateColor, tintAmount));
      ctx.fillStyle = tint;
      ctx.fill(path);
    }

    if (greeting?.launch && (greeting.tint ?? 0) > 0) {
      const tint = ctx.createLinearGradient(0, 40, 0, -4);
      tint.addColorStop(0, `rgba(127,180,234,${greeting.tint})`);
      tint.addColorStop(1, "rgba(127,180,234,0)");
      ctx.fillStyle = tint;
      ctx.fill(path);
    }

    const shine = ctx.createRadialGradient(-18, -25, 1, -12, -18, 35);
    shine.addColorStop(0, `${palette.glint}38`);
    shine.addColorStop(1, `${palette.glint}00`);
    ctx.fillStyle = shine;
    ctx.fill(path);
    return path;
  }

  private drawMouth(ctx: CanvasRenderingContext2D, body: Path2D, morphValue: number, openness: number) {
    const amount = clamp(openness, 0, 0.5);
    const morph = clamp(morphValue, 0, 1);
    if (morph < 0.05) return;
    const radius = 40;
    const width = radius * 1.8 * morph;
    const height = radius * amount * morph;
    const boxTop = -radius * (0.88 + 0.06 * morph);
    const slotY = boxTop + radius * 0.08 * morph;
    const slotX = -width / 2;
    ctx.save();
    ctx.clip(body);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * morph})`;
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-radius * 0.9 * morph, boxTop + 1);
    ctx.lineTo(radius * 0.9 * morph, boxTop + 1);
    ctx.stroke();
    if (height > 0.8) {
      const corner = Math.min(width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(slotX + corner, slotY);
      ctx.lineTo(slotX + width - corner, slotY);
      ctx.quadraticCurveTo(slotX + width, slotY, slotX + width, slotY + corner);
      ctx.lineTo(slotX + width, slotY + height - corner);
      ctx.quadraticCurveTo(slotX + width, slotY + height, slotX + width - corner, slotY + height);
      ctx.lineTo(slotX + corner, slotY + height);
      ctx.quadraticCurveTo(slotX, slotY + height, slotX, slotY + height - corner);
      ctx.lineTo(slotX, slotY + corner);
      ctx.quadraticCurveTo(slotX, slotY, slotX + corner, slotY);
      ctx.closePath();
      const cavity = ctx.createLinearGradient(0, slotY, 0, slotY + height);
      cavity.addColorStop(0, "rgb(7, 8, 10)");
      cavity.addColorStop(1, "rgb(16, 19, 26)");
      ctx.fillStyle = cavity;
      ctx.fill();
      if (height > 4) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.24 * morph})`;
        ctx.beginPath();
        ctx.moveTo(slotX + corner, slotY + height - 0.5);
        ctx.lineTo(slotX + width - corner, slotY + height - 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawFace(
    ctx: CanvasRenderingContext2D,
    body: Path2D,
    eyeOpen: number,
    now: number,
    emote: PetEmote | null,
    greeting: GreetingPose | null,
  ) {
    const yaw = clamp((greeting?.lookX ?? this.gazeX) * 0.62, -1, 1);
    const pitch = clamp((greeting?.lookY ?? this.gazeY) * -0.5, -1, 1);
    const morph = clamp(this.value("morph"), 0, 1);
    const rx = 40;
    const ry = 37.6;
    const radius = 30;
    const eyeMode = greeting?.eye ?? this.eyeShape(emote, now);
    const eyeLayers = this.eyeShapeLayers(eyeMode, now);
    const eyeScale = Math.max(0.75, 1 + this.value("eyeScale"));
    const eyeHeight = radius * 1.07 * eyeScale;
    const eyeWidth = radius * (greeting?.launch ? 0.27 : 0.45) * eyeScale;

    ctx.save();
    ctx.clip(body);
    for (const side of [-1, 1]) {
      const eyeYaw = side * 0.37 + yaw;
      let eyePitch = -0.12 + pitch + this.value("roll") + (greeting?.eyeRoll ?? 0);
      eyePitch = (((eyePitch + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const cosPitch = Math.cos(eyePitch);
      if (Math.cos(eyeYaw) * cosPitch <= 0.04) continue;
      const eyeX = Math.sin(eyeYaw) * cosPitch * rx;
      const eyeY = -Math.sin(eyePitch) * ry + (morph > 0 ? ry * 0.14 * morph : 0);
      const faceScaleX = lerp(Math.max(0.18, Math.cos(eyeYaw)), 1, morph * 0.7);
      const faceScaleY = lerp(Math.max(0.18, cosPitch), 1, morph * 0.7);
      for (const layer of eyeLayers) {
        if (layer.alpha <= 0.001) continue;
        ctx.save();
        ctx.translate(eyeX, eyeY);
        ctx.scale(faceScaleX, faceScaleY);
        ctx.globalAlpha *= layer.alpha;
        this.drawEyeShape(ctx, layer.shape, eyeWidth, eyeHeight, side, now, eyeOpen);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  private eyeShapeLayers(target: EyeShape, now: number) {
    if (target !== this.activeEyeShape) {
      this.outgoingEyeShape = this.activeEyeShape;
      this.activeEyeShape = target;
      this.eyeShapeTransitionAt = now;
    }
    const progress = this.reducedMotion.matches
      ? 1
      : clamp((now - this.eyeShapeTransitionAt) / 120, 0, 1);
    if (progress >= 1) return [{ shape: this.activeEyeShape, alpha: 1 }];
    const amount = easing(progress, "inOut");
    return [
      { shape: this.outgoingEyeShape, alpha: 1 - amount },
      { shape: this.activeEyeShape, alpha: amount },
    ];
  }

  private eyeShape(emote: PetEmote | null, now: number): EyeShape {
    if (this.receivingFile) return this.fileLocked ? "cup" : "pill";
    if (this.ingestStartedAt) {
      const elapsed = now - this.ingestStartedAt;
      if (elapsed < 380 && this.fileCaptured) return "cup";
      if (elapsed >= 380 && elapsed < 1030) return "happy";
    }
    if (emote === "love") return "heart";
    if (emote === "surprised") return "dot";
    if (emote === "proud") return "star";
    if (emote === "wink") return "wink";
    if (emote === "yawn") return now - this.emoteStartedAt >= 700 ? "closed" : "tired";
    if (emote === "happy") return "happy";
    if (emote === "annoyed") return "line";
    if (this.activity === "dizzy") return "spiral";
    if (this.activity === "approval") return "wide";
    if (this.activity === "question") return "pill";
    if (this.activity === "error") return "flat";
    if (this.activity === "finished") return "happy";
    if (this.activity === "ratelimit") return "tired";
    if (this.activity === "sleeping") return "closed";
    return "pill";
  }

  private drawEyeShape(
    ctx: CanvasRenderingContext2D,
    shape: EyeShape,
    width: number,
    height: number,
    side: number,
    now: number,
    eyeOpen: number,
  ) {
    const ink = "#050505";
    ctx.save();
    switch (shape) {
      case "wide":
        this.drawCapsule(ctx, width * 1.16, Math.max(height * 1.12 * eyeOpen, width * 1.16 * 0.3));
        break;
      case "dot":
        ctx.beginPath();
        ctx.arc(0, 0, width * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
        break;
      case "line":
        ctx.rotate(-side * 0.2);
        this.drawCapsule(ctx, width * 1.56, width * 0.42);
        break;
      case "flat":
        this.drawCapsule(ctx, width * 1.44, width * 0.4);
        break;
      case "happy":
        this.drawEyeArc(ctx, width, height, false);
        break;
      case "content":
        ctx.beginPath();
        ctx.arc(0, -height * 0.16, width * 0.82, Math.PI * 0.15, Math.PI * 0.85);
        ctx.strokeStyle = ink;
        ctx.lineWidth = width * 0.5;
        ctx.lineCap = "round";
        ctx.stroke();
        break;
      case "closed":
        this.drawEyeArc(ctx, width, height, true);
        break;
      case "spiral":
        ctx.beginPath();
        for (let point = 0; point <= 28; point += 1) {
          const progress = point / 28;
          const angle = progress * Math.PI * 4.4 + (this.reducedMotion.matches ? 0 : now / 1000 * 9 * side);
          const radius = (0.06 + progress * Math.PI * 4.4 * 0.058) * width;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (point === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = ink;
        ctx.lineWidth = width * 0.22;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        break;
      case "heart":
        this.drawHeartEye(ctx, width);
        break;
      case "star":
        this.drawStarEye(ctx, width * 1.05, width * 1.05, (this.reducedMotion.matches ? 0 : now / 1000 * 1.5) * side);
        break;
      case "tired":
        ctx.save();
        ctx.translate(0, height * 0.17);
        this.drawCapsule(ctx, width, height * 0.38);
        ctx.restore();
        ctx.save();
        ctx.translate(0, -height * 0.1 + width * 0.11);
        this.drawCapsule(ctx, width * 1.24, width * 0.22);
        ctx.restore();
        break;
      case "wink":
        if (side < 0) this.drawCapsule(ctx, width, Math.max(height * eyeOpen, width * 0.3));
        else this.drawEyeArc(ctx, width, height, false);
        break;
      case "cup":
        {
          const cupWidth = width;
          const cupHeight = Math.max(height * eyeOpen, width * 0.3);
          const corner = Math.min(cupWidth / 2, cupHeight / 2);
          ctx.beginPath();
          ctx.moveTo(-cupWidth / 2, -cupHeight / 2);
          ctx.lineTo(cupWidth / 2, -cupHeight / 2);
          ctx.lineTo(cupWidth / 2, cupHeight / 2 - corner);
          ctx.quadraticCurveTo(cupWidth / 2, cupHeight / 2, cupWidth / 2 - corner, cupHeight / 2);
          ctx.lineTo(-cupWidth / 2 + corner, cupHeight / 2);
          ctx.quadraticCurveTo(-cupWidth / 2, cupHeight / 2, -cupWidth / 2, cupHeight / 2 - corner);
          ctx.closePath();
          ctx.fillStyle = ink;
          ctx.fill();
        }
        break;
      case "pill":
        this.drawCapsule(ctx, width, Math.max(height * eyeOpen, width * 0.3));
        break;
    }
    ctx.restore();
  }

  private drawCapsule(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const w = Math.max(1.5, width);
    const h = Math.max(1.5, height);
    const radius = Math.min(w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + radius, -h / 2);
    ctx.lineTo(w / 2 - radius, -h / 2);
    ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + radius);
    ctx.lineTo(w / 2, h / 2 - radius);
    ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - radius, h / 2);
    ctx.lineTo(-w / 2 + radius, h / 2);
    ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - radius);
    ctx.lineTo(-w / 2, -h / 2 + radius);
    ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + radius, -h / 2);
    ctx.closePath();
    ctx.fillStyle = "#050505";
    ctx.fill();
  }

  private drawEyeArc(ctx: CanvasRenderingContext2D, width: number, height: number, closed: boolean) {
    ctx.beginPath();
    ctx.arc(0, closed ? -height * 0.08 : height * 0.18, width * (closed ? 0.78 : 0.82), closed ? Math.PI * 0.15 : Math.PI * 1.12, closed ? Math.PI * 0.85 : Math.PI * 1.88);
    ctx.strokeStyle = "#050505";
    ctx.lineWidth = width * (closed ? 0.36 : 0.5);
    ctx.lineCap = "round";
    ctx.stroke();
  }

  private drawHeartEye(ctx: CanvasRenderingContext2D, width: number) {
    ctx.save();
    ctx.scale(width * 1.2, width * 1.2);
    ctx.beginPath();
    ctx.moveTo(0, 0.38);
    ctx.bezierCurveTo(-1.05, -0.15, -0.5, -0.95, 0, -0.38);
    ctx.bezierCurveTo(0.5, -0.95, 1.05, -0.15, 0, 0.38);
    ctx.fillStyle = "#050505";
    ctx.fill();
    ctx.restore();
  }

  private drawStarEye(ctx: CanvasRenderingContext2D, width: number, height: number, rotation: number) {
    ctx.save();
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const radius = point % 2 === 0 ? 1 : 0.46;
      const px = Math.cos(angle) * width * radius;
      const py = Math.sin(angle) * height * radius;
      if (point === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#050505";
    ctx.fill();
    ctx.restore();
  }

  private drawHands(ctx: CanvasRenderingContext2D, palette: Palette, now: number, greeting: GreetingPose | null) {
    if (greeting?.launch) {
      this.drawLaunchGreetingHands(ctx, palette, greeting);
      return;
    }
    for (const side of [-1, 1]) {
      const gesture = greeting ? side < 0 ? greeting.handLeft : greeting.handRight : this.value("hands");
      if (gesture < 0.01) continue;
      const pose = this.handPose(side, now, greeting);
      ctx.save();
      ctx.globalAlpha = clamp(gesture, 0, 1);
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.rotation);
      ctx.beginPath();
      ctx.moveTo(-3, 5);
      ctx.bezierCurveTo(-8, 3, -7, -4, -3, -6);
      ctx.bezierCurveTo(1, -9, 6, -5, 6, -1);
      ctx.bezierCurveTo(8, 3, 4, 7, -1, 6);
      ctx.closePath();
      const hand = ctx.createLinearGradient(0, -8, 0, 8);
      hand.addColorStop(0, palette.top);
      hand.addColorStop(1, palette.middle);
      ctx.fillStyle = hand;
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1.1;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawLaunchGreetingHands(ctx: CanvasRenderingContext2D, palette: Palette, greeting: GreetingPose) {
    const bodyHeight = greeting.bodyHeight ?? 0;
    if (bodyHeight <= 0) return;
    const coordinateScale = 80 / bodyHeight;
    const halfHeight = bodyHeight / 2 * coordinateScale;
    const halfWidth = bodyHeight * 0.67 * coordinateScale;
    const wave = greeting.wave;
    const waveActive = wave >= 0;

    const leftProgress = clamp(greeting.handLeft, 0, 1);
    if (leftProgress > 0.01) {
      const x = lerp(-halfWidth * 0.35, -halfWidth - bodyHeight * 0.22 * coordinateScale, leftProgress);
      let y = lerp(halfHeight * 0.85, halfHeight * 0.62, leftProgress);
      if (waveActive) {
        const rampIn = clamp(wave / 0.08, 0, 1);
        const rampOut = 1 - clamp((wave - (2.45 - 1.45)) / (2.7 - 2.45), 0, 1);
        y += Math.sin(wave * 2 * Math.PI * 5) * bodyHeight * 0.14 * coordinateScale * rampIn * rampOut;
      }
      const radius = bodyHeight * 0.15 * coordinateScale * leftProgress;
      ctx.save();
      ctx.globalAlpha = leftProgress;
      ctx.translate(x, y);
      const hand = ctx.createLinearGradient(0, -radius, 0, radius);
      hand.addColorStop(0, palette.top);
      hand.addColorStop(1, palette.middle);
      ctx.fillStyle = hand;
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const rightProgress = clamp(greeting.handRight, 0, 1);
    if (rightProgress <= 0.01) return;
    const x = lerp(halfWidth * 0.35, halfWidth + bodyHeight * 0.2 * coordinateScale, rightProgress);
    const y = lerp(halfHeight * 0.85, halfHeight * 0.2, rightProgress);
    const width = bodyHeight * 0.4 * coordinateScale * rightProgress;
    const height = bodyHeight * 0.22 * coordinateScale * rightProgress;
    const angle = waveActive ? -0.61 + Math.sin(wave * 2 * Math.PI * 2.5) * 0.04 : -0.61;
    ctx.save();
    ctx.globalAlpha = rightProgress;
    ctx.translate(x, y);
    ctx.rotate(angle);
    const radius = Math.min(width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(-width / 2 + radius, -height / 2);
    ctx.lineTo(width / 2 - radius, -height / 2);
    ctx.arcTo(width / 2, -height / 2, width / 2, -height / 2 + radius, radius);
    ctx.lineTo(width / 2, height / 2 - radius);
    ctx.arcTo(width / 2, height / 2, width / 2 - radius, height / 2, radius);
    ctx.lineTo(-width / 2 + radius, height / 2);
    ctx.arcTo(-width / 2, height / 2, -width / 2, height / 2 - radius, radius);
    ctx.lineTo(-width / 2, -height / 2 + radius);
    ctx.arcTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2, radius);
    ctx.closePath();
    const hand = ctx.createLinearGradient(width / 2, -height / 2, -width / 2, height / 2);
    hand.addColorStop(0, palette.top);
    hand.addColorStop(1, palette.middle);
    ctx.fillStyle = hand;
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1.1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    const centerX = this.canvasLogicalWidth() / 2;
    for (const particle of this.particles) {
      if (particle.age < 0) continue;
      const progress = clamp(particle.age / particle.life, 0, 1);
      const alpha = Math.min(1, progress / 0.2) * Math.min(1, (1 - progress) / 0.35);
      if (alpha <= 0) continue;
      const x = centerX + (particle.x + particle.vx * particle.age) * 52;
      const y = 51 + (particle.y + particle.vy * particle.age) * 52;
      const size = 40 * particle.size * (1 + progress * 0.18);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(particle.rot + progress * (particle.type === "star" ? 0.9 : 0.18));
      ctx.globalAlpha = alpha;

      if (particle.type === "z") {
        ctx.fillStyle = "#dfe8ff";
        ctx.font = `700 ${Math.max(5, size)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("z", 0, 0);
      } else if (particle.type === "heart") {
        ctx.scale(size / 8, size / 8);
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.bezierCurveTo(-8, -1, -5, -7, 0, -3);
        ctx.bezierCurveTo(5, -7, 8, -1, 0, 4);
        ctx.fillStyle = "#ff5574";
        ctx.fill();
      } else if (particle.type === "star") {
        ctx.scale(size, size);
        ctx.beginPath();
        for (let point = 0; point < 10; point += 1) {
          const angle = -Math.PI / 2 + point * Math.PI / 5;
          const radius = point % 2 === 0 ? 1 : 0.46;
          const px = Math.cos(angle) * radius;
          const py = Math.sin(angle) * radius;
          if (point === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = "#f7bd4e";
        ctx.fill();
      } else if (particle.type === "sweat") {
        ctx.scale(size / 7, size / 7);
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.bezierCurveTo(1.4, -2.6, 4, 1, 3.4, 3.2);
        ctx.bezierCurveTo(2.8, 6.2, -2.8, 6.2, -3.4, 3.2);
        ctx.bezierCurveTo(-4, 1, -1.4, -2.6, 0, -5);
        ctx.fillStyle = "#83dcff";
        ctx.fill();
      } else {
        ctx.scale(size / 6, size / 6);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(1.5, -1.5);
        ctx.lineTo(6, 0);
        ctx.lineTo(1.5, 1.5);
        ctx.lineTo(0, 6);
        ctx.lineTo(-1.5, 1.5);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-1.5, -1.5);
        ctx.closePath();
        ctx.fillStyle = "#fff5c9";
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawActivityMarker(ctx: CanvasRenderingContext2D, now: number) {
    if (!this.badge || this.value("morph") >= 0.25) return;
    const scale = clamp(this.value("badgeScale"), 0, 1);
    if (scale <= 0.001) return;
    ctx.save();
    ctx.translate(this.canvasLogicalWidth() / 2 + 28, 18);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#17181d";
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    if (this.badge === "dots") {
      ctx.fillStyle = "#f7f7f9";
      for (let index = 0; index < 3; index += 1) {
        const pulse = this.reducedMotion.matches ? 1 : 0.65 + (Math.sin(now / 150 + index * 1.8) + 1) * 0.2;
        ctx.beginPath();
        ctx.arc((index - 1) * 3.2, 0, 1.05 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.badge === "dot") {
      ctx.beginPath();
      ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(this.badgeColor, 1);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 6.2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(this.badgeColor, 1);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.badge === "bang" ? "!" : "?", 0, 0.3);
    }
    ctx.restore();
  }

  private drawSparkles(ctx: CanvasRenderingContext2D, now: number) {
    const progress = clamp((now - this.sparkStartedAt) / 1350, 0, 1);
    if (progress >= 1) return;
    const fade = Math.sin(progress * Math.PI);
    ctx.save();
    ctx.translate(50, 49);
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#f1dca7";
    for (let index = 0; index < 5; index += 1) {
      const angle = (index / 5) * Math.PI * 2 - Math.PI / 2;
      const distance = 11 + progress * 16;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance * 0.65;
      const radius = 2.2 * (1 - progress * 0.4);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 900 + angle);
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(radius * 0.38, -radius * 0.38);
      ctx.lineTo(radius, 0);
      ctx.lineTo(radius * 0.38, radius * 0.38);
      ctx.lineTo(0, radius);
      ctx.lineTo(-radius * 0.38, radius * 0.38);
      ctx.lineTo(-radius, 0);
      ctx.lineTo(-radius * 0.38, -radius * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawLegacyActivityMarker(ctx: CanvasRenderingContext2D, now: number) {
    if (["idle", "sleeping", "dizzy", "finished"].includes(this.activity)) {
      if (this.activity === "sleeping") this.drawSleepMarks(ctx, now);
      return;
    }
    const color = this.activity === "working" ? "#72b8ee"
      : this.activity === "thinking" ? "#b39bea"
        : this.activity === "searching" ? "#83d5df"
          : this.activity === "approval" ? "#e7b968"
            : this.activity === "question" ? "#7ccad8"
              : this.activity === "error" ? "#df8790"
                : "#d9ad83";
    const pulse = this.reducedMotion.matches ? 1 : 1 + Math.sin(now / 260) * 0.035;
    ctx.save();
    ctx.translate(22, 20);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    if (["working", "thinking", "searching"].includes(this.activity)) {
      ctx.fillStyle = "#25252b";
      for (let index = -1; index <= 1; index += 1) {
        ctx.beginPath();
        ctx.arc(index * 2, 0, 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.activity === "ratelimit") {
      ctx.beginPath();
      ctx.moveTo(0, -3.2);
      ctx.bezierCurveTo(2.1, -0.1, 2.3, 1.5, 0, 2.4);
      ctx.bezierCurveTo(-2.3, 1.5, -2.1, -0.1, 0, -3.2);
      ctx.fillStyle = "#25252b";
      ctx.fill();
    } else {
      ctx.fillStyle = "#29262b";
      ctx.font = "700 7px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.activity === "approval" ? "!" : this.activity === "question" ? "?" : "×", 0, 0.3);
    }
    ctx.restore();
  }

  private drawSleepMarks(ctx: CanvasRenderingContext2D, now: number) {
    const phase = this.reducedMotion.matches ? 0.5 : (now / 1200) % 1;
    ctx.save();
    ctx.globalAlpha = 0.45 + (1 - phase) * 0.45;
    ctx.fillStyle = "#d1dbea";
    ctx.font = "700 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("z", 69 + phase * 4, 22 - phase * 8);
    ctx.font = "700 5px sans-serif";
    ctx.fillText("z", 77 + phase * 3, 16 - phase * 6);
    ctx.restore();
  }

  private drawAccessory(ctx: CanvasRenderingContext2D, palette: Palette, now: number) {
    if (this.accessory === "none") return;
    ctx.save();
    ctx.translate(0, -42);
    if (this.accessory === "star") {
      ctx.translate(0, this.reducedMotion.matches ? 0 : Math.sin(now / 600) * 0.8);
      ctx.rotate(-0.12);
      const star = new Path2D();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 === 0 ? 7 : 3.2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (point === 0) star.moveTo(x, y);
        else star.lineTo(x, y);
      }
      star.closePath();
      ctx.fillStyle = "#e8dba6";
      ctx.strokeStyle = "#fff0bd";
      ctx.lineWidth = 0.8;
      ctx.fill(star);
      ctx.stroke(star);
    } else if (this.accessory === "bow") {
      ctx.fillStyle = "#a85d72";
      ctx.strokeStyle = "#e4a5b6";
      ctx.lineWidth = 0.9;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 4.2, 0, 4.6, 3.2, side * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = palette.glint;
      ctx.fill();
    } else if (this.accessory === "halo") {
      ctx.strokeStyle = "#d9d4bd";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, -5, 10, 3.7, -0.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#fff6d2";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(0, -5.5, 10, 3.7, -0.1, Math.PI * 1.05, Math.PI * 1.9);
      ctx.stroke();
    } else if (this.accessory === "leaf") {
      ctx.fillStyle = "#789782";
      ctx.strokeStyle = "#bed5b7";
      ctx.lineWidth = 0.8;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 4, -1.2, 4.4, 2.6, side * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = "#e1edcf";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-5, 1);
      ctx.lineTo(0, -3);
      ctx.lineTo(5, 1);
      ctx.stroke();
    } else if (this.accessory === "crown") {
      const crown = new Path2D();
      crown.moveTo(-8, 2);
      crown.lineTo(-7, -5);
      crown.lineTo(-2.5, -1);
      crown.lineTo(0, -7);
      crown.lineTo(2.5, -1);
      crown.lineTo(7, -5);
      crown.lineTo(8, 2);
      crown.closePath();
      ctx.fillStyle = "#b5a26c";
      ctx.strokeStyle = "#eadcad";
      ctx.lineWidth = 0.8;
      ctx.fill(crown);
      ctx.stroke(crown);
    }
    ctx.restore();
  }

  private drawHearts(ctx: CanvasRenderingContext2D, now: number) {
    const age = (now - this.heartStartedAt) / 980;
    if (this.heartStartedAt === 0 || age < 0 || age > 1) return;
    const positions = [
      { x: -20, delay: 0, size: 4.4 },
      { x: 19, delay: 0.2, size: 3.5 },
    ];
    for (const heart of positions) {
      const progress = clamp((age - heart.delay) / (1 - heart.delay), 0, 1);
      if (progress <= 0 || progress >= 1) continue;
      const y = 6 - easing(progress, "out") * 24;
      const alpha = Math.sin(progress * Math.PI);
      const size = heart.size * (0.78 + Math.sin(progress * Math.PI) * 0.28);
      ctx.save();
      ctx.translate(50 + heart.x, y);
      ctx.scale(size / 5, size / 5);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#ead3df";
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-8, -1, -5, -7, 0, -3);
      ctx.bezierCurveTo(5, -7, 8, -1, 0, 4);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawDizzyStars(ctx: CanvasRenderingContext2D, now: number, amount: number) {
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.translate(50, 7);
    ctx.rotate(this.reducedMotion.matches ? 0 : now / 520);
    ctx.fillStyle = "#e4d9ef";
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2;
      const x = Math.cos(angle) * 15;
      const y = Math.sin(angle) * 5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-angle);
      ctx.beginPath();
      for (let point = 0; point < 8; point += 1) {
        const theta = -Math.PI / 2 + point * Math.PI / 4;
        const radius = point % 2 === 0 ? 2.5 : 1;
        const px = Math.cos(theta) * radius;
        const py = Math.sin(theta) * radius;
        if (point === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}
