import { Component, computed, input } from '@angular/core';

export type BadgeTone = 'primary' | 'neutral' | 'success' | 'warning' | 'danger';

const TONE_CLASSES: Record<BadgeTone, string> = {
  primary: 'bg-primary-100 text-primary-700',
  neutral: 'bg-gray-100 text-ink-700',
  success: 'bg-emerald-50 text-success',
  warning: 'bg-amber-50 text-warning',
  danger: 'bg-red-50 text-danger',
};

@Component({
  selector: 'kr-badge',
  template: `
    <span
      class="inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
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
