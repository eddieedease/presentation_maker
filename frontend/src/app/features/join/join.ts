import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { apiMessage } from '../../core/api-error';
import { Deck, SlideElement, THEME_PALETTE, isInteractive } from '../../core/models/deck.model';
import { AudienceState, LiveStatus, Submission } from '../../core/models/live.model';
import { LiveService } from '../../core/services/live.service';
import { SlideThumbnail } from '../editor/slide-thumbnail';

/** The most answers one person can give to one open question. Mirrors the server. */
const MAX_ANSWERS = 3;
const MAX_ANSWER_LENGTH = 280;
/** Characters a join code can contain, matching the server's alphabet. */
const CODE_PATTERN = /[^A-HJ-NP-Z2-9]/g;

/**
 * What the audience sees on their phone: the current slide, and any poll or
 * question on it. No account, no install — the code is the whole login.
 *
 * Phones poll a small state endpoint rather than holding a connection open,
 * because the PHP back end runs on shared hosting that cannot.
 */
@Component({
  selector: 'app-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SlideThumbnail],
  templateUrl: './join.html',
  host: {
    '(window:resize)': 'onResize()',
    '(document:visibilitychange)': 'onVisibility()',
  },
})
export class Join {
  /** From /join/:code. Absent on the bare /join entry screen. */
  readonly code = input<string>();

