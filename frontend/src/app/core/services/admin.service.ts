import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { AdminStats, ManagedUser, UserRole } from '../models/user.model';

export interface UserPatch {
  name?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
  password?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly items = signal<ManagedUser[]>([]);
  private readonly summary = signal<AdminStats | null>(null);

  readonly users = this.items.asReadonly();
  readonly stats = this.summary.asReadonly();

  async load(search = ''): Promise<void> {
    const query = search.trim() === '' ? '' : `?search=${encodeURIComponent(search.trim())}`;
    const [users, stats] = await Promise.all([
      firstValueFrom(this.http.get<{ users: ManagedUser[] }>(`${this.baseUrl}/admin/users${query}`)),
      firstValueFrom(this.http.get<{ stats: AdminStats }>(`${this.baseUrl}/admin/stats`)),
    ]);

    this.items.set(users.users);
    this.summary.set(stats.stats);
  }

  async create(payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    sendConfirmation: boolean;
  }): Promise<ManagedUser> {
    const response = await firstValueFrom(
      this.http.post<{ user: ManagedUser }>(`${this.baseUrl}/admin/users`, payload),
    );
    this.items.update((users) => [...users, response.user]);

    return response.user;
  }

  async update(id: number, patch: UserPatch): Promise<ManagedUser> {
    const response = await firstValueFrom(
      this.http.put<{ user: ManagedUser }>(`${this.baseUrl}/admin/users/${id}`, patch),
    );
    this.items.update((users) => users.map((user) => (user.id === id ? response.user : user)));

    return response.user;
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.baseUrl}/admin/users/${id}`));
    this.items.update((users) => users.filter((user) => user.id !== id));
  }

  async resendVerification(id: number): Promise<boolean> {
    const response = await firstValueFrom(
      this.http.post<{ emailDelivered: boolean }>(`${this.baseUrl}/admin/users/${id}/resend-verification`, {}),
    );

    return response.emailDelivered;
  }
}
