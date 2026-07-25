import { Component, computed, input } from '@angular/core';

export type BadgeTone = 'primary' | 'neutral' | 'success' | 'warning' | 'danger' | 'gold';

// Tinte -50 + texto -700 en cada tono, alineado con el patrón de `primary`
// (bg-100 + text-700): el par -50/-700 da ≥6.9:1, holgado AA. El -600 sobre -50
// pasa AA en reposo pero con margen fino (~4.7:1), y ese margen se agotaba cuando
// axe muestreaba el badge a mitad del fade-in de la card del marketplace (opacity
// <1 → colores compuestos con el fondo) → order-flake de la suite (KER-72). El fix
// de raíz de ese flake es la espera del helper axe (email-verification.spec.ts);
// el -700 es el endurecimiento de margen que lo vuelve robusto por diseño.
const TONE_CLASSES: Record<BadgeTone, string> = {
  primary: 'bg-primary-100 text-primary-700',
  neutral: 'bg-sand-100 text-ink-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  // KER-87 · Dorado de "verificada": gold-700 sobre gold-50 = 6.4:1 (AA holgado).
  // Es la variante estática del realce; el brillo (shine) vive en `kr-insignias`.
  gold: 'bg-gold-50 text-gold-700 border border-gold-300',
};

@Component({
  selector: 'kr-badge',
  template: `
    <span
      class="inline-flex items-center rounded-tag px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      [class]="toneClass()"
    >
      <ng-content />
    </span>
  `,
})
export class KrBadge {
  readonly tone = input<BadgeTone>('neutral');
  readonly toneClass = computed(() => TONE_CLASSES[this.tone()]);
}
