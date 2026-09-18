import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiMessage } from '../../core/api-error';
import { Deck, THEME_PALETTE } from '../../core/models/deck.model';
import { ProjectService } from '../../core/services/project.service';
import { RevealDeck } from '../../shared/reveal-deck';

/**
 * Full-screen preview of a deck you own, opened in its own tab so it behaves
 * like a real presentation: fullscreen, the reveal.js speaker view on S, and
 * deep links to a slide all work without the editor underneath.
 *
 * It shows the saved draft, which is not necessarily what is published.
 */
@Component({
  selector: 'app-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDeck, RouterLink],
  template: `
    <div class="h-screen w-screen overflow-hidden" [class.bg-ink-950]="deck() === null">
      @if (error(); as message) {
        <div class="grid h-full place-content-center px-6 text-center">
          <h1 class="text-xl font-semibold text-white">Cannot preview this deck</h1>
          <p class="mx-auto mt-2 max-w-sm text-sm text-slate-400">{{ message }}</p>
          <a routerLink="/workspace" class="btn-primary mx-auto mt-6">Back to workspace</a>
        </div>
      } @else if (deck(); as current) {
        <app-reveal-deck [deck]="current" [enableHash]="true" />

        <div
          class="pointer-events-none fixed top-0 right-0 left-0 z-20 flex items-start justify-between gap-4 bg-gradient-to-b from-black/60 to-transparent px-5 py-3 transition-opacity duration-700"
          [class.opacity-0]="!chromeVisible()"
        >
          <div>
            <p class="text-sm font-semibold text-white">{{ title() }}</p>
            <p class="text-xs text-slate-400">Preview of your saved draft · press S for speaker notes</p>
          </div>
          <button type="button" class="btn-ghost pointer-events-auto px-3 py-1.5 text-xs" (click)="close()">
            Close tab
          </button>
        </div>
        <div class="fixed top-0 right-0 left-0 z-10 h-16" (mouseenter)="chromeVisible.set(true)" (mouseleave)="chromeVisible.set(false)"></div>
      } @else {
        <div class="grid h-full place-content-center text-center">
          <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-indigo-400"></div>
          <p class="mt-4 text-sm text-slate-500">Loading your deck…</p>
        </div>
      }
    </div>
  `,
})
export class Preview {
  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  private readonly projects = inject(ProjectService);
  private readonly titleService = inject(Title);

  protected readonly deck = signal<Deck | null>(null);
  protected readonly title = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly chromeVisible = signal(true);

  constructor() {
    effect(() => {
      const id = Number(this.id());
      if (Number.isFinite(id)) {
        void this.load(id);
      }
    });
  }

  private async load(id: number): Promise<void> {
    try {
      const { project } = await firstValueFrom(this.projects.get(id));
      this.title.set(project.title);
      this.deck.set(project.deck);
      this.titleService.setTitle(`${project.title} — preview`);

      // Paint the page in the theme's colour so there is no flash of the wrong
      // background before reveal.js takes over the body.
      document.body.style.background = THEME_PALETTE[project.deck.theme].background;
      setTimeout(() => this.chromeVisible.set(false), 3500);
    } catch (error) {
      this.error.set(apiMessage(error, 'That presentation could not be opened.'));
    }
  }

  protected close(): void {
    window.close();
  }
}
