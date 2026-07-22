import { Component, computed, input } from '@angular/core';

// WCAG AA: iniciales blancas encima → solo violetas con ≥4.5:1 vs blanco.
const PALETTE = ['#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95'];

/** Avatar con foto si hay photoUrl; si no, iniciales con fondo violeta determinístico por id. */
@Component({
  selector: 'kr-avatar',
  template: `
    @if (photoUrl(); as url) {
      <img
        [src]="url"
        [alt]="name()"
        class="rounded-full object-cover select-none"
        [style.width.px]="size()"
        [style.height.px]="size()"
      />
    } @else {
      <div
        class="rounded-full flex items-center justify-center text-white font-semibold select-none"
        [style.width.px]="size()"
        [style.height.px]="size()"
        [style.font-size.px]="size() * 0.4"
        [style.background-color]="color()"
      >
        {{ initials() }}
      </div>
    }
  `,
})
export class KrAvatar {
  readonly name = input.required<string>();
  readonly seed = input<string>('');
  readonly size = input(40);
  readonly photoUrl = input<string | null | undefined>(undefined);

  readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(''),
  );

  readonly color = computed(() => {
    const key = this.seed() || this.name();
    let hash = 0;
    for (const ch of key) {
      hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
  });
}
