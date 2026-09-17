import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiFieldErrors, apiMessage } from '../../core/api-error';
import { OAuthProvider } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly mode = signal<Mode>(
    this.route.snapshot.queryParamMap.get('mode') === 'register' ? 'register' : 'login',
  );
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(
    this.route.snapshot.queryParamMap.get('oauth_error'),
  );
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly providers = signal<OAuthProvider[]>([]);

  /** Set after a successful registration: the inbox now has the next step. */
  protected readonly registered = signal<{ email: string; delivered: boolean } | null>(null);
  /** Set when sign-in is refused because the address is still unconfirmed. */
  protected readonly unverifiedEmail = signal<string | null>(null);
  protected readonly resendState = signal<'idle' | 'sending' | 'sent'>('idle');

  protected readonly isRegister = computed(() => this.mode() === 'register');
  protected readonly heading = computed(() =>
    this.isRegister() ? 'Create your account' : 'Welcome back',
  );

  protected readonly form = this.fb.nonNullable.group({
    name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    this.applyMode(this.mode());

    this.auth.oauthProviders().subscribe({
      next: ({ providers }) => this.providers.set(providers),
      // Provider buttons simply stay hidden if the API is unreachable.
      error: () => this.providers.set([]),
    });
  }

  protected switchMode(mode: Mode): void {
    this.mode.set(mode);
    this.formError.set(null);
    this.fieldErrors.set({});
    this.registered.set(null);
    this.unverifiedEmail.set(null);
    this.resendState.set('idle');
    this.applyMode(mode);
  }

  protected async resend(): Promise<void> {
    const email = this.unverifiedEmail() ?? this.registered()?.email;
    if (email === undefined || email === null || this.resendState() === 'sending') {
      return;
    }

    this.resendState.set('sending');
    try {
      await firstValueFrom(this.auth.resendVerification(email));
      this.resendState.set('sent');
    } catch (error) {
      this.resendState.set('idle');
      this.formError.set(apiMessage(error));
    }
  }

  protected errorFor(control: string): string | undefined {
    return this.fieldErrors()[control];
  }

  protected signInWith(provider: string): void {
    this.auth.startOAuth(provider);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);
    this.fieldErrors.set({});
    this.unverifiedEmail.set(null);

    const { name, email, password } = this.form.getRawValue();

    try {
      if (this.isRegister()) {
        const response = await firstValueFrom(this.auth.register({ name, email, password }));
        this.registered.set({ email, delivered: response.emailDelivered });

        return;
      }

      await firstValueFrom(this.auth.login({ email, password }));
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/workspace';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      const details = apiFieldErrors(error);

      // An unconfirmed address is not a form error: offer a new link instead.
      if (details['code'] === 'email_unverified') {
        this.unverifiedEmail.set(details['email'] ?? email);
      } else {
        this.formError.set(apiMessage(error));
        this.fieldErrors.set(details);
      }
    } finally {
      this.submitting.set(false);
    }
  }

  private applyMode(mode: Mode): void {
    const name = this.form.controls.name;
    if (mode === 'register') {
      name.addValidators([Validators.required, Validators.minLength(2)]);
    } else {
      name.clearValidators();
    }
    name.updateValueAndValidity();
  }
}
