export interface User {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export type AuthResponse = AuthTokens & { user: User };

export interface OAuthProvider {
  id: string;
  label: string;
  configured: boolean;
}

/** Shape of the JSON error envelope returned by the PHP API. */
export interface ApiErrorBody {
  error: {
    status: number;
    message: string;
    details?: Record<string, string>;
  };
}
