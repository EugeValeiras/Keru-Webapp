import { Component, input, output } from '@angular/core';

/** Modal simple centrado con backdrop; el padre controla la visibilidad con @if. */
@Component({
  selector: 'kr-modal',
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      (click)="onBackdrop($event)"
    >
      <div
        class="bg-surface rounded-card shadow-card w-full max-h-[90vh] overflow-y-auto p-6"
        [style.max-width.px]="width()"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-start justify-between mb-4">
          <h2 class="text-lg font-semibold">{{ title() }}</h2>
          <button
            type="button"
            (click)="closed.emit()"
            class="text-ink-500 hover:text-ink-900 text-xl leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <ng-content />
      </div>
    </div>
  `,
})
export class KrModal {
  readonly title = input('');
  readonly width = input(480);
  readonly closed = output<void>();

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}
