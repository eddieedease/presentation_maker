import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorBody } from './models/user.model';

function body(error: unknown): ApiErrorBody['error'] | null {
  if (error instanceof HttpErrorResponse && typeof error.error === 'object' && error.error !== null) {
    const candidate = (error.error as Partial<ApiErrorBody>).error;
    if (candidate !== undefined && typeof candidate.message === 'string') {
      return candidate;
    }
  }

  return null;
}

/** Human-readable message for any failed API call. */
export function apiMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const parsed = body(error);
  if (parsed !== null) {
    return parsed.message;
  }

  if (error instanceof HttpErrorResponse && error.status === 0) {
    return 'Cannot reach the API. Is the Docker stack running?';
  }

  return fallback;
}

/** Per-field validation messages, keyed by form control name. */
export function apiFieldErrors(error: unknown): Record<string, string> {
  return body(error)?.details ?? {};
}
