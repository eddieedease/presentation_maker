/** Shapes of the live-session API. Mirrors backend/src/Controllers/LiveController.php. */
import { Deck } from './deck.model';

export type LiveStatus = 'live' | 'ended';

export interface LiveSession {
  code: string;
  title: string;
  status: LiveStatus;
  slideId: string;
  startedAt: string;
  /** How often phones should poll, set by the host in app/config.php. */
  pollSeconds: number;
}

export interface PollResult {
  kind: 'poll';
  /** Votes per option, in option order. */
  counts: number[];
  /** People who voted, which differs from the vote total on a multiple-choice poll. */
  voters: number;
}

export interface LiveAnswer {
  id: number;
  text: string;
  hidden: boolean;
}

export interface QuestionResult {
  kind: 'question';
  /** Newest first. */
  answers: LiveAnswer[];
}

export type ElementResult = PollResult | QuestionResult;

export interface LiveResults {
  connected: number;
  closed: string[];
  results: Record<string, ElementResult>;
}

/** What one phone has already submitted, so a reload does not forget it. */
export interface Submission {
  choices?: number[];
  answers?: string[];
}

export interface AudienceState {
  status: LiveStatus;
  version: number;
  /** Bumps when the presenter restarts the session with an edited deck. */
  rev: number;
  slideId: string;
  closed: string[];
  mine: Record<string, Submission>;
}

export interface AudienceJoin {
  session: { code: string; title: string; status: LiveStatus; pollSeconds: number };
  state: AudienceState;
  deck: Deck;
}
