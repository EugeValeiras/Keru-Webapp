import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import { ApiError, CaregiverProfile, SPECIALTY_LABELS, Specialty } from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';

@Component({
  selector: 'kr-admin-pending-page',
  imports: [RouterLink, KrAvatar, KrBadge, KrEmptyState],
  template: `
    <div class="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1>Postulaciones</h1>
        @if (!loading()) {
          <p class="text-ink-500 mt-1">
            {{ pending().length }}
            {{ pending().length === 1 ? 'postulación pendiente' : 'postulaciones pendientes' }}
          </p>
        }
      </div>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ err }}</p>
      }

      @if (loading()) {
        <p class="text-ink-500">Cargando cola de revisión…</p>
      } @else if (pending().length === 0) {
        <kr-empty-state
          icon="🎉"
          title="Sin pendientes 🎉"
          subtitle="No hay postulaciones esperando revisión."
        />
      } @else {
        @for (c of pending(); track c.id) {
          <div class="bg-surface rounded-card shadow-card p-6 flex items-center gap-4">
            <kr-avatar [seed]="c.id" [name]="c.displayName" [size]="48" />
            <div class="flex-1 min-w-0">
              <p class="font-semibold">{{ c.displayName }}</p>
              <p class="text-sm text-ink-500">{{ c.zone }}</p>
              <div class="flex flex-wrap gap-1.5 mt-2">
                @for (s of c.specialties; track s) {
                  <kr-badge tone="primary">{{ specialtyLabel(s) }}</kr-badge>
                }
              </div>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span class="text-xs text-warning font-medium">esperando revisión</span>
              <a
                [routerLink]="['/admin/caregivers', c.id]"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-6 hover:bg-primary-700 transition-colors text-sm"
              >
                Revisar
              </a>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class AdminPendingPage {
  private readonly api = inject(AdminApi);

  readonly pending = signal<CaregiverProfile[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getPending().subscribe({
      next: (items) => {
        this.loading.set(false);
        this.pending.set(items);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  specialtyLabel(s: string): string {
    return SPECIALTY_LABELS[s as Specialty] ?? s;
  }
}
