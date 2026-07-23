import { Component, ElementRef, input, signal, viewChild } from '@angular/core';

/**
 * Primitivo de menú accesible (patrón WAI-ARIA "menu button"), extraído del selector de
 * paciente de KER-40 para reutilizarlo (regla del smallest set): botón disparador +
 * panel `role="menu"`. A11y: aria-haspopup/expanded, foco al ítem indicado al abrir,
 * flechas/Home/End para navegar entre `[role^="menuitem"]`, Escape/Tab/click-afuera para
 * cerrar y foco devuelto al disparador (en el cierre por teclado, no en click afuera).
 *
 * El consumidor proyecta el contenido del disparador con `[menu-trigger]` y los ítems
 * (con su `role="menuitem"`/`"menuitemradio"`) como contenido por defecto, y cierra el menú
 * desde el handler del ítem vía la referencia exportada: `#m="krMenu"` … `(click)="…; m.close(true)"`.
 */
@Component({
  selector: 'kr-menu',
  exportAs: 'krMenu',
  host: { class: 'relative inline-block', '(keydown.escape)': 'close(true)' },
  template: `
    <button
      #trigger
      type="button"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
      [class]="triggerClass()"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="triggerLabel()"
    >
      <ng-content select="[menu-trigger]" />
    </button>

    @if (open()) {
      <!-- Overlay transparente: cierra al click afuera (sin robar el foco). -->
      <div class="fixed inset-0 z-10" (click)="close(false)" aria-hidden="true"></div>

      <div
        #menu
        role="menu"
        [attr.aria-label]="menuLabel()"
        (keydown)="onMenuKeydown($event)"
        [class]="panelClass()"
      >
        <ng-content />
      </div>
    }
  `,
})
export class KrMenu {
  /** aria-label del disparador (describe qué abre y su estado). */
  readonly triggerLabel = input.required<string>();
  /** aria-label del panel `role="menu"`. */
  readonly menuLabel = input.required<string>();
  /** Clases del botón disparador (el consumidor define su estilo). */
  readonly triggerClass = input<string>('');
  /** Clases de posicionamiento/estilo del panel. */
  readonly panelClass = input<string>(
    'absolute right-0 top-full mt-2 min-w-[15rem] bg-surface rounded-card shadow-card-hover z-20 py-1.5 overflow-hidden',
  );
  /** Índice del ítem que recibe el foco al abrir (por default el primero). */
  readonly openFocusIndex = input<number>(0);

  readonly open = signal(false);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  toggle(): void {
    this.open() ? this.close(true) : this.openMenu();
  }

  private openMenu(): void {
    this.open.set(true);
    // Foco al ítem indicado una vez pintado el menú.
    queueMicrotask(() => this.focusItem(this.openFocusIndex()));
  }

  /** `refocus`: devolver el foco al disparador (cierre por teclado); no en click afuera. */
  close(refocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (refocus) {
      this.trigger().nativeElement.focus();
    }
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.openMenu();
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const items = this.items();
    if (items.length === 0) {
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusItem((current + 1) % items.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusItem((current - 1 + items.length) % items.length);
        break;
      case 'Home':
        event.preventDefault();
        this.focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusItem(items.length - 1);
        break;
      case 'Tab':
        // Tab saca el foco del menú: cerrarlo y dejar fluir el foco.
        this.close(false);
        break;
    }
  }

  private items(): HTMLElement[] {
    const el = this.menu()?.nativeElement;
    return el
      ? Array.from(el.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'))
      : [];
  }

  private focusItem(index: number): void {
    const items = this.items();
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    items[clamped]?.focus();
  }
}
