import { Component, inject, signal } from '@angular/core';
import { AdminApi } from '../../core/api/admin-api.service';
import { ApiError, SweepResult } from '../../core/api/api.types';

@Component({
  selector: 'kr-admin-ops-page',
  template: `
    <div class="max-w-3xl mx-auto flex flex-col gap-6">
      <h1 class="text-2xl font-bold">Operaciones</h1>

      <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
        <div>
          <h2 class="text-lg font-semibold">Barrido del sistema</h2>
          <p class="text-ink-500 mt-1">
            Cierra asignaciones vencidas, expira solicitudes pendientes fuera de fecha y revela las
            reseñas selladas que correspondan.
          </p>
        </div>

        @if (error(); as err) {
          <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{{ err }}</p>
        }

        <button
          type="button"
          (click)="runSweep()"
          [disabled]="loading()"
          class="self-start rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Ejecutando…' : 'Ejecutar barrido ahora' }}
        </button>

        @if (result(); as r) {
          <div class="grid grid-cols-3 gap-4 mt-2">
            <div class="rounded-card bg-primary-50 p-4 text-center">
              <p class="text-3xl font-bold text-primary-700">{{ r.assignmentsClosed }}</p>
              <p class="text-sm text-ink-700 mt-1">Asignaciones cerradas</p>
            </div>
            <div class="rounded-card bg-primary-50 p-4 text-center">
              <p class="text-3xl font-bold text-primary-700">{{ r.requestsExpired }}</p>
              <p class="text-sm text-ink-700 mt-1">Solicitudes expiradas</p>
            </div>
            <div class="rounded-card bg-primary-50 p-4 text-center">
              <p class="text-3xl font-bold text-primary-700">{{ r.revealed }}</p>
              <p class="text-sm text-ink-700 mt-1">Reseñas reveladas</p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class AdminOpsPage {
  private readonly api = inject(AdminApi);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<SweepResult | null>(null);

  runSweep(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.sweep().subscribe({
      next: (r) => {
        this.loading.set(false);
        this.result.set(r);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }
}
