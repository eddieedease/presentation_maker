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
    this.applyMode(mode);
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

    const { name, email, password } = this.form.getRawValue();

    try {
      await firstValueFrom(
        this.isRegister()
          ? this.auth.register({ name, email, password })
          : this.auth.login({ email, password }),
      );

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/workspace';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      this.formError.set(apiMessage(error));
      this.fieldErrors.set(apiFieldErrors(error));
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
