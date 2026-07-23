import { Component, computed, input, output } from '@angular/core';
import { Patient } from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrMenu } from '../../shared/ui/kr-menu';

/**
 * UC-22 · Selector de paciente activo con la identidad de la marca (KER-40). Reemplaza el
 * `<select>` nativo por un dropdown accesible construido sobre el primitivo `kr-menu`
 * (KER-41 lo generalizó para reutilizarlo): botón con avatar + nombre, perfiles como
 * `menuitemradio` con el activo pre-enfocado. El padre decide cuándo mostrarlo
 * (típicamente con más de un perfil).
 */
@Component({
  selector: 'kr-patient-picker',
  imports: [KrAvatar, KrMenu],
  template: `
    <kr-menu
      #m="krMenu"
      [triggerLabel]="'Paciente activo: ' + (activeName() || '—') + '. Cambiar de paciente'"
      menuLabel="Elegí un paciente"
      [openFocusIndex]="activeIndex()"
      triggerClass="flex items-center gap-2 rounded-pill border border-ink-300 bg-surface pl-1 pr-3 py-1 text-sm font-medium text-ink-900 hover:border-primary-400 hover:bg-primary-50 transition-colors max-w-[13rem]"
      panelClass="absolute right-0 top-full mt-2 min-w-[15rem] max-w-[18rem] bg-surface rounded-card shadow-card-hover z-20 py-1.5 overflow-hidden"
    >
      <ng-container ngProjectAs="[menu-trigger]">
        <kr-avatar [name]="activeName()" [seed]="activeId() ?? ''" [size]="28" />
        <span class="truncate">{{ activeName() }}</span>
        <!-- Chevron (Lucide "chevron-down"): lineal, currentColor. -->
        <svg
          viewBox="0 0 24 24"
          class="w-4 h-4 shrink-0 text-ink-500 transition-transform"
          [class.rotate-180]="m.open()"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </ng-container>

      @for (p of patients(); track p.id) {
        <button
          type="button"
          role="menuitemradio"
          [attr.aria-checked]="p.id === activeId()"
          (click)="choose(p.id); m.close(true)"
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
    </kr-menu>
  `,
})
export class KrPatientPicker {
  readonly patients = input.required<Patient[]>();
  readonly activeId = input.required<string | null>();
  readonly select = output<string>();

  readonly activeName = computed(
    () => this.patients().find((p) => p.id === this.activeId())?.fullName ?? '',
  );

  /** Índice del perfil activo: el `kr-menu` lo enfoca al abrir. */
  readonly activeIndex = computed(() => {
    const idx = this.patients().findIndex((p) => p.id === this.activeId());
    return idx < 0 ? 0 : idx;
  });

  choose(id: string): void {
    this.select.emit(id);
  }
}
