import { introLength, outroLength, stepIntro, stepOutro, textOn, viewRect, type Guide, type StepLook } from '@waypost/core';
import { composeScene } from '@waypost/render';
import { checkGuide } from './check';
import { stepNumber, transition, type Event, type Shape, type State } from './machine';
import { urlMedia, type GuideMedia, type SegmentDriver } from './media';
import { CSS } from './styles';

/* The guide player (F9; docs/02-architecture.md, "Player internals"). No framework: a Shadow DOM with a stage and a control bar.

   - Motion between steps plays from segment files; at a segment's end the step's still takes over on the canvas, drawn by
     @waypost/render exactly as the editor draws it: framing, logo, the zoom easing in and annotations appearing group by group.
   - Guided mode waits at every step; auto moves on after each step's pause; video does too, with a progress bar in time.
   - ← and → (and Space) move through the steps, the step title and callouts are announced, and reduced motion swaps the zoom's
     movement for a cut. */

const ICONS = {
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  play: '<path d="M6 4v16l14-8z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
  replay: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  enter: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  exit: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
};
const icon = (name: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* static markup only; everything from guide.json goes in through textContent and attributes */
const TEMPLATE = `<div class="wp" tabindex="0" role="region" aria-roledescription="guide" data-chrome="auto">
<div class="wp-stage"><div class="wp-box"><canvas role="img"></canvas></div>
<div class="wp-hint" hidden></div><div class="wp-spin" hidden></div>
<div class="wp-overlay" data-part="start"><div class="wp-card"><h2></h2><p></p><button class="wp-btn wp-acc" data-act="start" type="button">${icon('play')}Start guide</button></div></div>
<div class="wp-overlay" data-part="end" hidden><div class="wp-card"><h2>That's the whole guide</h2><p></p><a class="wp-btn wp-acc" data-part="end-cta" hidden></a><button class="wp-btn wp-quiet" data-act="replay" type="button">${icon('replay')}Replay</button></div></div>
<div class="wp-overlay" data-part="error" hidden><div class="wp-card"><h2>This guide couldn't load</h2><p></p></div></div>
</div>
<div class="wp-bar"><p class="wp-caption"></p><div class="wp-controls">
<button class="wp-btn wp-quiet wp-icon" data-act="prev" type="button" aria-label="Previous step">${icon('prev')}</button>
<span class="wp-counter"></span>
<div class="wp-progress" role="group" aria-label="Steps"><div class="wp-fill"></div></div>
<button class="wp-btn wp-quiet wp-icon" data-act="pause" type="button" aria-label="Pause" hidden>${icon('pause')}</button>
<a class="wp-btn wp-cta" data-part="cta" hidden></a>
<button class="wp-btn wp-acc" data-act="next" type="button"><span>Next</span>${icon('next')}</button>
<button class="wp-btn wp-quiet wp-icon" data-act="fullscreen" type="button" aria-label="Fullscreen">${icon('enter')}</button>
</div></div>
<div class="wp-sr" aria-live="polite"></div>
</div>`;

export interface MountOptions {
  /** where pictures and motion come from; files next to guide.json by default */
  media?: GuideMedia;
  /** skip the start card and play at once (the editor's preview) */
  autostart?: boolean;
  /** wait until the player is near the screen before loading pictures and motion (default true) */
  lazy?: boolean;
}

export interface PlayerHandle {
  next(): void;
  prev(): void;
  goTo(index: number): void;
  destroy(): void;
  readonly state: State;
}

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** a phone or tablet, where people tap and there may be no arrow keys */
const touch = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const fullscreenEl = (root: ShadowRoot): Element | null => root.fullscreenElement ?? null;

function aboutLength(seconds: number): string {
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds`;
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Figtree for annotation text, registered once per page however many players it has. */
const fontLoads = new Map<string, Promise<unknown>>();
function loadFonts(guide: Guide, media: GuideMedia): Promise<unknown> {
  const f = guide.fonts;
  if (!f || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
  const loads = (['regular', 'semibold'] as const).map(weight => {
    const url = media.url(f[weight]);
    let load = fontLoads.get(url);
    if (!load) {
      const face = new FontFace('Figtree', `url("${url}")`, { weight: weight === 'regular' ? '400' : '600' });
      document.fonts.add(face);
      load = face.load().catch(() => undefined);
      fontLoads.set(url, load);
    }
    return load;
  });
  /* text never waits more than a moment; it redraws in Figtree once the font arrives */
  return Promise.race([Promise.all(loads), new Promise(resolve => setTimeout(resolve, 2500))]);
}

/** A pausable timer. */
class Countdown {
  private started = 0;
  private left: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly total: number,
    private readonly done: () => void,
  ) {
    this.left = total;
  }
  start(): void {
    this.started = performance.now();
    this.timer = setTimeout(this.done, this.left);
  }
  pause(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.left -= performance.now() - this.started;
  }
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  /** milliseconds gone */
  elapsed(): number {
    return this.total - this.left + (this.timer !== null ? performance.now() - this.started : 0);
  }
}

export class Player implements PlayerHandle {
  private readonly root: ShadowRoot;
  private readonly el: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly box: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private guide: Guide | null = null;
  private media: GuideMedia | null = null;
  private driver: SegmentDriver | null = null;
  private shape: Shape = { segments: [], outro: false };
  private current: State = { kind: 'start' };
  private previous: State = { kind: 'start' };
  private poster: CanvasImageSource | null = null;
  private logo: CanvasImageSource | null = null;
  private background: CanvasImageSource | null = null;
  private readonly stills = new Map<number, CanvasImageSource>();
  private look: StepLook | null = null;
  /** bumped on every change of state, so work started for an old state can tell it is stale */
  private epoch = 0;
  private raf = 0;
  private progressRaf = 0;
  private countdown: Countdown | null = null;
  private abort: AbortController | null = null;
  private spinTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  /** whether the viewer has moved on from a step by themselves yet; until then a hint says how */
  private movedOn = false;
  private activated = false;
  private disposed = false;
  private readonly observers: Array<{ disconnect(): void }> = [];

  constructor(
    private readonly host: HTMLElement,
    source: string | Guide,
    private readonly options: MountOptions = {},
  ) {
    /* a host keeps its shadow root for good, so mounting again reuses it */
    this.root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${CSS}</style>${TEMPLATE}`;
    this.el = this.part('.wp');
    this.stage = this.part('.wp-stage');
    this.box = this.part('.wp-box');
    this.canvas = this.part('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.el.addEventListener('click', this.onClick);
    this.el.addEventListener('keydown', this.onKey);
    this.root.addEventListener('fullscreenchange', this.onFullscreen);
    document.addEventListener('fullscreenchange', this.onFullscreen);
    void this.load(source);
  }

  get state(): State {
    return this.current;
  }

  private part<T extends Element = HTMLElement>(selector: string): T {
    return this.root.querySelector(selector) as T;
  }

  // ----- loading ------------------------------------------------------------------------------------------------------

  private async load(source: string | Guide): Promise<void> {
    try {
      let guide: Guide;
      let base = document.baseURI;
      if (typeof source === 'string') {
        base = new URL(source, document.baseURI).href;
        const response = await fetch(base);
        if (!response.ok) throw new Error(`guide.json could not be fetched (${response.status}).`);
        guide = checkGuide(await response.json());
      } else guide = checkGuide(source);
      if (this.disposed) return;
      this.setup(guide, this.options.media ?? urlMedia(base));
    } catch (error) {
      if (!this.disposed) this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(message: string): void {
    const overlay = this.part('[data-part=error]');
    overlay.querySelector('p')!.textContent = message;
    overlay.hidden = false;
    this.part('[data-part=start]').hidden = true;
    this.el.dataset.state = 'error';
  }

  private setup(guide: Guide, media: GuideMedia): void {
    this.guide = guide;
    this.media = media;
    this.shape = { segments: guide.steps.map(s => !!s.segment), outro: !!guide.outro };
    const { accent, chrome } = guide.branding;
    this.el.dataset.chrome = chrome;
    this.el.style.setProperty('--wp-accent', accent);
    this.el.style.setProperty('--wp-on-accent', textOn(accent));
    this.el.style.setProperty('--wp-aspect', `${guide.size[0]} / ${guide.size[1]}`);
    this.el.setAttribute('aria-label', guide.title || 'Guide');
    this.driver = media.driver({ box: this.box, canvas: this.canvas });

    const start = this.part('[data-part=start]');
    start.querySelector('h2')!.textContent = guide.title || 'Untitled guide';
    const n = guide.steps.length;
    const total = guide.steps.reduce((t, s) => t + (s.segment?.duration ?? 0) + s.hold, 0) + (guide.outro?.duration ?? 0);
    start.querySelector('p')!.textContent = `${n} step${n === 1 ? '' : 's'} · ${aboutLength(total)}`;

    const controls = guide.playback.controls;
    const canFullscreen = typeof this.el.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
    this.part('.wp-counter').hidden = !controls.counter;
    this.part('.wp-progress').hidden = !controls.progress;
    this.part('[data-act=fullscreen]').hidden = !controls.fullscreen || !canFullscreen;
    this.part('[data-act=pause]').hidden = guide.playback.mode === 'guided';
    this.buildTicks();
    for (const link of [this.part<HTMLAnchorElement>('[data-part=cta]'), this.part<HTMLAnchorElement>('[data-part=end-cta]')]) {
      if (!guide.cta) continue;
      link.textContent = guide.cta.label;
      link.href = guide.cta.url;
      if (guide.cta.newTab) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    }
    this.part('[data-part=end] p').textContent = guide.cta ? 'Ready to try it yourself?' : 'Replay it, or go back to any step with ←.';

    const resize = new ResizeObserver(() => this.resize());
    resize.observe(this.stage);
    this.observers.push(resize);
    this.resize();
    this.updateChrome();

    if (this.options.lazy === false || typeof IntersectionObserver === 'undefined') void this.activate();
    else {
      const io = new IntersectionObserver(
        entries => {
          if (entries.some(e => e.isIntersecting)) {
            io.disconnect();
            void this.activate();
          }
        },
        { rootMargin: '300px' },
      );
      io.observe(this.host);
      this.observers.push(io);
    }
  }

  /** Loads what the first moments need, once the player is near the screen. */
  private async activate(): Promise<void> {
    const guide = this.guide!, media = this.media!;
    if (this.activated) return;
    this.activated = true;
    const first = guide.steps[0]!;
    if (first.segment) this.driver!.preload(first.segment.file);
    void this.loadStill(0).catch(() => undefined);
    const [poster, logo, background] = await Promise.allSettled([
      media.image(guide.poster),
      guide.logo ? media.image(guide.logo.image) : Promise.resolve(null),
      guide.background ? media.image(guide.background) : Promise.resolve(null),
      loadFonts(guide, media),
    ]);
    if (this.disposed) return;
    this.poster = poster.status === 'fulfilled' ? poster.value : null;
    this.logo = logo.status === 'fulfilled' ? logo.value : null;
    this.background = background.status === 'fulfilled' ? background.value : null;
    this.paint();
    if (this.options.autostart && this.current.kind === 'start') this.dispatch({ type: 'next' });
  }

  private loadStill(index: number): Promise<CanvasImageSource> {
    const have = this.stills.get(index);
    if (have) return Promise.resolve(have);
    return this.media!.image(this.guide!.steps[index]!.still).then(image => {
      this.stills.set(index, image);
      return image;
    });
  }

  // ----- state ---------------------------------------------------------------------------------------------------------

  next(): void {
    this.dispatch({ type: 'next' });
  }

  prev(): void {
    this.dispatch({ type: 'prev' });
  }

  goTo(index: number): void {
    this.dispatch({ type: 'goto', index });
  }

  private dispatch(event: Event): void {
    if (!this.guide || this.disposed) return;
    const next = transition(this.current, event, this.shape);
    if (next === this.current) return;
    if ((event.type === 'next' && this.current.kind === 'step') || event.type === 'prev' || event.type === 'goto') this.movedOn = true;
    this.previous = this.current;
    this.current = next;
    this.epoch++;
    cancelAnimationFrame(this.raf);
    this.countdown?.cancel();
    this.countdown = null;
    this.abort?.abort();
    this.abort = null;
    this.spin(false);
    switch (next.kind) {
      case 'start':
        this.look = null;
        this.paint();
        this.driver!.hide();
        break;
      case 'segment':
        void this.playSegment(next.index);
        break;
      case 'step':
        void this.showStep(next.index);
        break;
      case 'leaving':
        this.leave(next.index);
        break;
      case 'end':
        this.showEnd();
        break;
    }
    this.updateChrome();
  }

  private async playSegment(index: number): Promise<void> {
    const guide = this.guide!, driver = this.driver!;
    const epoch = this.epoch;
    const file = index < guide.steps.length ? guide.steps[index]!.segment!.file : guide.outro!.file;
    this.abort = new AbortController();
    /* the still this motion leads to, ready for the swap */
    if (index < guide.steps.length) void this.loadStill(index).catch(() => undefined);
    const played = driver.play(file, this.abort.signal);
    if (this.paused) driver.pause();
    const after = guide.steps[index + 1]?.segment;
    if (after) driver.preload(after.file);
    this.trackProgress();
    await played;
    if (epoch === this.epoch) this.dispatch({ type: 'segmentEnded' });
  }

  private async showStep(index: number): Promise<void> {
    const guide = this.guide!;
    const epoch = this.epoch;
    const step = guide.steps[index]!;
    if (!this.stills.has(index)) {
      this.spinTimer = setTimeout(() => this.spin(true), 200);
      await this.loadStill(index).catch(() => undefined);
      if (epoch !== this.epoch) return;
      this.spin(false);
    }
    /* the first frame of the entrance goes on the canvas before the motion leaves the screen, so the swap has no seam */
    const reduced = reducedMotion();
    const length = introLength(step);
    const t0 = performance.now();
    const frame = (now: number) => {
      if (epoch !== this.epoch) return;
      const t = (now - t0) / 1000;
      const intro = stepIntro(step, t);
      this.look = reduced ? { zoom: step.zoom ? 1 : 0, reveal: intro.reveal } : intro;
      this.paint();
      if (t < length) this.raf = requestAnimationFrame(frame);
    };
    frame(t0);
    this.driver!.hide();
    this.announce(index);
    if (guide.playback.mode !== 'guided') {
      this.countdown = new Countdown(step.hold * 1000, () => {
        if (epoch === this.epoch) this.dispatch({ type: 'next' });
      });
      if (!this.paused) this.countdown.start();
      this.trackProgress();
    }
    const following = guide.steps[index + 1];
    if (following) {
      if (following.segment) this.driver!.preload(following.segment.file);
      void this.loadStill(index + 1).catch(() => undefined);
    } else if (guide.outro) this.driver!.preload(guide.outro.file);
  }

  private leave(index: number): void {
    const step = this.guide!.steps[index]!;
    const epoch = this.epoch;
    const length = reducedMotion() ? 0 : outroLength(step);
    const from = this.look ?? { zoom: 0, reveal: [] };
    const t0 = performance.now();
    const frame = (now: number) => {
      if (epoch !== this.epoch) return;
      const t = (now - t0) / 1000;
      const out = stepOutro(step, t);
      this.look = { zoom: Math.min(from.zoom, out.zoom), reveal: out.reveal.map((a, g) => Math.min(a, from.reveal[g] ?? 0)) };
      this.paint();
      if (t < length) this.raf = requestAnimationFrame(frame);
      else this.dispatch({ type: 'leaveDone' });
    };
    if (length === 0) queueMicrotask(() => epoch === this.epoch && this.dispatch({ type: 'leaveDone' }));
    else frame(t0);
  }

  private showEnd(): void {
    const n = this.guide!.steps.length;
    /* after the outro its last frame stays on screen; otherwise the last step, without its annotations */
    if (this.previous.kind !== 'segment') {
      this.look = null;
      void this.loadStill(n - 1)
        .then(() => {
          if (this.current.kind !== 'end') return;
          this.paint();
          this.driver!.hide();
        })
        .catch(() => undefined);
    }
    this.announceText(`End of the guide.${this.guide!.cta ? ` ${this.guide!.cta.label}.` : ''}`);
  }

  // ----- drawing -------------------------------------------------------------------------------------------------------

  private resize(): void {
    const guide = this.guide;
    if (!guide) return;
    const sw = this.stage.clientWidth, sh = this.stage.clientHeight;
    if (!sw || !sh) return;
    const aspect = guide.size[0] / guide.size[1];
    const w = Math.min(sw, sh * aspect), h = w / aspect;
    this.box.style.width = `${w}px`;
    this.box.style.height = `${h}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    /* never more than about 4K worth of pixels */
    const cap = Math.min(1, Math.sqrt((3840 * 2160) / (w * dpr * h * dpr)));
    const pw = Math.max(1, Math.round(w * dpr * cap)), ph = Math.max(1, Math.round(h * dpr * cap));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.paint();
    }
  }

  /** Draws what the canvas should show now: the poster before the start, or a step's still with its framing and annotations. */
  private paint(): void {
    const guide = this.guide;
    if (!guide) return;
    const { width, height } = this.canvas;
    const state = this.current;
    const index = state.kind === 'step' || state.kind === 'leaving' ? state.index : state.kind === 'end' ? guide.steps.length - 1 : -1;
    const still = index >= 0 ? this.stills.get(index) : undefined;
    if (state.kind === 'start' || (state.kind === 'segment' && !this.stills.size)) {
      this.ctx.clearRect(0, 0, width, height);
      if (this.poster) this.ctx.drawImage(this.poster, 0, 0, width, height);
      return;
    }
    if (!still) return;
    const step = guide.steps[index]!;
    const look = state.kind === 'end' ? null : this.look;
    composeScene(this.ctx, width, height, {
      frame: still,
      sourceSize: guide.sourceSize,
      framing: guide.frame,
      backgroundImage: this.background,
      view: step.zoom && look ? viewRect(step.zoom.rect, look.zoom) : undefined,
      annotations: look ? step.annotations : [],
      reveal: look?.reveal,
      logo: this.logo && guide.logo ? { image: this.logo, settings: guide.logo } : null,
    });
  }

  private spin(on: boolean): void {
    if (this.spinTimer !== null) clearTimeout(this.spinTimer);
    this.spinTimer = null;
    this.part('.wp-spin').hidden = !on;
  }

  // ----- chrome --------------------------------------------------------------------------------------------------------

  private buildTicks(): void {
    const guide = this.guide!;
    const bar = this.part('.wp-progress');
    const n = guide.steps.length;
    const at = this.tickPositions();
    guide.steps.forEach((step, i) => {
      const tick = document.createElement('button');
      tick.type = 'button';
      tick.className = 'wp-tick';
      tick.dataset.step = String(i);
      tick.style.left = `${at[i]! * 100}%`;
      tick.setAttribute('aria-label', `Go to step ${i + 1} of ${n}: ${step.title || `Step ${i + 1}`}`);
      bar.append(tick);
    });
  }

  /** Where each step sits on the progress bar, 0 to 1: evenly spaced, or by time in video mode. */
  private tickPositions(): number[] {
    const guide = this.guide!;
    const n = guide.steps.length;
    if (guide.playback.mode !== 'video') return guide.steps.map((_, i) => (i + 1) / n);
    const times = this.timeline();
    return times.steps.map(s => s.at / times.total);
  }

  /** Video mode: when each step's motion starts and its still appears, in seconds of the whole guide. */
  private timeline(): { steps: Array<{ start: number; at: number; hold: number }>; total: number } {
    let t = 0;
    const steps = this.guide!.steps.map(s => {
      const start = t;
      t += s.segment?.duration ?? 0;
      const at = t;
      t += s.hold;
      return { start, at, hold: s.hold };
    });
    return { steps, total: t + (this.guide!.outro?.duration ?? 0) };
  }

  /** Keeps a video-mode progress bar moving while something plays. */
  private trackProgress(): void {
    if (this.guide!.playback.mode !== 'video') return;
    cancelAnimationFrame(this.progressRaf);
    const tick = () => {
      this.updateFill();
      if (this.current.kind === 'segment' || this.current.kind === 'step') this.progressRaf = requestAnimationFrame(tick);
    };
    this.progressRaf = requestAnimationFrame(tick);
  }

  private updateFill(): void {
    const guide = this.guide!;
    const n = guide.steps.length;
    const s = this.current;
    let fill: number;
    if (guide.playback.mode === 'video') {
      const times = this.timeline();
      const segLength = s.kind === 'segment' ? (s.index < n ? guide.steps[s.index]!.segment!.duration : guide.outro!.duration) : 0;
      const t =
        s.kind === 'start' ? 0
        : s.kind === 'end' ? times.total
        : s.kind === 'segment' ? (s.index < n ? times.steps[s.index]!.start : times.total - segLength) + this.driver!.progress() * segLength
        : s.kind === 'step' ? times.steps[s.index]!.at + Math.min(times.steps[s.index]!.hold, (this.countdown?.elapsed() ?? 0) / 1000)
        : times.steps[s.index]!.at + times.steps[s.index]!.hold;
      fill = t / times.total;
    } else fill = (stepNumber(s, n) + 1) / n;
    this.part('.wp-fill').style.width = `${Math.min(1, Math.max(0, fill)) * 100}%`;
  }

  private updateChrome(): void {
    const guide = this.guide;
    if (!guide) return;
    const n = guide.steps.length;
    const s = this.current;
    const number = stepNumber(s, n);
    const waiting = guide.playback.mode === 'guided' && s.kind === 'step';
    /* read before anything changes: a browser drops focus from a control the moment it is disabled or hidden */
    const focused = this.root.activeElement as HTMLElement | null;
    this.el.dataset.state = s.kind === 'start' || s.kind === 'end' ? s.kind : `${s.kind}-${s.index + 1}`;
    this.part('[data-part=start]').hidden = s.kind !== 'start';
    this.part('[data-part=end]').hidden = s.kind !== 'end';
    this.part('[data-part=end-cta]').hidden = !guide.cta;
    this.stage.toggleAttribute('data-wait', waiting);

    const step = number >= 0 && number < n ? guide.steps[number]! : null;
    const intro = touch() ? 'Press Start to begin.' : 'Press Start, or use → to move through the steps.';
    this.part('.wp-caption').textContent = s.kind === 'start' ? intro : s.kind === 'end' ? 'Finished' : `${number + 1}. ${step!.title || `Step ${number + 1}`}`;
    this.part('.wp-counter').textContent = `${s.kind === 'start' ? 0 : Math.min(n, number + 1)} / ${n}`;
    this.canvas.setAttribute('aria-label', step ? `Step ${number + 1} of ${n}: ${step.title || `Step ${number + 1}`}` : guide.title || 'Guide');
    this.updateFill();
    for (const tick of this.root.querySelectorAll<HTMLElement>('.wp-tick')) tick.classList.toggle('done', Number(tick.dataset.step) <= Math.min(number, n - 1));

    const hint = this.part('.wp-hint');
    hint.hidden = !waiting || this.movedOn;
    hint.textContent = `${touch() ? 'Tap' : 'Click'} anywhere to ${number === n - 1 ? 'finish' : 'continue'}`;

    const prev = this.part<HTMLButtonElement>('[data-act=prev]');
    prev.disabled = s.kind === 'start' || (number <= 0 && s.kind !== 'end');
    const next = this.part<HTMLButtonElement>('[data-act=next]');
    next.disabled = s.kind === 'end';
    next.querySelector('span')!.textContent = s.kind === 'start' ? 'Start' : number === n - 1 && s.kind !== 'segment' ? 'Finish' : 'Next';
    const pause = this.part('[data-act=pause]');
    pause.setAttribute('aria-label', this.paused ? 'Play' : 'Pause');
    pause.innerHTML = icon(this.paused ? 'play' : 'pause');

    const cta = guide.cta;
    const from = cta && cta.showAt !== 'end' ? guide.steps.findIndex(x => x.id === cta.showAt) : -1;
    this.part('[data-part=cta]').hidden = !cta || from < 0 || s.kind === 'start' || number < from;

    /* the focused control can disappear (Start) or switch off (Next at the end): hand focus to the one that carries on */
    if (focused && focused !== this.el && ((focused as HTMLButtonElement).disabled || focused.closest('[hidden]'))) {
      (s.kind === 'end' ? this.part('[data-act=replay]') : next).focus();
    }
  }

  private announce(index: number): void {
    const guide = this.guide!;
    const step = guide.steps[index]!;
    const callouts = step.annotations.flatMap(a => (a.type === 'callout' && a.text.trim() ? [a.text.trim()] : []));
    const words = [`Step ${index + 1} of ${guide.steps.length}: ${step.title || `Step ${index + 1}`}.`, step.body.trim(), ...callouts].filter(Boolean);
    this.announceText(words.join(' '));
  }

  private announceText(text: string): void {
    const live = this.part('.wp-sr');
    live.textContent = '';
    /* a fresh node each time, so the same words are read out again when they recur */
    requestAnimationFrame(() => {
      live.textContent = text;
    });
  }

  private togglePause(): void {
    this.paused = !this.paused;
    /* a segment that starts while paused is paused as it starts (playSegment), so only the playing one needs telling here */
    if (this.paused) {
      if (this.current.kind === 'segment') this.driver?.pause();
      this.countdown?.pause();
    } else {
      this.driver?.resume();
      this.countdown?.start();
      this.trackProgress();
    }
    this.updateChrome();
  }

  private toggleFullscreen(): void {
    if (fullscreenEl(this.root) === this.el || document.fullscreenElement === this.host) void document.exitFullscreen().catch(() => undefined);
    else void this.el.requestFullscreen().catch(() => undefined);
  }

  // ----- input ---------------------------------------------------------------------------------------------------------

  private readonly onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    const tick = target.closest<HTMLElement>('.wp-tick');
    if (tick) this.goTo(Number(tick.dataset.step));
    else if (act === 'start' || act === 'next') this.next();
    else if (act === 'prev') this.prev();
    else if (act === 'replay') this.dispatch({ type: 'restart' });
    else if (act === 'pause') this.togglePause();
    else if (act === 'fullscreen') this.toggleFullscreen();
    else if (this.stage.hasAttribute('data-wait') && this.stage.contains(target) && !target.closest('a, button')) this.next();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const onControl = !!(e.target as HTMLElement).closest?.('button, a');
    if (e.key === 'ArrowRight') this.next();
    else if (e.key === 'ArrowLeft') this.prev();
    else if (e.key === ' ' && !onControl) {
      if (this.guide?.playback.mode === 'guided' || this.current.kind === 'start' || this.current.kind === 'end') this.next();
      else this.togglePause();
    } else return;
    e.preventDefault();
  };

  private readonly onFullscreen = (): void => {
    const on = fullscreenEl(this.root) === this.el;
    const button = this.part('[data-act=fullscreen]');
    button.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
    button.innerHTML = icon(on ? 'exit' : 'enter');
    this.resize();
  };

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch++;
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.progressRaf);
    this.countdown?.cancel();
    this.abort?.abort();
    this.spin(false);
    for (const o of this.observers) o.disconnect();
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    this.driver?.dispose();
    this.root.innerHTML = '';
  }
}

/** Mounts a player in an element, from the address of a guide.json or the guide itself. */
export function mount(host: HTMLElement, source: string | Guide, options?: MountOptions): PlayerHandle {
  return new Player(host, source, options);
}
