import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SlideElement } from '../core/models/deck.model';
import { contentStyle, listItems, shapeStyle } from './deck-style';

/**
 * Renders the inner content of a single slide element. Shared by the editor
 * canvas and the reveal.js player so both stay pixel-identical.
 *
 * All text is bound as interpolated content, never innerHTML, so authored
 * content can never inject markup into a published deck.
 */
@Component({
  selector: 'app-element-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [style]="content()">
      @switch (element().type) {
        @case ('image') {
          @if (element().src) {
            <img
              [src]="element().src"
              [alt]="element().alt"
              style="width:100%;height:100%;border:none;box-shadow:none;margin:0;max-width:none;max-height:none"
              [style.object-fit]="element().style.objectFit"
            />
          } @else {
            <div
              style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:2px dashed currentColor;opacity:.45;font-size:14px;border-radius:8px"
            >
              Add an image URL
            </div>
          }
        }
        @case ('code') {
          <pre
            style="margin:0;width:100%;height:100%;box-shadow:none;background:transparent;font-size:inherit"
          ><code [class]="'language-' + element().language" style="max-height:none;padding:0;background:transparent">{{ element().text }}</code></pre>
        }
        @case ('list') {
          <ul style="margin:0;padding-left:1.2em;list-style:disc;display:block">
            @for (item of items(); track $index) {
              <li style="margin:0">{{ item }}</li>
            }
          </ul>
        }
        @case ('shape') {
          <div [style]="shape()"></div>
        }
        @case ('quote') {
          <blockquote style="margin:0;padding:0;width:100%;background:transparent;box-shadow:none;font-style:inherit">
            {{ element().text }}
          </blockquote>
        }
        @default {
          <div style="width:100%">{{ element().text }}</div>
        }
      }
    </div>
  `,
})
export class ElementView {
  readonly element = input.required<SlideElement>();

  protected readonly content = computed(() => contentStyle(this.element()));
  protected readonly shape = computed(() => shapeStyle(this.element()));
  protected readonly items = computed(() => listItems(this.element()));
}
