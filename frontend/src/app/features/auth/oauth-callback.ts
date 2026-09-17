import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiMessage } from '../../core/api-error';
import { AuthService } from '../../core/services/auth.service';

/**
 * Lands here after the API completes the OAuth exchange. Tokens arrive in the
 * URL fragment, which browsers never send to a server.
 */
@Component({
  selector: 'app-oauth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="grid min-h-screen place-content-center px-6 text-center">
      @if (error(); as message) {
        <h1 class="text-xl font-semibold text-white">Sign-in failed</h1>
        <p class="mt-2 max-w-sm text-sm text-slate-400">{{ message }}</p>
        <a routerLink="/login" class="btn-primary mx-auto mt-6">Back to sign in</a>
      } @else {
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-indigo-400"></div>
        <p class="mt-4 text-sm text-slate-400">Signing you in…</p>
      }
    </div>
  `,
})
export class OauthCallback {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.complete();
  }

  private async complete(): Promise<void> {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = fragment.get('accessToken');
    const refreshToken = fragment.get('refreshToken');

    if (accessToken === null || refreshToken === null) {
      this.error.set('The provider did not return a session. Please try signing in again.');
      return;
    }

    try {
      await this.auth.completeOAuth({ accessToken, refreshToken });
      // Drop the tokens out of the address bar before moving on.
      history.replaceState(null, '', window.location.pathname);
      await this.router.navigateByUrl('/workspace');
    } catch (error) {
      this.error.set(apiMessage(error));
    }
  }
}
