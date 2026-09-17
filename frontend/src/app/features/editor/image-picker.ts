import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { apiMessage } from '../../core/api-error';
import { StoredImage } from '../../core/models/image.model';
import { ImageService } from '../../core/services/image.service';

/** Upload new images or pick one already in the account's library. */
@Component({
  selector: 'app-image-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-picker.html',
})
export class ImagePicker {
  readonly picked = output<StoredImage>();
  readonly closed = output<void>();

  protected readonly service = inject(ImageService);
  protected readonly images = this.service.images;

  protected readonly loading = signal(true);
  protected readonly uploading = signal(false);
  protected readonly progress = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly confirmingDelete = signal<number | null>(null);

  protected readonly formatBytes = ImageService.formatBytes;

  constructor() {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      await this.service.load();
      this.error.set(null);
    } catch (error) {
      this.error.set(apiMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.uploadAll(input.files);
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.uploadAll(event.dataTransfer?.files ?? null);
  }

  private async uploadAll(files: FileList | null): Promise<void> {
    if (files === null || files.length === 0 || this.uploading()) {
      return;
    }

    this.uploading.set(true);
    this.error.set(null);

    try {
      for (const file of Array.from(files)) {
        if (file.size > this.service.limits().maxBytes) {
          throw new Error(
            `“${file.name}” is ${ImageService.formatBytes(file.size)}; the limit is ` +
              `${ImageService.formatBytes(this.service.limits().maxBytes)}.`,
          );
        }

        this.progress.set(0);
        await new Promise<void>((resolve, reject) => {
          this.service.upload(file).subscribe({
            next: (event) => this.progress.set(event.progress),
            error: reject,
            complete: resolve,
          });
        });
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : apiMessage(error));
    } finally {
      this.uploading.set(false);
      this.progress.set(0);
    }
  }

  protected async remove(image: StoredImage): Promise<void> {
    this.confirmingDelete.set(null);
    try {
      await this.service.remove(image.id);
    } catch (error) {
      this.error.set(apiMessage(error));
    }
  }
}
