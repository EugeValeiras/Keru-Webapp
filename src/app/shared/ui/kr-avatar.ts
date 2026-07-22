import { Component, computed, input } from '@angular/core';

const PALETTE = ['#7C3AED', '#8B5CF6', '#6D28D9', '#A78BFA', '#5B21B6'];

/** Avatar con iniciales y fondo violeta determinístico por id (no hay fotos en la API). */
@Component({
  selector: 'kr-avatar',
  template: `
    <div
      class="rounded-full flex items-center justify-center text-white font-semibold select-none"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.4"
      [style.background-color]="color()"
    >
      {{ initials() }}
    </div>
  `,
})
export class KrAvatar {
  readonly name = input.required<string>();
  readonly seed = input<string>('');
  readonly size = input(40);

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
