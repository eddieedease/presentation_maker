import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiMessage } from '../../core/api-error';
import { ManagedUser, UserRole } from '../../core/models/user.model';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';

interface DraftUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  sendConfirmation: boolean;
}

@Component({
  selector: 'app-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin.html',
})
export class Admin {
  private readonly service = inject(AdminService);
  private readonly auth = inject(AuthService);

  protected readonly users = this.service.users;
  protected readonly stats = this.service.stats;
  protected readonly currentUser = this.auth.user;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly busyId = signal<number | null>(null);
  protected readonly confirmingDelete = signal<number | null>(null);

  /** The row being edited, held as a draft so Cancel really cancels. */
  protected readonly editingId = signal<number | null>(null);
  protected readonly draft = signal<ManagedUser | null>(null);
  protected readonly newPassword = signal('');

  protected readonly creating = signal(false);
  protected readonly newUser = signal<DraftUser>(this.emptyDraft());
  protected readonly saving = signal(false);

  constructor() {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.service.load(this.search());
    } catch (error) {
      this.error.set(apiMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  // ---- inline editing ----------------------------------------------------

  protected startEdit(user: ManagedUser): void {
    this.editingId.set(user.id);
    this.draft.set({ ...user });
    this.newPassword.set('');
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.draft.set(null);
    this.newPassword.set('');
  }

  protected patchDraft(patch: Partial<ManagedUser>): void {
    const current = this.draft();
    if (current !== null) {
      this.draft.set({ ...current, ...patch });
    }
  }

  protected async saveEdit(): Promise<void> {
    const draft = this.draft();
    if (draft === null) {
      return;
    }

    await this.run(draft.id, async () => {
      const password = this.newPassword().trim();
      await this.service.update(draft.id, {
        name: draft.name,
        email: draft.email,
        role: draft.role,
        isActive: draft.isActive,
        emailVerified: draft.emailVerified,
        ...(password === '' ? {} : { password }),
      });
      this.cancelEdit();
      this.notify(`Saved ${draft.email}.`);
    });
  }

  // ---- row actions -------------------------------------------------------

  protected async toggleActive(user: ManagedUser): Promise<void> {
    await this.run(user.id, async () => {
      await this.service.update(user.id, { isActive: !user.isActive });
      this.notify(user.isActive ? `${user.email} disabled.` : `${user.email} enabled.`);
    });
  }

  protected async resend(user: ManagedUser): Promise<void> {
    await this.run(user.id, async () => {
      const delivered = await this.service.resendVerification(user.id);
      this.notify(delivered ? `Confirmation sent to ${user.email}.` : 'The server could not send the message.');
    });
  }

  protected async remove(user: ManagedUser): Promise<void> {
    this.confirmingDelete.set(null);
    await this.run(user.id, async () => {
      await this.service.remove(user.id);
      this.notify(`Deleted ${user.email} and everything they owned.`);
    });
  }

  // ---- creating ----------------------------------------------------------

  protected openCreate(): void {
    this.newUser.set(this.emptyDraft());
    this.creating.set(true);
  }

  protected patchNew(patch: Partial<DraftUser>): void {
    this.newUser.update((draft) => ({ ...draft, ...patch }));
  }

  protected async create(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.service.create(this.newUser());
      this.creating.set(false);
      this.notify(`Created ${created.email}.`);
    } catch (error) {
      this.error.set(apiMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected formatDate(value: string): string {
    const date = new Date(value.replace(' ', 'T') + 'Z');
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private emptyDraft(): DraftUser {
    return { name: '', email: '', password: '', role: 'user', sendConfirmation: false };
  }

  private async run(id: number, action: () => Promise<void>): Promise<void> {
    this.busyId.set(id);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(apiMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  private notify(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 3500);
  }
}
