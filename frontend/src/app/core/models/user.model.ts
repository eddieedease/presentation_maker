export type UserRole = 'user' | 'admin';

export interface User {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string | null;
}

/** The richer shape the admin endpoints return. */
export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  hasPassword: boolean;
  projectCount: number;
  publishedCount: number;
  createdAt: string;
}

export interface AdminStats {
  users: number;
  disabled: number;
  unverified: number;
  admins: number;
  projects: number;
  published: number;
  images: number;
  views: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export type AuthResponse = AuthTokens & { user: User };

/** Registration does not sign you in: the address has to be confirmed first. */
export interface RegisterResponse {
  user: User;
  verificationRequired: boolean;
  emailDelivered: boolean;
}

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
