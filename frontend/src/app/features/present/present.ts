import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiMessage } from '../../core/api-error';
import { PublishedPresentation } from '../../core/models/project.model';
import { ProjectService } from '../../core/services/project.service';
import { RevealDeck } from '../../shared/reveal-deck';

/**
 * The publish site: a read-only, full-screen player for any published deck.
 * No authentication — holding the link is the permission.
 */
@Component({
  selector: 'app-present',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RevealDeck, RouterLink],
  templateUrl: './present.html',
})
export class Present {
  /** Bound from the :slug route parameter. */
  readonly slug = input.required<string>();

  private readonly projects = inject(ProjectService);
  private readonly titleService = inject(Title);

  protected readonly presentation = signal<PublishedPresentation | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly chromeVisible = signal(true);

  constructor() {
    effect(() => {
      const slug = this.slug();
      if (slug) {
        void this.fetch(slug);
      }
    });
  }

  private async fetch(slug: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { presentation } = await firstValueFrom(this.projects.getPublished(slug));
      this.presentation.set(presentation);
      this.titleService.setTitle(`${presentation.title} — Presentation Maker`);
      // The overlay is a courtesy on arrival; it should not sit over the deck.
      setTimeout(() => this.chromeVisible.set(false), 4000);
    } catch (error) {
      this.error.set(apiMessage(error, 'This presentation is not available.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected enterFullscreen(): void {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
}
