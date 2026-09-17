import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CANVAS_HEIGHT, CANVAS_WIDTH, Slide, SlideElement } from '../../core/models/deck.model';
import { boxStyle, contentStyle } from '../../shared/deck-style';
import { ElementView } from '../../shared/element-view';
import { EditorStore } from './editor-store';

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type DragMode = 'move' | ResizeHandle;

interface DragState {
  id: string;
  mode: DragMode;
  pointerX: number;
  pointerY: number;
  origin: { x: number; y: number; width: number; height: number };
}

const MIN_SIZE = 24;
const SNAP_GRID = 8;

@Component({
  selector: 'app-slide-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ElementView],
  templateUrl: './slide-canvas.html',
  styles: `
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
    }
  `,
})
export class SlideCanvas implements AfterViewInit {
  protected readonly store = inject(EditorStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly viewport = viewChild.required<ElementRef<HTMLDivElement>>('viewport');
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('inlineEditor');

  protected readonly canvasWidth = CANVAS_WIDTH;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  protected readonly handles: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  protected readonly scale = signal(1);
  protected readonly editingId = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly slide = this.store.currentSlide;
  protected readonly selectedId = this.store.selectedElementId;

  /** Handles must stay a constant size on screen regardless of canvas zoom. */
  protected readonly handleSize = computed(() => 10 / this.scale());

  /** Centre guides appear when the selected element lines up with the canvas axis. */
  protected readonly showVerticalGuide = computed(() => {
    const element = this.store.selectedElement();
    return element !== null && Math.abs(element.x + element.width / 2 - CANVAS_WIDTH / 2) < 2;
  });
  protected readonly showHorizontalGuide = computed(() => {
    const element = this.store.selectedElement();
    return element !== null && Math.abs(element.y + element.height / 2 - CANVAS_HEIGHT / 2) < 2;
  });

  private drag: DragState | null = null;

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) {
        return;
      }

      const { width, height } = entry.contentRect;
      this.scale.set(Math.max(0.05, Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT)));
    });

    observer.observe(this.viewport().nativeElement);
    this.destroyRef.onDestroy(() => {
      observer.disconnect();
      this.detachPointerListeners();
    });
  }

  protected background(slide: Slide): Record<string, string> {
    const { type, value } = slide.background;
    if (value === '') {
      // Fall back to a neutral stage so light themes remain readable while editing.
      return { background: '#101828' };
    }

    if (type !== 'image') {
      return { background: value };
    }

    // Strip the characters that could break out of the url("…") literal.
    const safeUrl = value.replace(/["\\\n\r]/g, '');

    return {
      'background-image': `url("${safeUrl}")`,
      'background-size': 'cover',
      'background-position': 'center',
    };
  }

  protected box(element: SlideElement): Record<string, string> {
    return boxStyle(element);
  }

  protected editorStyle(element: SlideElement): Record<string, string> {
    return {
      ...contentStyle(element),
      position: 'absolute',
      inset: '0',
      resize: 'none',
      border: '0',
      outline: '2px solid #818cf8',
      'background-color': 'rgba(15,23,42,.55)',
      display: 'block',
    };
  }

  protected clearSelection(): void {
    this.commitInlineEdit();
    this.store.selectedElementId.set(null);
  }

  protected select(event: PointerEvent, element: SlideElement): void {
    event.stopPropagation();
    this.store.selectedElementId.set(element.id);
  }

  protected startEditing(element: SlideElement): void {
    if (element.locked || element.type === 'image' || element.type === 'shape') {
      return;
    }

    // One history entry covers the whole editing session.
    this.store.beginInteraction();
    this.editingId.set(element.id);
    queueMicrotask(() => this.editor()?.nativeElement.focus());
  }

  protected onInlineInput(id: string, value: string): void {
    this.store.updateElement(id, { text: value }, false);
  }

  protected commitInlineEdit(): void {
    this.editingId.set(null);
  }

  protected startDrag(event: PointerEvent, element: SlideElement, mode: DragMode): void {
    if (element.locked || event.button !== 0 || this.editingId() !== null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.store.selectedElementId.set(element.id);
    this.store.beginInteraction();

    this.drag = {
      id: element.id,
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin: { x: element.x, y: element.y, width: element.width, height: element.height },
    };
    this.dragging.set(true);

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null) {
      return;
    }

    const scale = this.scale();
    const dx = (event.clientX - drag.pointerX) / scale;
    const dy = (event.clientY - drag.pointerY) / scale;
    const snap = (value: number): number => (event.altKey ? Math.round(value) : Math.round(value / SNAP_GRID) * SNAP_GRID);

    let { x, y, width, height } = drag.origin;

    if (drag.mode === 'move') {
      x = snap(drag.origin.x + dx);
      y = snap(drag.origin.y + dy);
    } else {
      if (drag.mode.includes('e')) {
        width = Math.max(MIN_SIZE, snap(drag.origin.width + dx));
      }
      if (drag.mode.includes('s')) {
        height = Math.max(MIN_SIZE, snap(drag.origin.height + dy));
      }
      if (drag.mode.includes('w')) {
        const right = drag.origin.x + drag.origin.width;
        x = Math.min(snap(drag.origin.x + dx), right - MIN_SIZE);
        width = right - x;
      }
      if (drag.mode.includes('n')) {
        const bottom = drag.origin.y + drag.origin.height;
        y = Math.min(snap(drag.origin.y + dy), bottom - MIN_SIZE);
        height = bottom - y;
      }
    }

    this.store.updateElement(drag.id, { x, y, width, height }, false);
  };

  private readonly onPointerUp = (): void => {
    this.drag = null;
    this.dragging.set(false);
    this.detachPointerListeners();
  };

  private detachPointerListeners(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  protected handleStyle(handle: ResizeHandle): Record<string, string> {
    const size = this.handleSize();
    const offset = `${-size / 2}px`;
    const position: Record<string, string> = {
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      background: '#818cf8',
      border: `${1 / this.scale()}px solid #fff`,
      'border-radius': '2px',
      cursor: `${handle}-resize`,
    };

    if (handle.includes('n')) {
      position['top'] = offset;
    }
    if (handle.includes('s')) {
      position['bottom'] = offset;
    }
    if (handle.includes('w')) {
      position['left'] = offset;
    }
    if (handle.includes('e')) {
      position['right'] = offset;
    }
    if (handle === 'n' || handle === 's') {
      position['left'] = '50%';
      position['margin-left'] = offset;
    }
    if (handle === 'e' || handle === 'w') {
      position['top'] = '50%';
      position['margin-top'] = offset;
    }

    return position;
  }
}
