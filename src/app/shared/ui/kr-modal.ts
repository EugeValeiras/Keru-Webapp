import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextModalId = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal simple centrado con backdrop; el padre controla la visibilidad con @if.
 * A11y: focus trap (Tab cicla adentro), Escape cierra, foco inicial en el
 * diálogo y restauración del foco al elemento disparador al cerrar.
 */
@Component({
  selector: 'kr-modal',
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40"
      (click)="onBackdrop($event)"
      (keydown)="onKeydown($event)"
    >
      <div
        #dialog
        tabindex="-1"
        class="bg-surface rounded-card shadow-modal w-full max-h-[90vh] overflow-y-auto p-6 outline-none"
        [style.max-width.px]="width()"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
      >
        <div class="flex items-start justify-between mb-4">
          <h2 [id]="titleId" class="text-lg">{{ title() }}</h2>
          <button
            type="button"
            (click)="closed.emit()"
            class="rounded-full p-1.5 -m-1.5 text-ink-500 hover:text-ink-900 hover:bg-ink-200/60 active:bg-ink-200 text-xl leading-none"
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

  protected readonly titleId = `kr-modal-title-${nextModalId++}`;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly opener =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  constructor() {
    // Foco inicial en el diálogo (no en "Cerrar"): el lector anuncia el título.
    afterNextRender(() => this.dialogRef().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => this.opener?.focus());
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const dialog = this.dialogRef().nativeElement;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