  private readonly live = inject(LiveService);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);

  protected readonly maxAnswers = MAX_ANSWERS;
  protected readonly maxLength = MAX_ANSWER_LENGTH;

  protected readonly typed = signal('');
  protected readonly connecting = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected readonly title = signal('');
  protected readonly deck = signal<Deck | null>(null);
  protected readonly state = signal<AudienceState | null>(null);
  protected readonly status = signal<LiveStatus>('live');

  /** Poll choices not yet sent, and answers being typed, per element. */
  protected readonly selection = signal<Record<string, number[]>>({});
  protected readonly drafts = signal<Record<string, string>>({});
  protected readonly sending = signal<string | null>(null);
  protected readonly notice = signal<Record<string, string>>({});

  protected readonly viewport = signal(this.width());

  protected readonly slideIndex = computed(() => {
    const deck = this.deck();
    const state = this.state();

    return deck === null || state === null ? -1 : deck.slides.findIndex((slide) => slide.id === state.slideId);
  });

  protected readonly slide = computed(() => this.deck()?.slides[this.slideIndex()] ?? null);

  protected readonly interactions = computed(() => (this.slide()?.elements ?? []).filter(isInteractive));

  /** Thumbnails are scaled from px, so the slide is sized to the phone it is on. */
  protected readonly slideWidth = computed(() => Math.min(this.viewport() - 32, 720));

  protected readonly palette = computed(() => THEME_PALETTE[this.deck()?.theme ?? 'night']);

  private joined: string | null = null;
  private rev = 0;
  private pollSeconds = 2;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const code = this.code();
      untracked(() => {
        this.stop();
        if (code !== undefined && code !== '') {
          void this.connect(code);
        }
      });
    });

    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected onResize(): void {
    this.viewport.set(this.width());
  }

  private width(): number {
    return typeof window === 'undefined' ? 360 : window.innerWidth;
  }

  // ---- entering a code ---------------------------------------------------

  protected onCodeInput(value: string): void {
    this.typed.set(value.toUpperCase().replace(CODE_PATTERN, '').slice(0, 6));
    this.problem.set(null);
  }

  protected submitCode(): void {
    const code = this.typed();
    if (code.length === 6) {
      void this.router.navigate(['/join', code]);
    }
  }

  protected leave(): void {
    void this.router.navigate(['/join']);
  }

  // ---- connecting and following -----------------------------------------

  private async connect(code: string): Promise<void> {
    this.connecting.set(true);
    this.problem.set(null);

    try {
      const joined = await this.live.join(code.toUpperCase());
      this.joined = joined.session.code;
      this.rev = joined.state.rev;
      this.pollSeconds = Math.max(1, joined.session.pollSeconds);
      this.title.set(joined.session.title);
      this.titleService.setTitle(`${joined.session.title} — live`);
      this.deck.set(joined.deck);
      this.adopt(joined.state);
      this.schedule();
    } catch (error) {
      this.typed.set(code.toUpperCase().replace(CODE_PATTERN, '').slice(0, 6));
      this.problem.set(apiMessage(error, 'Could not join. Check the code and try again.'));
    } finally {
      this.connecting.set(false);
    }
  }

  /** Takes a new state from the server, dropping drafts for a slide we have left. */
  private adopt(state: AudienceState): void {
    const previous = this.state()?.slideId;
    this.state.set(state);
    this.status.set(state.status);

    // Show what this phone already sent, so a reload does not look like starting over.
    this.selection.update((current) => {
      const next = { ...current };
      for (const [id, submission] of Object.entries(state.mine)) {
        if (submission.choices !== undefined && next[id] === undefined) {
          next[id] = submission.choices;
        }
      }

      return next;
    });

    if (previous !== undefined && previous !== state.slideId) {
      this.notice.set({});
    }
  }

  private schedule(delayMs?: number): void {
    clearTimeout(this.timer);
    if (this.joined === null || this.status() === 'ended') {
      return;
    }

    // A phone in a pocket has no use for fresh results; ease off until it wakes.
    const base = delayMs ?? this.pollSeconds * 1000;
    this.timer = setTimeout(() => void this.poll(), document.hidden ? Math.max(base, 8000) : base);
  }

  private async poll(): Promise<void> {
    const code = this.joined;
    if (code === null) {
      return;
    }

    let delay = this.pollSeconds * 1000;
    try {
      const next = await this.live.state(code, this.state()?.version ?? 0);
      this.failures = 0;

      if (next !== null) {
        if (next.rev !== this.rev) {
          // The presenter restarted with an edited deck: fetch the new one.
          await this.connect(code);
          return;
        }

        this.adopt(next);
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.status.set('ended');
        return;
      }

      // Back off while the connection or the server is struggling.
      this.failures++;
      delay = Math.min(15000, delay * 2 ** this.failures);
    }

    this.schedule(delay);
  }

  protected onVisibility(): void {
    if (!document.hidden && this.joined !== null && this.status() === 'live') {
      clearTimeout(this.timer);
      void this.poll();
    }
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.joined = null;
    this.deck.set(null);
    this.state.set(null);
    this.status.set('live');
    this.selection.set({});
    this.drafts.set({});
    this.notice.set({});
  }

  // ---- answering ---------------------------------------------------------

  protected isClosed(element: SlideElement): boolean {
    return this.status() === 'ended' || (this.state()?.closed.includes(element.id) ?? false);
  }

  protected options(element: SlideElement): string[] {
    return element.poll.options.filter((option) => option.trim() !== '');
  }

  protected mine(element: SlideElement): Submission {
    return this.state()?.mine[element.id] ?? {};
  }

  protected isChosen(element: SlideElement, index: number): boolean {
    return (this.selection()[element.id] ?? []).includes(index);
  }

  protected choose(element: SlideElement, index: number): void {
    if (this.isClosed(element)) {
      return;
    }

    this.selection.update((current) => {
      const chosen = current[element.id] ?? [];
      const next = element.poll.multiple
        ? chosen.includes(index)
          ? chosen.filter((i) => i !== index)
          : [...chosen, index]
        : [index];

      return { ...current, [element.id]: next };
    });
  }

  /** True when the picked options differ from what the server already has. */
  protected isDirty(element: SlideElement): boolean {
    const picked = [...(this.selection()[element.id] ?? [])].sort().join(',');
    const sent = [...(this.mine(element).choices ?? [])].sort().join(',');

    return picked !== '' && picked !== sent;
  }

  protected draft(element: SlideElement): string {
    return this.drafts()[element.id] ?? '';
  }

  protected setDraft(element: SlideElement, value: string): void {
    this.drafts.update((current) => ({ ...current, [element.id]: value }));
  }

  protected answersLeft(element: SlideElement): number {
    return MAX_ANSWERS - (this.mine(element).answers?.length ?? 0);
  }

  protected async sendVote(element: SlideElement): Promise<void> {
    const choices = this.selection()[element.id] ?? [];
    await this.send(element, { choices }, () => this.remember(element.id, { choices }));
  }

  protected async sendAnswer(element: SlideElement): Promise<void> {
    const text = this.draft(element).trim();
    if (text === '') {
      return;
    }

    await this.send(element, { text }, () => {
      this.remember(element.id, { answers: [...(this.mine(element).answers ?? []), text] });
      this.setDraft(element, '');
    });
  }

  private async send(
    element: SlideElement,
    answer: { choices: number[] } | { text: string },
    onSuccess: () => void,
  ): Promise<void> {
    const code = this.joined;
    if (code === null || this.sending() !== null) {
      return;
    }

    this.sending.set(element.id);
    this.setNotice(element.id, '');
    try {
      await this.live.respond(code, element.id, answer);
      onSuccess();
      this.setNotice(element.id, element.type === 'poll' ? 'Vote sent. You can change it while voting is open.' : 'Answer sent.');
    } catch (error) {
      this.setNotice(element.id, apiMessage(error, 'That did not go through. Try again.'));
      // The presenter may have moved on or closed it; find out straight away.
      clearTimeout(this.timer);
      void this.poll();
    } finally {
      this.sending.set(null);
    }
  }

  private remember(elementId: string, submission: Submission): void {
    this.state.update((state) => (state === null ? state : { ...state, mine: { ...state.mine, [elementId]: submission } }));
  }

  private setNotice(elementId: string, message: string): void {
    this.notice.update((current) => ({ ...current, [elementId]: message }));
  }
}
