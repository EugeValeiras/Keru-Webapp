import { Component, computed, inject, signal } from '@angular/core';
import { HiringApi } from '../../core/api/hiring-api.service';
import {
  ApiError,
  HIRING_STATUS_LABELS,
  HiringRequest,
  HiringStatus,
  MODALITY_LABELS,
  Modality,
} from '../../core/api/api.types';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { formatDate } from '../../shared/utils/dates';
import { ReputationPanel } from '../reputation/reputation-panel';

const STATUS_ORDER: HiringStatus[] = [
  'pending',
  'accepted',
  'in-progress',
  'declined',
  'finished',
  'expired',
];

const CONTACT_LABELS: Record<string, string> = {
  phone: 'Teléfono',
  email: 'Email',
  address: 'Dirección',
};

@Component({
  selector: 'kr-caregiver-inbox-page',
  imports: [KrAvatar, KrBadge, KrEmptyState, ReputationPanel],
  template: `
    <div class="max-w-3xl mx-auto flex flex-col gap-6">
      <h1 class="text-2xl font-bold">Solicitudes</h1>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{{ err }}</p>
      }

      <!-- Chips de filtro -->
      <div class="flex flex-wrap gap-2">
        @for (s of statusOrder; track s) {
          <button
            type="button"
            (click)="filter.set(s)"
            class="rounded-pill px-4 py-1.5 text-sm font-medium transition-colors"
            [class.bg-primary-600]="filter() === s"
            [class.text-white]="filter() === s"
            [class.bg-surface]="filter() !== s"
            [class.text-ink-700]="filter() !== s"
            [class.shadow-card]="filter() !== s"
          >
            {{ statusLabels[s] }}
          </button>
        }
      </div>

      @if (loading()) {
        <p class="text-ink-500">Cargando solicitudes…</p>
      } @else if (filtered().length === 0) {
        <kr-empty-state icon="📭" title="Sin solicitudes por ahora" />
      } @else {
        @for (r of filtered(); track r.id) {
          <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
            <div class="flex items-center gap-3">
              <kr-avatar [seed]="r.patientId" [name]="r.patientName ?? 'Paciente'" [size]="44" />
              <div class="flex-1">
                <p class="font-semibold">{{ r.patientName ?? 'Paciente' }}</p>
                <p class="text-sm text-ink-500">
                  {{ formatDate(r.startDate) }} → {{ formatDate(r.endDate) }} ·
                  {{ modalityLabel(r.modality) }}
                </p>
              </div>
              <div class="text-right">
                <p class="font-semibold text-primary-700">$ {{ rate(r) }}/hora</p>
                <kr-badge [tone]="statusTone(r.status)">{{ statusLabels[r.status] }}</kr-badge>
              </div>
            </div>

            @if (businessMsg()[r.id]; as msg) {
              <p class="text-sm text-warning bg-amber-50 rounded-lg px-3 py-2">{{ msg }}</p>
            }

            <div class="flex items-center gap-3">
              <button
                type="button"
                (click)="toggleExpand(r.id)"
                class="text-primary-600 text-sm font-medium hover:underline"
              >
                {{ expanded() === r.id ? 'Ocultar detalle' : 'Ver detalle' }}
              </button>

              @if (r.status === 'pending') {
                <span class="flex-1"></span>
                <button
                  type="button"
                  (click)="decline(r)"
                  [disabled]="acting() === r.id"
                  class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2 px-5 hover:bg-red-50 hover:text-danger disabled:opacity-50 transition-colors"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  (click)="accept(r)"
                  [disabled]="acting() === r.id"
                  class="rounded-pill bg-primary-600 text-white font-semibold py-2 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {{ acting() === r.id ? 'Procesando…' : 'Aceptar' }}
                </button>
              }
            </div>

            @if (expanded() === r.id) {
              <div class="border-t border-ink-300 pt-4 flex flex-col gap-4">
                @if (r.specialRequirements) {
                  <div>
                    <h3 class="text-sm font-semibold text-ink-700 mb-1">
                      Requerimientos especiales
                    </h3>
                    <p class="text-sm text-ink-900">{{ r.specialRequirements }}</p>
                  </div>
                }
                @if (contactPairs(r).length > 0) {
                  <div>
                    <h3 class="text-sm font-semibold text-ink-700 mb-1">Contacto para coordinar</h3>
                    @for (pair of contactPairs(r); track pair[0]) {
                      <p class="text-sm text-ink-900">
                        <span class="text-ink-500">{{ contactLabel(pair[0]) }}:</span> {{ pair[1] }}
                      </p>
                    }
                  </div>
                } @else if (r.status === 'pending') {
                  <p class="text-xs text-ink-500">
                    Los datos de contacto se comparten recién cuando aceptás la solicitud.
                  </p>
                }
                <div>
                  <h3 class="text-sm font-semibold text-ink-700 mb-2">Reputación del paciente</h3>
                  <kr-reputation-panel [subjectId]="r.patientId" subjectType="patient" />
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class CaregiverInboxPage {
  private readonly api = inject(HiringApi);

  readonly requests = signal<HiringRequest[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly filter = signal<HiringStatus>('pending');
  readonly expanded = signal<string | null>(null);
  readonly acting = signal<string | null>(null);
  /** Razones de negocio (400) por solicitud: informativas, no rompen la UI. */
  readonly businessMsg = signal<Record<string, string>>({});

  readonly statusOrder = STATUS_ORDER;
  readonly statusLabels = HIRING_STATUS_LABELS;
  readonly formatDate = formatDate;

  readonly filtered = computed(() => this.requests().filter((r) => r.status === this.filter()));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getCaregiverInbox().subscribe({
      next: (items) => {
        this.loading.set(false);
        this.requests.set(items);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  toggleExpand(id: string): void {
    this.expanded.update((cur) => (cur === id ? null : id));
  }

  accept(r: HiringRequest): void {
    this.acting.set(r.id);
    this.businessMsg.update((m) => ({ ...m, [r.id]: '' }));
    this.api.acceptRequest(r.id).subscribe({
      next: () => {
        this.acting.set(null);
        this.load();
      },
      error: (err: ApiError) => {
        this.acting.set(null);
        if (err.statusCode === 400) {
          // Razón de negocio (ej: "Ya existe una asignación activa"), no un crash.
          this.businessMsg.update((m) => ({ ...m, [r.id]: err.message }));
        } else {
          this.error.set(err.message);
        }
      },
    });
  }

  decline(r: HiringRequest): void {
    if (!confirm('¿Rechazar esta solicitud? No se puede deshacer.')) {
      return;
    }
    this.acting.set(r.id);
    this.api.declineRequest(r.id).subscribe({
      next: () => {
        this.acting.set(null);
        this.load();
      },
      error: (err: ApiError) => {
        this.acting.set(null);
        if (err.statusCode === 400) {
          this.businessMsg.update((m) => ({ ...m, [r.id]: err.message }));
        } else {
          this.error.set(err.message);
        }
      },
    });
  }

  rate(r: HiringRequest): number {
    return parseFloat(r.ratePerHourSnapshot);
  }

  /** Pares clave→valor de contactData; solo con solicitud aceptada/en curso (la API no lo manda en pending). */
  contactPairs(r: HiringRequest): [string, string][] {
    if (r.status !== 'accepted' && r.status !== 'in-progress') {
      return [];
    }
    return Object.entries((r.contactData ?? {}) as Record<string, unknown>).map(([k, v]) => [
      k,
      String(v),
    ]);
  }

  contactLabel(key: string): string {
    return CONTACT_LABELS[key] ?? key;
  }

  modalityLabel(m: string): string {
    return MODALITY_LABELS[m as Modality] ?? m;
  }

  statusTone(s: HiringStatus): 'primary' | 'neutral' | 'success' | 'warning' | 'danger' {
    switch (s) {
      case 'pending':
        return 'warning';
      case 'accepted':
      case 'in-progress':
        return 'success';
      case 'declined':
        return 'danger';
      case 'finished':
        return 'primary';
      default:
        return 'neutral';
    }
  }
}
