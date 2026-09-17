import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, filter, firstValueFrom, map } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { ImageLimits, StoredImage } from '../models/image.model';

@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  private readonly items = signal<StoredImage[]>([]);
  private readonly imageLimits = signal<ImageLimits>({ maxBytes: 8 * 1024 * 1024, maxDimension: 1920 });

  readonly images = this.items.asReadonly();
  readonly limits = this.imageLimits.asReadonly();

  async load(): Promise<StoredImage[]> {
    const response = await firstValueFrom(
      this.http.get<{ images: StoredImage[]; limits: ImageLimits }>(`${this.baseUrl}/images`),
    );
    this.items.set(response.images);
    this.imageLimits.set(response.limits);

    return response.images;
  }

  /**
   * Uploads one file, reporting progress. The browser sets the multipart
   * Content-Type (including the boundary), so it must not be set here.
   */
  upload(file: File): Observable<{ progress: number; image?: StoredImage }> {
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http
      .post<{ image: StoredImage }>(`${this.baseUrl}/images`, form, {
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        filter((event: HttpEvent<{ image: StoredImage }>) =>
          event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response,
        ),
        map((event) => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            return { progress: total > 0 ? Math.round((event.loaded / total) * 100) : 0 };
          }

          const image = (event as { body?: { image: StoredImage } }).body?.image;
          if (image !== undefined) {
            this.items.update((images) => [image, ...images]);
          }

          return { progress: 100, image };
        }),
      );
  }

  async remove(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.baseUrl}/images/${id}`));
    this.items.update((images) => images.filter((image) => image.id !== id));
  }

  static formatBytes(bytes: number): string {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  }
}
