import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, of, shareReplay, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { AuthResponse, AuthTokens, OAuthProvider, RegisterResponse, User } from '../models/user.model';

const ACCESS_KEY = 'presmaker.accessToken';
const REFRESH_KEY = 'presmaker.refreshToken';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly currentUser = signal<User | null>(null);
  private readonly restored = signal(false);

  /** Shared in-flight refresh so parallel 401s trigger only one round trip. */
  private refreshInFlight: Observable<AuthTokens> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');
  readonly isRestored = this.restored.asReadonly();

  get accessToken(): string | null {
    return this.read(ACCESS_KEY);
  }

  /** Runs once at bootstrap: turns stored tokens back into a live session. */
  async restore(): Promise<void> {
    try {
      if (this.read(ACCESS_KEY) === null && this.read(REFRESH_KEY) === null) {
        return;
      }

      const response = await firstValueFrom(this.http.get<{ user: User }>(`${this.baseUrl}/auth/me`));
      this.currentUser.set(response.user);
    } catch {
      // Both tokens are unusable — start the session clean rather than half-authenticated.
      this.clearTokens();
      this.currentUser.set(null);
    } finally {
      this.restored.set(true);
    }
  }

  /**
   * Registration deliberately does not start a session: the account cannot be
   * used until the email address is confirmed.
   */
  register(payload: { name: string; email: string; password: string }): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>(`${this.baseUrl}/auth/register`, payload);
  }

  /** Confirms an address and signs the user in with the returned session. */
  verifyEmail(token: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/verify`, { token })
      .pipe(tap((response) => this.applySession(response)));
  }

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/auth/verify/resend`, { email });
  }

  login(payload: { email: string; password: string }): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/login`, payload)
      .pipe(tap((response) => this.applySession(response)));
  }

  oauthProviders(): Observable<{ providers: OAuthProvider[] }> {
    return this.http.get<{ providers: OAuthProvider[] }>(`${this.baseUrl}/auth/oauth/providers`);
  }

  /** Full-page navigation: the provider owns the next few redirects. */
  startOAuth(provider: string): void {
    window.location.href = `${this.baseUrl}/auth/oauth/${provider}/start`;
  }

  /** Completes the OAuth hand-off after the API redirects back with tokens. */
  async completeOAuth(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): Promise<void> {
    this.storeTokens(tokens);
    const response = await firstValueFrom(this.http.get<{ user: User }>(`${this.baseUrl}/auth/me`));
    this.currentUser.set(response.user);
  }

  refreshTokens(): Observable<AuthTokens> {
    if (this.refreshInFlight !== null) {
      return this.refreshInFlight;
    }

    const refreshToken = this.read(REFRESH_KEY);
    if (refreshToken === null) {
      return of<AuthTokens>({ accessToken: '', refreshToken: '', expiresIn: 0, tokenType: 'Bearer' });
    }

    this.refreshInFlight = this.http
      .post<AuthTokens>(`${this.baseUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap({
          next: (tokens) => this.storeTokens(tokens),
          finalize: () => (this.refreshInFlight = null),
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.refreshInFlight;
  }

  async logout(): Promise<void> {
    const refreshToken = this.read(REFRESH_KEY);
    if (refreshToken !== null) {
      try {
        await firstValueFrom(this.http.post(`${this.baseUrl}/auth/logout`, { refreshToken }));
      } catch {
        // The local session is cleared regardless of whether the API is reachable.
      }
    }

    this.clearTokens();
    this.currentUser.set(null);
  }

  /** Called by the interceptor when a refresh finally fails. */
  forceSignOut(): void {
    this.clearTokens();
    this.currentUser.set(null);
  }

  private applySession(response: AuthResponse): void {
    this.storeTokens(response);
    this.currentUser.set(response.user);
    this.restored.set(true);
  }

  private storeTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): void {
    this.write(ACCESS_KEY, tokens.accessToken);
    this.write(REFRESH_KEY, tokens.refreshToken);
  }

  private clearTokens(): void {
    this.refreshInFlight = null;
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
  }

  private read(key: string): string | null {
    try {
      const value = localStorage.getItem(key);
      return value === null || value === '' ? null : value;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore: the session simply will not survive a reload.
    }
  }
}
