import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import qrcode from 'qrcode-generator';

/**
 * A QR code drawn as one SVG path, so nothing is injected as markup and it
 * stays sharp at any size on a projector.
 */
@Component({
  selector: 'app-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (code(); as qr) {
      <svg [attr.viewBox]="'0 0 ' + qr.size + ' ' + qr.size" shape-rendering="crispEdges" role="img" [attr.aria-label]="label()">
        <rect width="100%" height="100%" fill="#fff" />
        <path [attr.d]="qr.path" fill="#000" />
      </svg>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly label = input('QR code');

  /** Scanners need a blank border of four modules to find the edges. */
  private static readonly QUIET_ZONE = 4;

  protected readonly code = computed(() => {
    const value = this.value();
    if (value === '') {
      return null;
    }

    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();

    const count = qr.getModuleCount();
    const margin = QrCode.QUIET_ZONE;
    let path = '';

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          path += `M${col + margin} ${row + margin}h1v1h-1z`;
        }
      }
    }

    return { size: count + margin * 2, path };
  });
}
