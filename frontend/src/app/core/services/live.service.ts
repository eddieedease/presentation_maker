import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { AudienceJoin, AudienceState, LiveResults, LiveSession } from '../models/live.model';

const PARTICIPANT_KEY = 'pm_participant';

/** Both halves of the live API: the presenter's controls and the audience's join and respond. */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /**
   * An anonymous handle for this browser, so reloading does not look like a
   * second person. It identifies a browser, never a person, and it is not a
   * defence against someone determined to vote twice.
   */
  readonly participant = this.loadParticipant();

  private loadParticipant(): string {
    const fresh = (): string => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));

      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    };

    try {
      const saved = localStorage.getItem(PARTICIPANT_KEY);
      if (saved !== null && /^[a-f0-9]{32}$/.test(saved)) {
        return saved;
      }

      const created = fresh();
      localStorage.setItem(PARTICIPANT_KEY, created);

      return created;
    } catch {
      // Storage can be blocked (private mode). A per-page handle still works.
      return fresh();
    }
  }

  // ---- presenter ---------------------------------------------------------

  async start(projectId: number): Promise<LiveSession> {
    const { session } = await firstValueFrom(
      this.http.post<{ session: LiveSession }>(`${this.baseUrl}/projects/${projectId}/live`, {}),
    );

    return session;
  }

  results(code: string): Promise<LiveResults> {
    return firstValueFrom(this.http.get<LiveResults>(`${this.baseUrl}/live/${code}/results`));
  }

  setSlide(code: string, slideId: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.baseUrl}/live/${code}/slide`, { slideId }));
  }

  setClosed(code: string, elementId: string, closed: boolean): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.baseUrl}/live/${code}/interactions/${elementId}`, { closed }));
  }

  resetResponses(code: string, elementId: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.baseUrl}/live/${code}/interactions/${elementId}/responses`));
  }

  hideAnswer(code: string, answerId: number, hidden: boolean): Promise<unknown> {
    return firstValueFrom(this.http.put(`${this.baseUrl}/live/${code}/responses/${answerId}`, { hidden }));
  }

  end(code: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${this.baseUrl}/live/${code}/end`, {}));
  }

  // ---- audience ----------------------------------------------------------

  join(code: string): Promise<AudienceJoin> {
    const params = new HttpParams().set('p', this.participant);

    return firstValueFrom(this.http.get<AudienceJoin>(`${this.baseUrl}/live/${code}`, { params }));
  }

  /** Resolves to `null` when nothing has changed since `version`. */
  async state(code: string, version: number): Promise<AudienceState | null> {
    const params = new HttpParams().set('p', this.participant).set('v', version);
    const state = await firstValueFrom(
      this.http.get<AudienceState | { unchanged: true }>(`${this.baseUrl}/live/${code}/state`, { params }),
    );

    return 'unchanged' in state ? null : state;
  }

  respond(code: string, elementId: string, answer: { choices: number[] } | { text: string }): Promise<unknown> {
    return firstValueFrom(
      this.http.post(`${this.baseUrl}/live/${code}/respond`, { participant: this.participant, elementId, ...answer }),
    );
  }
}
