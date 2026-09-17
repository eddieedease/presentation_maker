import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { publicDeckUrl } from '../../core/api.config';
import { apiMessage } from '../../core/api-error';
import { ProjectSummary } from '../../core/models/project.model';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'app-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './workspace.html',
})
export class Workspace {
  private readonly projectService = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly projects = this.projectService.projects;
  protected readonly user = this.auth.user;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly busyId = signal<number | null>(null);
  protected readonly confirmingDelete = signal<number | null>(null);

  protected readonly creating = signal(false);
  protected readonly newTitle = signal('');
  protected readonly saving = signal(false);

  private readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput');

  constructor() {
    void this.refresh();

    // `autofocus` does not fire for elements added to the DOM after load.
    effect(() => {
      if (this.creating()) {
        queueMicrotask(() => this.titleInput()?.nativeElement.focus());
      }
    });
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.projectService.load();
    } catch (error) {
      this.error.set(apiMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected openCreate(): void {
    this.newTitle.set('');
    this.creating.set(true);
  }

  protected async create(): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    try {
      const title = this.newTitle().trim() || 'Untitled presentation';
      const project = await this.projectService.create(title);
      this.creating.set(false);
      await this.router.navigate(['/editor', project.id]);
    } catch (error) {
      this.error.set(apiMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async duplicate(project: ProjectSummary): Promise<void> {
    await this.run(project.id, async () => {
      await this.projectService.duplicate(project.id);
      this.notify(`Duplicated “${project.title}”.`);
    });
  }

  protected async publish(project: ProjectSummary): Promise<void> {
    await this.run(project.id, async () => {
      const publication = await this.projectService.publish(project.id);
      await this.copyLink(publication.slug, 'Published — link copied to your clipboard.');
    });
  }

  protected async unpublish(project: ProjectSummary): Promise<void> {
    await this.run(project.id, async () => {
      await this.projectService.unpublish(project.id);
      this.notify('Link revoked. The public URL no longer works.');
    });
  }

  protected async remove(project: ProjectSummary): Promise<void> {
    this.confirmingDelete.set(null);
    await this.run(project.id, async () => {
      await this.projectService.remove(project.id);
      this.notify(`Deleted “${project.title}”.`);
    });
  }

  protected publicUrl(slug: string): string {
    return publicDeckUrl(slug);
  }

  protected async copyLink(slug: string, message = 'Link copied to your clipboard.'): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.publicUrl(slug));
      this.notify(message);
    } catch {
      this.notify(this.publicUrl(slug));
    }
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/');
  }

  protected formatDate(value: string): string {
    const date = new Date(value.replace(' ', 'T') + 'Z');
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
