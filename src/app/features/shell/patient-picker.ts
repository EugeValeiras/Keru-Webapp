import {
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Patient } from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';

/**
 * UC-22 · Selector de paciente activo con la identidad de la marca (KER-40).
 * Reemplaza el <select> nativo por un dropdown accesible: botón con avatar +
 * nombre, menú de perfiles como `menuitemradio`. A11y (patrón menu button):
 * aria-haspopup/expanded, foco al ítem seleccionado al abrir, flechas para
 * navegar, Enter/Espacio para elegir, Escape/Tab/click-afuera para cerrar y
 * foco devuelto al disparador. El padre decide cuándo mostrarlo (típicamente
 * con más de un perfil).
 */
@Component({
  selector: 'kr-patient-picker',
  imports: [KrAvatar],
  host: { class: 'relative inline-block', '(keydown.escape)': 'close(true)' },
  template: `
    <button
      #trigger
      type="button"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
      class="flex items-center gap-2 rounded-pill border border-ink-300 bg-surface pl-1 pr-3 py-1 text-sm font-medium text-ink-900 hover:border-primary-400 hover:bg-primary-50 transition-colors max-w-[13rem]"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="'Paciente activo: ' + (activeName() || '—') + '. Cambiar de paciente'"
    >
      <kr-avatar [name]="activeName()" [seed]="activeId() ?? ''" [size]="28" />
      <span class="truncate">{{ activeName() }}</span>
      <!-- Chevron (Lucide "chevron-down"): lineal, currentColor. -->
      <svg
        viewBox="0 0 24 24"
        class="w-4 h-4 shrink-0 text-ink-500 transition-transform"
        [class.rotate-180]="open()"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>

    @if (open()) {
      <!-- Overlay transparente: cierra al click afuera (sin robar el foco). -->
      <div class="fixed inset-0 z-10" (click)="close(false)" aria-hidden="true"></div>

      <div
        #menu
        role="menu"
        aria-label="Elegí un paciente"
        (keydown)="onMenuKeydown($event)"
        class="absolute right-0 top-full mt-2 min-w-[15rem] max-w-[18rem] bg-surface rounded-card shadow-card-hover z-20 py-1.5 overflow-hidden"
      >
        @for (p of patients(); track p.id) {
          <button
            type="button"
            role="menuitemradio"
            [attr.aria-checked]="p.id === activeId()"
            (click)="choose(p.id)"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none transition-colors"
            [class.bg-primary-50]="p.id === activeId()"
          >
            <kr-avatar [name]="p.fullName" [seed]="p.id" [size]="28" />
            <span class="min-w-0 flex-1 truncate font-medium text-ink-900">{{ p.fullName }}</span>
            @if (p.id === activeId()) {
              <!-- Check (Lucide "check") del perfil activo. -->
              <svg
                viewBox="0 0 24 24"
                class="w-4 h-4 shrink-0 text-primary-600"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            }
          </button>
        }
      </div>
    }
  `,
})
export class KrPatientPicker {
  readonly patients = input.required<Patient[]>();
  readonly activeId = input.required<string | null>();
  readonly select = output<string>();

  readonly open = signal(false);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  readonly activeName = computed(
    () => this.patients().find((p) => p.id === this.activeId())?.fullName ?? '',
  );

  toggle(): void {
    this.open() ? this.close(true) : this.openMenu();
  }

  private openMenu(): void {
    this.open.set(true);
    // Foco al perfil activo (o al primero) una vez pintado el menú.
    queueMicrotask(() => this.focusItem(this.activeIndex()));
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

  choose(id: string): void {
    this.select.emit(id);
    this.close(true);
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
    return el ? Array.from(el.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) : [];
  }

  private activeIndex(): number {
    const idx = this.patients().findIndex((p) => p.id === this.activeId());
    return idx < 0 ? 0 : idx;
  }

  private focusItem(index: number): void {
    this.items()[index]?.focus();
  }
}
