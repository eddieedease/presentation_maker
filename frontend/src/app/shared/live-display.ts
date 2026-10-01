import { Injectable, signal } from '@angular/core';
import { ElementResult } from '../core/models/live.model';

/**
 * What the slides on the presenter's screen should show right now.
 *
 * Slide elements are rendered by the same component in the editor, the publish
 * site and the live player. Only the live player ever switches this on, so the
 * other two keep showing a poll as an empty set of options rather than
 * inventing numbers.
 */
@Injectable({ providedIn: 'root' })
export class LiveDisplay {
  readonly active = signal(false);
  readonly results = signal<Record<string, ElementResult>>({});
  readonly closed = signal<readonly string[]>([]);
  /** Lets the presenter hold back open answers until they have looked at them. */
  readonly showAnswers = signal(true);

  reset(): void {
    this.active.set(false);
    this.results.set({});
    this.closed.set([]);
    this.showAnswers.set(true);
  }
}
