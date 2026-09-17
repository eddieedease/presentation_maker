import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { Deck } from '../models/deck.model';
import { Project, ProjectSummary, PublishedPresentation, Publication } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly items = signal<ProjectSummary[]>([]);
  readonly projects = this.items.asReadonly();

  async load(): Promise<ProjectSummary[]> {
    const response = await firstValueFrom(
      this.http.get<{ projects: ProjectSummary[] }>(`${this.baseUrl}/projects`),
    );
    this.items.set(response.projects);

    return response.projects;
  }

  get(id: number): Observable<{ project: Project }> {
    return this.http.get<{ project: Project }>(`${this.baseUrl}/projects/${id}`);
  }

  async create(title: string, description = ''): Promise<Project> {
    const response = await firstValueFrom(
      this.http.post<{ project: Project }>(`${this.baseUrl}/projects`, { title, description }),
    );
    this.items.update((projects) => [response.project, ...projects]);

    return response.project;
  }

  async duplicate(id: number): Promise<Project> {
    const response = await firstValueFrom(
      this.http.post<{ project: Project }>(`${this.baseUrl}/projects/${id}/duplicate`, {}),
    );
    this.items.update((projects) => [response.project, ...projects]);

    return response.project;
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.baseUrl}/projects/${id}`));
    this.items.update((projects) => projects.filter((project) => project.id !== id));
  }

  save(id: number, patch: { title?: string; description?: string; deck?: Deck }): Observable<{ project: Project }> {
    return this.http
      .put<{ project: Project }>(`${this.baseUrl}/projects/${id}`, patch)
      .pipe(tap(({ project }) => this.replace(project)));
  }

  async publish(id: number): Promise<Publication> {
    const response = await firstValueFrom(
      this.http.post<{ publication: Publication }>(`${this.baseUrl}/projects/${id}/publish`, {}),
    );
    this.patchLocal(id, { publication: response.publication });

    return response.publication;
  }

  async unpublish(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.baseUrl}/projects/${id}/publish`));
    this.patchLocal(id, { publication: null });
  }

  /** Public endpoint — no authentication, anyone holding the link can read it. */
  getPublished(slug: string): Observable<{ presentation: PublishedPresentation }> {
    return this.http.get<{ presentation: PublishedPresentation }>(
      `${this.baseUrl}/public/presentations/${encodeURIComponent(slug)}`,
    );
  }

  private replace(project: Project): void {
    const { deck: _deck, ...summary } = project;
    this.patchLocal(project.id, summary);
  }

  private patchLocal(id: number, patch: Partial<ProjectSummary>): void {
    this.items.update((projects) =>
      projects.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    );
  }
}
