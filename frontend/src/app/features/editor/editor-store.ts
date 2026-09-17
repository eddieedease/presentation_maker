import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiMessage } from '../../core/api-error';
import {
  Deck,
  ElementType,
  Slide,
  SlideElement,
  cloneDeck,
  createElement,
  createSlide,
  reindexSlide,
} from '../../core/models/deck.model';
import { Project, Publication } from '../../core/models/project.model';
import { ProjectService } from '../../core/services/project.service';

const HISTORY_LIMIT = 60;
const AUTOSAVE_DELAY_MS = 1200;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Editor state for one project: the deck document, the current selection,
 * undo/redo history and debounced autosave.
 *
 * Provided per-editor-instance, not in root, so opening another deck starts clean.
 */
@Injectable()
export class EditorStore {
  private readonly projects = inject(ProjectService);

  private readonly past: Deck[] = [];
  private readonly future: Deck[] = [];
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  readonly projectId = signal<number | null>(null);
  readonly title = signal('');
  readonly description = signal('');
  readonly deck = signal<Deck | null>(null);
  readonly publication = signal<Publication | null>(null);

  readonly slideIndex = signal(0);
  readonly selectedElementId = signal<string | null>(null);

  readonly saveState = signal<SaveState>('idle');
  readonly errorMessage = signal<string | null>(null);

  readonly slides = computed<Slide[]>(() => this.deck()?.slides ?? []);
  readonly currentSlide = computed<Slide | null>(() => this.slides()[this.slideIndex()] ?? null);
  readonly selectedElement = computed<SlideElement | null>(() => {
    const id = this.selectedElementId();
    return id === null ? null : (this.currentSlide()?.elements.find((el) => el.id === id) ?? null);
  });

  readonly canUndo = computed(() => this.historyDepth() > 0);
  readonly canRedo = computed(() => this.futureDepth() > 0);

  // Signals mirroring the history arrays so the toolbar buttons stay reactive.
  private readonly historyDepth = signal(0);
  private readonly futureDepth = signal(0);

  // ---- loading & saving --------------------------------------------------

  async load(id: number): Promise<void> {
    const { project } = await firstValueFrom(this.projects.get(id));
    this.hydrate(project);
  }

  private hydrate(project: Project): void {
    this.projectId.set(project.id);
    this.title.set(project.title);
    this.description.set(project.description);
    this.publication.set(project.publication);
    this.deck.set(project.deck);
    this.slideIndex.set(0);
    this.selectedElementId.set(null);
    this.past.length = 0;
    this.future.length = 0;
    this.syncHistoryDepth();
    this.saveState.set('idle');
    this.loaded = true;
  }

  /** Flushes any pending autosave immediately (used before preview/publish/leave). */
  async saveNow(): Promise<void> {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }

    const id = this.projectId();
    const deck = this.deck();
    if (id === null || deck === null || this.saveState() === 'saved' || this.saveState() === 'idle') {
      return;
    }

