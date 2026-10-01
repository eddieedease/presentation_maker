import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiMessage } from '../../core/api-error';
import { Deck, SlideElement, THEME_PALETTE, isInteractive } from '../../core/models/deck.model';
import { LiveSession } from '../../core/models/live.model';
import { LiveService } from '../../core/services/live.service';
import { ProjectService } from '../../core/services/project.service';
import { LiveDisplay } from '../../shared/live-display';
import { QrCode } from '../../shared/qr-code';
import { RevealDeck } from '../../shared/reveal-deck';

/**
 * Presents a deck to a live audience.
 *
 * It plays the saved draft, tells the server which slide is showing so phones
 * can follow, and polls for results that are drawn on the slides themselves.
 * The speaker-notes window loads this same page with `?receiver`; that copy
 * only shows slides, so it never starts a session or reports a slide of its own.
 */
@Component({
  selector: 'app-live-presenter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDeck, QrCode, RouterLink],
  templateUrl: './live-presenter.html',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class LivePresenter {
  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  private readonly projects = inject(ProjectService);
  private readonly live = inject(LiveService);
  private readonly titleService = inject(Title);
  protected readonly display = inject(LiveDisplay);

  protected readonly passive = /receiver/i.test(window.location.search);

  protected readonly deck = signal<Deck | null>(null);
  protected readonly title = signal('');
  protected readonly session = signal<LiveSession | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly connected = signal(0);
  protected readonly index = signal(0);
  /** Where to open: a refresh mid-talk resumes on the slide the audience is on. */
  protected readonly startIndex = signal(0);

  protected readonly joinOpen = signal(!this.passive);
  protected readonly panelOpen = signal(false);
  /** Two-step buttons: the first click arms them, the second does the thing. */
  protected readonly armed = signal<string | null>(null);

  protected readonly ended = computed(() => this.session()?.status === 'ended');
  protected readonly joinUrl = computed(() => this.urlFor(this.session()?.code));
  protected readonly joinHost = computed(() => new URL('join', document.baseURI).href.replace(/^https?:\/\//, ''));

  /** The polls and questions on the slide that is showing, with their live numbers. */
  protected readonly interactions = computed(() => {
    const slide = this.deck()?.slides[this.index()];
    const results = this.display.results();
    const closed = this.display.closed();

    return (slide?.elements ?? [])
      .filter(isInteractive)
      .map((element: SlideElement) => ({
        element,
        result: results[element.id],
        closed: closed.includes(element.id),
      }));
  });

  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private slideTimer: ReturnType<typeof setTimeout> | undefined;
  private fetching = false;

  constructor() {
    effect(() => {
      const id = Number(this.id());
      if (Number.isFinite(id)) {
        void this.load(id);
      }
    });

    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.pollTimer);
      clearTimeout(this.slideTimer);
      this.display.reset();
    });
  }

  private async load(id: number): Promise<void> {
    try {
      const { project } = await firstValueFrom(this.projects.get(id));
      // Paint the page in the theme's colour so there is no flash of the wrong
      // background before reveal.js takes over the body.
      document.body.style.background = THEME_PALETTE[project.deck.theme].background;
      this.titleService.setTitle(`${project.title} — live`);
      this.title.set(project.title);

      if (!this.passive) {
        // Started before the deck is shown, so the first slide report has a session to go to.
        const session = await this.live.start(id);
        this.session.set(session);
        this.startIndex.set(Math.max(0, project.deck.slides.findIndex((slide) => slide.id === session.slideId)));
        this.display.active.set(true);
        this.beginPolling();
      }

      this.deck.set(project.deck);
    } catch (error) {
      this.error.set(apiMessage(error, 'Could not start a live session for this deck.'));
    }
  }

  private beginPolling(): void {
    clearInterval(this.pollTimer);
    const seconds = Math.max(1, this.session()?.pollSeconds ?? 2);
    this.pollTimer = setInterval(() => void this.refresh(), seconds * 1000);
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    const code = this.session()?.code;
    // One request at a time: a slow server must not be handed a growing queue.
    if (code === undefined || this.fetching || this.ended()) {
      return;
    }

    this.fetching = true;
    try {
      const data = await this.live.results(code);
      this.display.results.set(data.results);
      this.display.closed.set(data.closed);
      this.connected.set(data.connected);
    } catch {
      // A missed poll is harmless; the next one catches up.
    } finally {
      this.fetching = false;
    }
  }

  protected onSlide(index: number): void {
    this.index.set(index);
    if (this.passive) {
      return;
    }

    // Debounced: paging quickly through slides should send one update, not ten.
    clearTimeout(this.slideTimer);
    this.slideTimer = setTimeout(() => void this.pushSlide(), 150);
  }

  private async pushSlide(): Promise<void> {
    const code = this.session()?.code;
    const slide = this.deck()?.slides[this.index()];
    if (code === undefined || slide === undefined || this.ended()) {
      return;
    }

    try {
      await this.live.setSlide(code, slide.id);
    } catch {
      // The audience stays on the previous slide until the next successful update.
    }
  }

  protected async toggleClosed(elementId: string, closed: boolean): Promise<void> {
    const code = this.session()?.code;
    if (code === undefined) {
      return;
    }

    await this.live.setClosed(code, elementId, closed);
    await this.refresh();
  }

  protected async reset(elementId: string): Promise<void> {
    const code = this.session()?.code;
    if (code === undefined) {
      return;
    }

    if (this.armed() !== `reset:${elementId}`) {
      this.arm(`reset:${elementId}`);
      return;
    }

    this.armed.set(null);
    await this.live.resetResponses(code, elementId);
    await this.refresh();
  }

  protected async hideAnswer(answerId: number, hidden: boolean): Promise<void> {
    const code = this.session()?.code;
    if (code === undefined) {
      return;
    }

    await this.live.hideAnswer(code, answerId, hidden);
    await this.refresh();
  }

  /** Arms a destructive button for a few seconds, then disarms it again. */
  private arm(key: string): void {
    this.armed.set(key);
    setTimeout(() => this.armed() === key && this.armed.set(null), 4000);
  }

  protected async endSession(): Promise<void> {
    const session = this.session();
    if (session === null) {
      return;
    }

    if (this.armed() !== 'end') {
      this.arm('end');
      return;
    }

    this.armed.set(null);
    await this.live.end(session.code);
    this.session.set({ ...session, status: 'ended' });
    clearInterval(this.pollTimer);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.ctrlKey || event.metaKey || event.altKey || (target instanceof HTMLElement && target.matches('input, textarea'))) {
      return;
    }

    // None of these clash with reveal.js, which keeps H J K L and A for itself.
    switch (event.key.toLowerCase()) {
      case 'q':
        this.joinOpen.update((open) => !open);
        break;
      case 'c':
        this.panelOpen.update((open) => !open);
        break;
      case 'v':
        this.display.showAnswers.update((show) => !show);
        break;
    }
  }

  private urlFor(code: string | undefined): string {
    return code === undefined ? '' : new URL(`join/${code}`, document.baseURI).href;
  }
}
