import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiMessage } from '../../core/api-error';
import { AuthService } from '../../core/services/auth.service';

/**
 * Target of the link in the confirmation email. On success the API returns a
 * session, so the visitor lands in their workspace already signed in.
 */
@Component({
  selector: 'app-verify-email',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="grid min-h-screen place-content-center px-6 text-center">
      @switch (state()) {
        @case ('working') {
          <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-indigo-400"></div>
          <p class="mt-4 text-sm text-slate-400">Confirming your email…</p>
        }
        @case ('done') {
          <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-emerald-500/15 text-2xl">✓</div>
          <h1 class="text-xl font-semibold text-white">Email confirmed</h1>
          <p class="mt-2 text-sm text-slate-400">Taking you to your workspace…</p>
        }
        @case ('failed') {
          <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl bg-rose-500/15 text-2xl">!</div>
          <h1 class="text-xl font-semibold text-white">That link did not work</h1>
          <p class="mx-auto mt-2 max-w-sm text-sm text-slate-400">{{ error() }}</p>
          <a routerLink="/login" class="btn-primary mx-auto mt-6">Back to sign in</a>
          <p class="mt-3 text-xs text-slate-500">You can request a fresh link from the sign-in page.</p>
        }
      }
    </div>
  `,
})
export class VerifyEmail {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly state = signal<'working' | 'done' | 'failed'>('working');
  protected readonly error = signal('');

  constructor() {
    void this.confirm();
  }

  private async confirm(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token === null || token === '') {
      this.state.set('failed');
      this.error.set('The link is missing its confirmation token.');

      return;
    }

    try {
      await firstValueFrom(this.auth.verifyEmail(token));
      this.state.set('done');
      setTimeout(() => void this.router.navigateByUrl('/workspace'), 1200);
    } catch (error) {
      this.state.set('failed');
      this.error.set(apiMessage(error, 'That confirmation link is not valid.'));
    }
  }
}
