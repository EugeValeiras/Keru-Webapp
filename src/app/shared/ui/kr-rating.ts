import { Component, computed, input, model } from '@angular/core';

/** Estrellas 1-5: display (readonly, admite medios) o input interactivo. */
@Component({
  selector: 'kr-rating',
  template: `
    @if (interactive()) {
      <div class="flex gap-1" role="group" aria-label="Calificación">
        @for (star of stars; track star) {
          <button
            type="button"
            (click)="value.set(star)"
            class="leading-none hover:scale-110 active:scale-95"
            [class]="star <= value() ? 'text-accent-500' : 'text-ink-300 hover:text-accent-300'"
            aria-label="Calificar {{ star }} de 5"
            [attr.aria-pressed]="star <= value()"
          >
            <svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor" aria-hidden="true">
              <path [attr.d]="starPath" />
            </svg>
          </button>
        }
      </div>
    } @else {
      <span class="inline-flex items-center gap-1 text-sm">
        <svg viewBox="0 0 24 24" class="w-4 h-4 text-accent-500" fill="currentColor" aria-hidden="true">
          <path [attr.d]="starPath" />
        </svg>
        <span class="font-semibold">{{ display() }}</span>
        @if (count() !== null) {
          <span class="text-ink-500">({{ count() }})</span>
        }
      </span>
    }
  `,
})
export class KrRating {
  /** Estrella del set de iconos (Lucide "star"), rellena con currentColor. */
  readonly starPath =
    'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';
  readonly stars = [1, 2, 3, 4, 5];
  readonly interactive = input(false);
  readonly value = model(0);
  readonly count = input<number | null>(null);
  readonly display = computed(() => (Math.round(this.value() * 10) / 10).toFixed(1));
}
