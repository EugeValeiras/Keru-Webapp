import { Component, input } from '@angular/core';

export type IllustrationScene = 'patients' | 'search' | 'notifications' | 'inbox' | 'locked';

/**
 * Spot illustrations de marca (brand book §5): trazo lineal redondeado como el
 * logo, violeta sobre una mancha primary-100 y el punto terracota como acento
 * emocional. Inline y sin dependencias; decorativas (aria-hidden), el texto
 * del estado vacío es el contenido accesible.
 */
@Component({
  selector: 'kr-illustration',
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()', class: 'inline-block' },
  template: `
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="var(--color-primary-500)"
      stroke-width="6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="w-full h-full"
    >
      <circle cx="60" cy="62" r="46" fill="var(--color-primary-100)" stroke="none" />
      @switch (scene()) {
        @case ('patients') {
          <!-- Dos siluetas, una arropa a la otra (el abrazo del logo) -->
          <circle cx="46" cy="46" r="10" />
          <path d="M30 90 c0 -14 7 -22 16 -22 s16 8 16 22" />
          <circle cx="78" cy="56" r="8" />
          <path d="M64 90 c0 -11 6 -18 14 -18 s14 7 14 18" />
          <path d="M58 46 q20 -4 32 12" stroke="var(--color-primary-300)" />
          <circle cx="92" cy="34" r="5.5" fill="var(--color-accent-400)" stroke="none" />
        }
        @case ('search') {
          <!-- Lupa que busca con cariño: el punto terracota es lo que importa encontrar -->
          <circle cx="53" cy="53" r="21" />
          <path d="M69 69 L86 86" />
          <path d="M42 30 q-10 5 -12 16" stroke="var(--color-primary-300)" />
          <circle cx="53" cy="53" r="5.5" fill="var(--color-accent-400)" stroke="none" />
        }
        @case ('notifications') {
          <!-- Campana en reposo; el punto terracota descansa a su lado -->
          <path
            d="M42 74 c6 -7 5 -15 5 -22 a13 13 0 0 1 26 0 c0 7 -1 15 5 22 a2 2 0 0 1 -1.6 3.2 H43.6 A2 2 0 0 1 42 74 Z"
          />
          <path d="M54 86 a6 6 0 0 0 12 0" />
          <circle cx="88" cy="42" r="5.5" fill="var(--color-accent-400)" stroke="none" />
        }
        @case ('inbox') {
          <!-- Bandeja abierta esperando; nada llegó todavía -->
          <path d="M34 64 l9 -19 h34 l9 19" />
          <path d="M34 64 v18 a6 6 0 0 0 6 6 h40 a6 6 0 0 0 6 -6 v-18 h-15 l-5 8 h-12 l-5 -8 z" />
          <circle cx="60" cy="30" r="5.5" fill="var(--color-accent-400)" stroke="none" />
        }
        @case ('locked') {
          <!-- Candado blando: cuidado también es cuidar quién entra -->
          <path d="M46 58 v-11 a14 14 0 0 1 28 0 v11" />
          <rect x="38" y="58" width="44" height="32" rx="10" />
          <circle cx="60" cy="74" r="5.5" fill="var(--color-accent-400)" stroke="none" />
        }
      }
    </svg>
  `,
})
export class KrIllustration {
  readonly scene = input.required<IllustrationScene>();
  readonly size = input(112);
}