    await this.persist(id, deck);
  }

  private scheduleSave(): void {
    if (!this.loaded) {
      return;
    }

    this.saveState.set('dirty');
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }

    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      const id = this.projectId();
      const deck = this.deck();
      if (id !== null && deck !== null) {
        void this.persist(id, deck);
      }
    }, AUTOSAVE_DELAY_MS);
  }

  private async persist(id: number, deck: Deck): Promise<void> {
    this.saveState.set('saving');
    this.errorMessage.set(null);

    try {
      await firstValueFrom(
        this.projects.save(id, { title: this.title(), description: this.description(), deck }),
      );
      this.saveState.set('saved');
    } catch (error) {
      this.saveState.set('error');
      this.errorMessage.set(apiMessage(error, 'Could not save your changes.'));
    }
  }

  setTitle(title: string): void {
    this.title.set(title);
    this.scheduleSave();
  }

  setDescription(description: string): void {
    this.description.set(description);
    this.scheduleSave();
  }

  // ---- mutation primitives ----------------------------------------------

  /** Applies a change and records it as one undoable step. */
  commit(mutate: (draft: Deck) => void): void {
    this.pushHistory();
    this.apply(mutate);
  }

  /** Applies a change without a history entry — used during a live drag. */
  apply(mutate: (draft: Deck) => void): void {
    const current = this.deck();
    if (current === null) {
      return;
    }

    const draft = cloneDeck(current);
    mutate(draft);
    this.deck.set(draft);
    this.scheduleSave();
  }

  /** Opens an undoable step whose changes arrive later (drag, resize, slider). */
  beginInteraction(): void {
    this.pushHistory();
  }

  undo(): void {
    const current = this.deck();
    const previous = this.past.pop();
    if (current === null || previous === undefined) {
      return;
    }

    this.future.push(current);
    this.deck.set(previous);
    this.clampSelection();
    this.syncHistoryDepth();
    this.scheduleSave();
  }

  redo(): void {
    const current = this.deck();
    const next = this.future.pop();
    if (current === null || next === undefined) {
      return;
    }

    this.past.push(current);
    this.deck.set(next);
    this.clampSelection();
    this.syncHistoryDepth();
    this.scheduleSave();
  }

  private pushHistory(): void {
    const current = this.deck();
    if (current === null) {
      return;
    }

    this.past.push(cloneDeck(current));
    if (this.past.length > HISTORY_LIMIT) {
      this.past.shift();
    }
    this.future.length = 0;
    this.syncHistoryDepth();
  }

  private syncHistoryDepth(): void {
    this.historyDepth.set(this.past.length);
    this.futureDepth.set(this.future.length);
  }

  private clampSelection(): void {
    const slideCount = this.slides().length;
    if (this.slideIndex() >= slideCount) {
      this.slideIndex.set(Math.max(0, slideCount - 1));
    }
    if (this.selectedElement() === null) {
      this.selectedElementId.set(null);
    }
  }

  // ---- deck settings -----------------------------------------------------

  updateDeck(patch: Partial<Deck>): void {
    this.commit((draft) => Object.assign(draft, patch));
  }

  // ---- slides ------------------------------------------------------------

  selectSlide(index: number): void {
    this.slideIndex.set(index);
    this.selectedElementId.set(null);
  }

  addSlide(): void {
    const insertAt = this.slideIndex() + 1;
    this.commit((draft) => {
      draft.slides.splice(insertAt, 0, createSlide());
    });
    this.selectSlide(insertAt);
  }

  duplicateSlide(index: number): void {
    this.commit((draft) => {
      const source = draft.slides[index];
      if (source !== undefined) {
        draft.slides.splice(index + 1, 0, reindexSlide(source));
      }
    });
    this.selectSlide(index + 1);
  }

  deleteSlide(index: number): void {
    if (this.slides().length <= 1) {
      return;
    }

    this.commit((draft) => {
      draft.slides.splice(index, 1);
    });
    this.selectSlide(Math.max(0, Math.min(index, this.slides().length - 1)));
  }

  moveSlide(from: number, to: number): void {
    if (to < 0 || to >= this.slides().length || from === to) {
      return;
    }

    this.commit((draft) => {
      const [moved] = draft.slides.splice(from, 1);
      if (moved !== undefined) {
        draft.slides.splice(to, 0, moved);
      }
    });
    this.slideIndex.set(to);
  }

  updateSlide(patch: Partial<Slide>): void {
    const index = this.slideIndex();
    this.commit((draft) => {
      const slide = draft.slides[index];
      if (slide !== undefined) {
        Object.assign(slide, patch);
      }
    });
  }

  // ---- elements ----------------------------------------------------------

  addElement(type: ElementType): void {
    const index = this.slideIndex();
    const element = createElement(type, {
      x: 120,
      y: 140 + (this.currentSlide()?.elements.length ?? 0) * 24,
      zIndex: (this.currentSlide()?.elements.length ?? 0) + 1,
    });

    this.commit((draft) => {
      draft.slides[index]?.elements.push(element);
    });
    this.selectedElementId.set(element.id);
  }

  /** `record: false` keeps intermediate drag frames out of the undo history. */
  updateElement(id: string, patch: Partial<SlideElement>, record = true): void {
    const index = this.slideIndex();
    const mutate = (draft: Deck): void => {
      const element = draft.slides[index]?.elements.find((candidate) => candidate.id === id);
      if (element !== undefined) {
        Object.assign(element, patch);
      }
    };

    record ? this.commit(mutate) : this.apply(mutate);
  }

  updateElementStyle(id: string, patch: Partial<SlideElement['style']>, record = true): void {
    const index = this.slideIndex();
    const mutate = (draft: Deck): void => {
      const element = draft.slides[index]?.elements.find((candidate) => candidate.id === id);
      if (element !== undefined) {
        Object.assign(element.style, patch);
      }
    };

    record ? this.commit(mutate) : this.apply(mutate);
  }

  deleteElement(id: string): void {
    const index = this.slideIndex();
    this.commit((draft) => {
      const slide = draft.slides[index];
      if (slide !== undefined) {
        slide.elements = slide.elements.filter((element) => element.id !== id);
      }
    });
    this.selectedElementId.set(null);
  }

  duplicateElement(id: string): void {
    const index = this.slideIndex();
    const source = this.currentSlide()?.elements.find((element) => element.id === id);
    if (source === undefined) {
      return;
    }

    const copy = createElement(source.type, {
      ...structuredClone(source),
      x: source.x + 24,
      y: source.y + 24,
    });

    this.commit((draft) => {
      draft.slides[index]?.elements.push(copy);
    });
    this.selectedElementId.set(copy.id);
  }

  /** Moves an element to the front or back of the stacking order. */
  reorderElement(id: string, direction: 'front' | 'back'): void {
    const index = this.slideIndex();
    const elements = this.currentSlide()?.elements ?? [];
    const zIndexes = elements.map((element) => element.zIndex);
    const target = direction === 'front' ? Math.max(1, ...zIndexes) + 1 : Math.min(1, ...zIndexes) - 1;

    this.commit((draft) => {
      const element = draft.slides[index]?.elements.find((candidate) => candidate.id === id);
      if (element !== undefined) {
        element.zIndex = Math.max(0, Math.min(999, target));
      }
    });
  }

  // ---- publishing --------------------------------------------------------

  async publish(): Promise<Publication | null> {
    const id = this.projectId();
    if (id === null) {
      return null;
    }

    await this.saveNow();
    const publication = await this.projects.publish(id);
    this.publication.set(publication);

    return publication;
  }

  async unpublish(): Promise<void> {
    const id = this.projectId();
    if (id === null) {
      return;
    }

    await this.projects.unpublish(id);
    this.publication.set(null);
  }

  dispose(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }
}
