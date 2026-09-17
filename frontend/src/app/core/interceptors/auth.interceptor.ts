import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Endpoints that must never trigger the refresh-and-retry dance. */
function isAuthEndpoint(request: HttpRequest<unknown>): boolean {
  return /\/auth\/(login|register|refresh|logout)$/.test(request.url);
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const withToken = (token: string | null): HttpRequest<unknown> =>
    token === null ? request : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(withToken(auth.accessToken)).pipe(
    catchError((error: unknown) => {
      const isExpired = error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint(request);
      if (!isExpired) {
        return throwError(() => error);
      }

      // One attempt to rotate the refresh token, then replay the original request.
      return auth.refreshTokens().pipe(
        switchMap((tokens) => {
          if (tokens.accessToken === '') {
            auth.forceSignOut();
            void router.navigate(['/login']);
            return throwError(() => error);
          }

          return next(withToken(tokens.accessToken));
        }),
        catchError(() => {
          auth.forceSignOut();
          void router.navigate(['/login']);
          return throwError(() => error);
        }),
      );
    }),
  );
};
