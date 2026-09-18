import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { publicDeckUrl } from '../../core/api.config';
import { apiMessage } from '../../core/api-error';
import { ELEMENT_TYPES, ElementType } from '../../core/models/deck.model';
import { EditorStore } from './editor-store';
import { Inspector } from './inspector';
import { SlideCanvas } from './slide-canvas';
import { SlideThumbnail } from './slide-thumbnail';

const ELEMENT_LABELS: Record<ElementType, string> = {
  heading: 'Heading',
  text: 'Text',
  list: 'Bullets',
  quote: 'Quote',
  image: 'Image',
  video: 'Video',
  table: 'Table',
  chart: 'Chart',
  icon: 'Icon',
  code: 'Code',
  math: 'Math',
  shape: 'Shape',
};

@Component({
  selector: 'app-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SlideCanvas, SlideThumbnail, Inspector],
  providers: [EditorStore],
  templateUrl: './editor.html',
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
})
export class Editor {
  /** Bound from the :id route parameter via withComponentInputBinding(). */
  readonly id = input.required<string>();

  protected readonly store = inject(EditorStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly elementTypes = ELEMENT_TYPES;
  protected readonly labels = ELEMENT_LABELS;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly showPublish = signal(false);
  protected readonly publishing = signal(false);
  protected readonly copied = signal(false);

  protected readonly saveLabel = computed(() => {
    switch (this.store.saveState()) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'All changes saved';
      case 'dirty':
        return 'Unsaved changes';
      case 'error':
        return 'Save failed';
      default:
        return '';
    }
  });

  constructor() {
    effect(() => {
      const id = Number(this.id());
      if (Number.isFinite(id)) {
        void this.loadProject(id);
      }
    });

    this.destroyRef.onDestroy(() => {
      void this.store.saveNow();
      this.store.dispose();
    });
  }

  private async loadProject(id: number): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      await this.store.load(id);
    } catch (error) {
      this.loadError.set(apiMessage(error, 'That presentation could not be opened.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected addElement(type: ElementType): void {
    this.store.addElement(type);
  }

  /**
   * Opens the preview in its own tab.
   *
   * The tab is opened synchronously, before the save is awaited: browsers only
   * accept window.open while a user gesture is still on the stack, so opening
   * it after the await would be blocked. The blank tab is pointed at the
   * preview once the draft is safely saved, which also removes any race
   * between the save and the preview's own fetch.
   */
  protected async openPreview(): Promise<void> {
    // Named, so clicking Preview repeatedly reuses one tab instead of
    // scattering a new one across the taskbar each time.
    const tab = window.open('', 'presmaker-preview');
    await this.store.saveNow();

    const url = new URL(`preview/${this.id()}`, document.baseURI).href;
    if (tab === null) {
      // Popup blocked: fall back to navigating this tab.
      window.location.href = url;
      return;
    }

    tab.location.replace(url);
    tab.focus();
  }

  /**
   * Opens the share dialog. For a deck that is already published this must not
   * change anything — re-publishing is an explicit action inside the dialog.
   * Otherwise revoking a link and then merely looking at the dialog would put
   * the deck straight back online.
   */
  protected async openPublish(): Promise<void> {
    this.showPublish.set(true);
    this.copied.set(false);

    if (this.store.publication() === null) {
      await this.publish();
    }
  }

  protected async publish(): Promise<void> {
    this.publishing.set(true);
    try {
      await this.store.publish();
    } catch (error) {
      this.loadError.set(apiMessage(error, 'Publishing failed.'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected async unpublish(): Promise<void> {
    this.publishing.set(true);
    try {
      await this.store.unpublish();
      this.showPublish.set(false);
    } catch (error) {
      this.loadError.set(apiMessage(error, 'Could not revoke the link.'));
    } finally {
      this.publishing.set(false);
    }
  }

  protected publicUrl(slug: string): string {
    return publicDeckUrl(slug);
  }

  protected async copyLink(slug: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.publicUrl(slug));
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.copied.set(false);
    }
  }

  protected async backToWorkspace(): Promise<void> {
    await this.store.saveNow();
    await this.router.navigateByUrl('/workspace');
  }

  // ---- keyboard ----------------------------------------------------------

  protected onKeydown(event: KeyboardEvent): void {
    if (this.isTypingTarget(event.target)) {
      return;
    }

    // While the share dialog is open it owns the keyboard.
    if (this.showPublish()) {
      if (event.key === 'Escape') {
        this.showPublish.set(false);
      }
      return;
    }

    const meta = event.ctrlKey || event.metaKey;
    const selected = this.store.selectedElement();

    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.store.saveNow();
      return;
    }

    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.store.redo() : this.store.undo();
      return;
    }

    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.store.redo();
      return;
    }

    if (meta && event.key.toLowerCase() === 'd' && selected !== null) {
      event.preventDefault();
      this.store.duplicateElement(selected.id);
      return;
    }

    if (event.key === 'Escape') {
      this.store.selectedElementId.set(null);
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && selected !== null) {
      event.preventDefault();
      this.store.deleteElement(selected.id);
      return;
    }

    if (selected !== null && event.key.startsWith('Arrow')) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const delta = {
        ArrowUp: { y: selected.y - step },
        ArrowDown: { y: selected.y + step },
        ArrowLeft: { x: selected.x - step },
        ArrowRight: { x: selected.x + step },
      }[event.key];

      if (delta !== undefined) {
        this.store.updateElement(selected.id, delta);
      }
    }
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    const state = this.store.saveState();
    if (state === 'dirty' || state === 'saving') {
      event.preventDefault();
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return (
      target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    );
  }
}
