import { Component, computed, input } from '@angular/core';

/**
 * Skeleton de carga (KER-21): reemplaza los "Cargando…" de texto plano con
 * bloques que anticipan la forma del contenido. El shimmer es decorativo
 * (se apaga con prefers-reduced-motion, ver .kr-shimmer en styles.css);
 * para lectores de pantalla es un role="status" con texto oculto.
 *
 * Variantes según lo que viene a ocupar el lugar:
 * - cards:   grilla de cards con avatar (marketplace)
 * - metrics: grilla de cards compactas de métricas (dashboard)
 * - list:    filas apiladas (historial, círculo, notificaciones)
 * - detail:  hero con avatar grande + párrafos (fichas/perfiles)
 */
@Component({
  selector: 'kr-skeleton',
  host: { role: 'status', class: 'block' },
  template: `
    <span class="sr-only">Cargando…</span>
    @switch (variant()) {
      @case ('cards') {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
          @for (i of items(); track i) {
            <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-3">
              <div class="flex items-center gap-4">
                <div class="kr-shimmer w-14 h-14 rounded-full shrink-0"></div>
                <div class="flex-1 flex flex-col gap-2">
                  <div class="kr-shimmer h-4 w-3/5 rounded"></div>
                  <div class="kr-shimmer h-3 w-2/5 rounded"></div>
                </div>
              </div>
              <div class="flex gap-1.5">
                <div class="kr-shimmer h-5 w-20 rounded-tag"></div>
                <div class="kr-shimmer h-5 w-24 rounded-tag"></div>
              </div>
              <div class="kr-shimmer h-6 w-2/5 rounded"></div>
            </div>
          }
        </div>
      }
      @case ('metrics') {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          @for (i of items(); track i) {
            <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-2">
              <div class="kr-shimmer h-3.5 w-2/5 rounded"></div>
              <div class="kr-shimmer h-7 w-3/5 rounded"></div>
              <div class="kr-shimmer h-3 w-1/3 rounded"></div>
            </div>
          }
        </div>
      }
      @case ('list') {
        <div class="flex flex-col gap-3" aria-hidden="true">
          @for (i of items(); track i) {
            <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-2">
              <div class="kr-shimmer h-3 w-1/3 rounded"></div>
              <div class="kr-shimmer h-4 w-4/5 rounded"></div>
              <div class="kr-shimmer h-4 w-3/5 rounded"></div>
            </div>
          }
        </div>
      }
      @case ('detail') {
        <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-5" aria-hidden="true">
          <div class="flex items-center gap-5">
            <div class="kr-shimmer w-24 h-24 rounded-full shrink-0"></div>
            <div class="flex-1 flex flex-col gap-2">
              <div class="kr-shimmer h-6 w-1/2 rounded"></div>
              <div class="kr-shimmer h-4 w-1/3 rounded"></div>
              <div class="kr-shimmer h-4 w-2/5 rounded"></div>
            </div>
          </div>
          <div class="flex flex-col gap-2.5">
            <div class="kr-shimmer h-4 w-full rounded"></div>
            <div class="kr-shimmer h-4 w-4/5 rounded"></div>
            <div class="kr-shimmer h-4 w-3/5 rounded"></div>
          </div>
        </div>
      }
    }
  `,
})
export class KrSkeleton {
  readonly variant = input<'cards' | 'metrics' | 'list' | 'detail'>('list');
  readonly count = input(3);
  protected readonly items = computed(() => Array.from({ length: this.count() }, (_, i) => i));
}
