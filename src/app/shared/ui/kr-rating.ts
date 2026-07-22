import { Component, computed, input, model } from '@angular/core';

/** Estrellas 1-5: display (readonly, admite medios) o input interactivo. */
@Component({
  selector: 'kr-rating',
  template: `
    @if (interactive()) {
      <div class="flex gap-1">
        @for (star of stars; track star) {
          <button
            type="button"
            (click)="value.set(star)"
            class="text-2xl leading-none transition-transform hover:scale-110"
            [class.opacity-30]="star > value()"
            aria-label="Calificar {{ star }} de 5"
          >
            ⭐
          </button>
        }
      </div>
    } @else {
      <span class="inline-flex items-center gap-1 text-sm">
        <span aria-hidden="true">⭐</span>
        <span class="font-semibold">{{ display() }}</span>
        @if (count() !== null) {
          <span class="text-ink-500">({{ count() }})</span>
        }
      </span>
    }
  `,
})
export class KrRating {
  readonly stars = [1, 2, 3, 4, 5];
  readonly interactive = input(false);
  readonly value = model(0);
  readonly count = input<number | null>(null);
  readonly display = computed(() => (Math.round(this.value() * 10) / 10).toFixed(1));
}
