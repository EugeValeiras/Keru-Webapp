import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ApiError,
  HIRING_STATUS_LABELS,
  HiringRequest,
  HiringStatus,
  MODALITY_LABELS,
  Modality,
} from '../../core/api/api.types';
import { HiringApi } from '../../core/api/hiring-api.service';
import { KrBadge, BadgeTone } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { formatDate } from '../../shared/utils/dates';
import { ReviewModal } from '../reputation/review-modal';

const STATUS_TONES: Record<HiringStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'primary',
  'in-progress': 'primary',
  finished: 'success',
  declined: 'danger',
  expired: 'neutral',
};

@Component({
  selector: 'kr-hirings-page',
  imports: [RouterLink, KrBadge, KrEmptyState, ReviewModal],
  template: `
    <h1 class="text-2xl font-bold mb-4">Mis contrataciones</h1>

    @if (error(); as err) {
      <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2 mb-4">{{ err }}</p>
    }

    <!-- Chips de filtro -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        type="button"
        (click)="statusFilter.set(null)"
        class="rounded-pill px-4 py-1.5 text-sm font-medium border transition-colors"
        [class]="
          statusFilter() === null
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-surface text-ink-700 border-ink-300 hover:border-primary-600'
        "
      >
        Todas
      </button>
      @for (opt of statusOptions; track opt[0]) {
        <button
          type="button"
          (click)="statusFilter.set(opt[0])"
          class="rounded-pill px-4 py-1.5 text-sm font-medium border transition-colors"
          [class]="
            statusFilter() === opt[0]
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-surface text-ink-700 border-ink-300 hover:border-primary-600'
          "
        >
          {{ opt[1] }}
        </button>
      }
    </div>

    @if (loading()) {
      <p class="text-ink-500 text-sm">Cargando contrataciones…</p>
    } @else if (filtered().length === 0) {
      <kr-empty-state
        icon="🗓️"
        [title]="
          statusFilter() === null
            ? 'Todavía no tenés contrataciones'
            : 'Nada por acá con ese estado'
        "
        subtitle="Buscá un cuidador y mandá tu primera solicitud."
      >
        <a
          routerLink="/app/marketplace"
          class="inline-block rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
        >
          Ir al marketplace
        </a>
      </kr-empty-state>
    } @else {
      <div class="flex flex-col gap-4">
        @for (r of filtered(); track r.id) {
          <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-semibold text-ink-900">{{ r.caregiverName ?? 'Cuidador/a' }}</p>
                <p class="text-sm text-ink-500">
                  {{ format(r.startDate) }} → {{ format(r.endDate) }} · {{ modalityLabel(r.modality) }}
                </p>
              </div>
              <kr-badge [tone]="toneFor(r.status)">{{ statusLabels[r.status] }}</kr-badge>
            </div>

            <p class="text-sm font-medium text-ink-900">
              $ {{ rate(r.ratePerHourSnapshot) }}/hora
              <span class="text-ink-500 font-normal">(tarifa congelada)</span>
            </p>

            @if (r.status === 'accepted' || r.status === 'in-progress') {
              <div>
                <button
                  type="button"
                  (click)="complete(r)"
                  [disabled]="completingId() === r.id"
                  class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {{ completingId() === r.id ? 'Finalizando…' : 'Finalizar y marcar pagada' }}
                </button>
              </div>
            }
            @if (r.status === 'finished') {
              <div>
                <button
                  type="button"
                  (click)="reviewRequestId.set(r.id)"
                  class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
                >
                  Calificar cuidador
                </button>
              </div>
            }
          </div>
        }
      </div>
    }

    @if (reviewRequestId(); as requestId) {
      <kr-review-modal [requestId]="requestId" mode="caregiver" (closed)="reviewRequestId.set(null)" />
    }
  `,
})
export class HiringsPage {
  private readonly api = inject(HiringApi);

  protected readonly statusOptions = Object.entries(HIRING_STATUS_LABELS) as [HiringStatus, string][];
  protected readonly statusLabels = HIRING_STATUS_LABELS;

  readonly requests = signal<HiringRequest[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusFilter = signal<HiringStatus | null>(null);
  readonly completingId = signal<string | null>(null);
  readonly reviewRequestId = signal<string | null>(null);

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    const list = this.requests();
    return status === null ? list : list.filter((r) => r.status === status);
  });

  constructor() {
    // Refetch siempre al entrar: los estados cambian por barridos del sistema.
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getMyRequests().subscribe({
      next: (requests) => {
        this.loading.set(false);
        this.requests.set(requests);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  complete(r: HiringRequest): void {
    if (this.completingId()) {
      return;
    }
    if (!confirm('¿Finalizar esta contratación y marcarla como pagada?')) {
      return;
    }
    this.completingId.set(r.id);
    this.error.set(null);
    this.api.completeRequest(r.id).subscribe({
      next: () => {
        this.completingId.set(null);
        this.fetch();
      },
      error: (err: ApiError) => {
        this.completingId.set(null);
        this.error.set(err.message);
      },
    });
  }

  toneFor(status: HiringStatus): BadgeTone {
    return STATUS_TONES[status];
  }

  modalityLabel(m: string): string {
    return MODALITY_LABELS[m as Modality] ?? m;
  }

  rate(snapshot: string): number {
    return parseFloat(snapshot);
  }

  format(iso: string): string {
    return formatDate(iso);
  }
}
