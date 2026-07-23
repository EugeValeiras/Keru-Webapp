import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import {
  AdminCaregiverList,
  ApiError,
  CaregiverStatus,
  SPECIALTY_LABELS,
} from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';

const STATUS_CHIPS: { value: CaregiverStatus | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobados' },
  { value: 'rejected', label: 'Rechazados' },
  { value: 'deactivated', label: 'Desactivados' },
];

@Component({
  selector: 'kr-admin-caregivers-page',
  imports: [FormsModule, RouterLink, KrAvatar, KrBadge, KrEmptyState],
  template: `
    <h1 class="mb-6">Cuidadores</h1>

    <div class="bg-surface rounded-card shadow-card p-4 mb-6 flex flex-wrap items-center gap-3">
      <div class="flex flex-wrap gap-2">
        @for (chip of statusChips; track chip.label) {
          <button
            type="button"
            (click)="setStatus(chip.value)"
            class="rounded-pill px-4 py-1.5 text-sm font-medium transition-colors"
            [class]="
              status() === chip.value
                ? 'bg-primary-600 text-white'
                : 'bg-primary-50 text-ink-700 hover:bg-primary-100'
            "
          >
            {{ chip.label }}
          </button>
        }
      </div>
      <form class="flex gap-2 ml-auto" (ngSubmit)="search()">
        <input
          type="text"
          name="q"
          [(ngModel)]="query"
          placeholder="Nombre o zona…"
          class="rounded-pill border border-ink-300 px-4 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        <button
          type="submit"
          class="rounded-pill bg-primary-600 text-white text-sm font-semibold px-5 hover:bg-primary-700 transition-colors"
        >
          Buscar
        </button>
      </form>
    </div>

    @if (error(); as err) {
      <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2 mb-4">{{ err }}</p>
    }

    @if (loading()) {
      <p class="text-ink-500 text-sm">Cargando…</p>
    } @else if (result(); as res) {
      @if (res.items.length === 0) {
        <kr-empty-state
          scene="search"
          title="Sin resultados"
          subtitle="Probá con otros filtros o búsqueda."
        />
      } @else {
        <div class="bg-surface rounded-card shadow-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-ink-500 border-b border-ink-300/40">
                  <th class="px-4 py-3 font-medium">Cuidador/a</th>
                  <th class="px-4 py-3 font-medium">Zona</th>
                  <th class="px-4 py-3 font-medium">Especialidades</th>
                  <th class="px-4 py-3 font-medium">Estado</th>
                  <th class="px-4 py-3 font-medium">Insignias</th>
                  <th class="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                @for (c of res.items; track c.id) {
                  <tr class="border-b border-ink-300/20 hover:bg-primary-50/40 transition-colors">
                    <td class="px-4 py-3">
                      <div class="flex items-center gap-3">
                        <kr-avatar [name]="c.displayName" [seed]="c.id" [size]="36" />
                        <span class="font-medium text-ink-900">{{ c.displayName }}</span>
                      </div>
                    </td>
                    <td class="px-4 py-3 text-ink-700">{{ c.zone }}</td>
                    <td class="px-4 py-3 text-ink-700">{{ specialtiesOf(c.specialties) }}</td>
                    <td class="px-4 py-3">
                      <kr-badge [tone]="statusTone(c.status)">{{ statusLabel(c.status) }}</kr-badge>
                    </td>
                    <td class="px-4 py-3">
                      <span [class.opacity-25]="!c.badges.certifications" title="Certificaciones"
                        >📜</span
                      >
                      <span [class.opacity-25]="!c.badges.identity" title="Identidad">🪪</span>
                      <span [class.opacity-25]="!c.badges.background" title="Antecedentes">🛡️</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <a
                        [routerLink]="['/admin/caregivers', c.id]"
                        class="text-primary-600 font-semibold hover:underline"
                      >
                        Ver
                      </a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between px-4 py-3 text-sm text-ink-500">
            <span>{{ res.total }} en total · página {{ res.page }} de {{ totalPages(res) }}</span>
            <div class="flex gap-2">
              <button
                type="button"
                [disabled]="res.page <= 1"
                (click)="goToPage(res.page - 1)"
                class="rounded-pill border border-ink-300 px-4 py-1 disabled:opacity-40 hover:bg-primary-50 transition-colors"
              >
                Anterior
              </button>
              <button
                type="button"
                [disabled]="res.page >= totalPages(res)"
                (click)="goToPage(res.page + 1)"
                class="rounded-pill border border-ink-300 px-4 py-1 disabled:opacity-40 hover:bg-primary-50 transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      }
    }
  `,
})
export class AdminCaregiversPage {
  private readonly api = inject(AdminApi);

  readonly statusChips = STATUS_CHIPS;
  readonly status = signal<CaregiverStatus | null>(null);
  query = '';
  readonly result = signal<AdminCaregiverList | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.fetch(1);
  }

  private fetch(page: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list({ status: this.status() ?? undefined, q: this.query || undefined, page, pageSize: 20 })
      .subscribe({
        next: (res) => {
          this.result.set(res);
          this.loading.set(false);
        },
        error: (err: ApiError) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }

  setStatus(status: CaregiverStatus | null): void {
    this.status.set(status);
    this.fetch(1);
  }

  search(): void {
    this.fetch(1);
  }

  goToPage(page: number): void {
    this.fetch(page);
  }

  totalPages(res: AdminCaregiverList): number {
    return Math.max(1, Math.ceil(res.total / res.pageSize));
  }

  specialtiesOf(specialties: string[]): string {
    const labels = specialties.map(
      (s) => SPECIALTY_LABELS[s as keyof typeof SPECIALTY_LABELS] ?? s,
    );
    return labels.length > 2
      ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
      : labels.join(', ');
  }

  statusLabel(status: CaregiverStatus): string {
    return {
      pending: 'Pendiente',
      approved: 'Aprobado',
      rejected: 'Rechazado',
      deactivated: 'Desactivado',
    }[status];
  }

  statusTone(status: CaregiverStatus): 'warning' | 'success' | 'danger' | 'neutral' {
    return (
      {
        pending: 'warning',
        approved: 'success',
        rejected: 'danger',
        deactivated: 'neutral',
      } as const
    )[status];
  }
}
