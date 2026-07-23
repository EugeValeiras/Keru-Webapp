import { Component, computed, effect, inject, signal } from '@angular/core';
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
import { ActivePatientStore } from '../../core/patient-context/active-patient.store';
import { KrBadge, BadgeTone } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';
import { KrRating } from '../../shared/ui/kr-rating';
import { formatDate } from '../../shared/utils/dates';
import { ReviewModal } from '../reputation/review-modal';

const STATUS_TONES: Record<HiringStatus, BadgeTone> = {
  pending: 'warning',
  accepted: 'primary',
  'in-progress': 'primary',
  completed: 'success',
  declined: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};

@Component({
  selector: 'kr-hirings-page',
  imports: [RouterLink, KrBadge, KrEmptyState, KrRating, ReviewModal],
  template: `
    <h1 class="mb-4">Mis contrataciones</h1>

    @if (error(); as err) {
      <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2 mb-4">{{ err }}</p>
    }

    <!-- UC-22 (KER-40): el contexto lo gobierna el paciente activo; opción visible "Todos". -->
    @if (multiPatient()) {
      <div class="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Paciente de las contrataciones">
        <span class="text-sm text-ink-500 mr-1">Mostrando:</span>
        <button
          type="button"
          data-testid="scope-patient"
          (click)="patientScope.set('patient')"
          [attr.aria-pressed]="patientScope() === 'patient'"
          class="rounded-pill px-4 py-1.5 text-sm font-medium border transition-colors"
          [class]="
            patientScope() === 'patient'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-surface text-ink-700 border-ink-300 hover:border-primary-600'
          "
        >
          {{ activePatientName() }}
        </button>
        <button
          type="button"
          data-testid="scope-all"
          (click)="patientScope.set('all')"
          [attr.aria-pressed]="patientScope() === 'all'"
          class="rounded-pill px-4 py-1.5 text-sm font-medium border transition-colors"
          [class]="
            patientScope() === 'all'
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-surface text-ink-700 border-ink-300 hover:border-primary-600'
          "
        >
          Todos los pacientes
        </button>
      </div>
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
        [title]="emptyTitle()"
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
                  {{ format(r.startDate) }} → {{ format(r.endDate) }} ·
                  {{ modalityLabel(r.modality) }}
                </p>
                @if (multiPatient()) {
                  <p class="text-sm text-ink-500 mt-0.5" data-testid="card-patient">
                    Paciente: <span class="text-ink-700 font-medium">{{ patientName(r.patientId) }}</span>
                  </p>
                }
              </div>
              <kr-badge [tone]="toneFor(r.status)">{{ statusLabels[r.status] }}</kr-badge>
            </div>

            <p class="text-sm font-medium text-ink-900">
              $ {{ rate(r.ratePerHourSnapshot) }}/hora
              <span class="text-ink-500 font-normal">(tarifa congelada)</span>
            </p>

            @if (r.status === 'pending') {
              <div>
                <button
                  type="button"
                  (click)="cancel(r)"
                  [disabled]="cancellingId() === r.id"
                  class="rounded-pill border border-danger text-danger font-semibold py-2.5 px-6 hover:bg-danger-50 disabled:opacity-50 transition-colors"
                >
                  {{ cancellingId() === r.id ? 'Cancelando…' : 'Cancelar solicitud' }}
                </button>
              </div>
            }
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
            @if (r.status === 'completed') {
              @if (r.myReview; as review) {
                <!-- Ya calificaste: tu reseña en lugar del botón (UC-16: una por parte, KER-39). -->
                <div class="flex flex-col gap-1" data-testid="my-review">
                  <p class="text-sm text-ink-500">Tu calificación</p>
                  <kr-rating [value]="review.rating" />
                  @if (review.comment) {
                    <p class="text-sm text-ink-700 truncate">“{{ review.comment }}”</p>
                  }
                </div>
              } @else {
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
            }
          </div>
        }
      </div>
    }

    @if (reviewRequestId(); as requestId) {
      <kr-review-modal
        [requestId]="requestId"
        mode="caregiver"
        (closed)="closeReview()"
      />
    }
  `,
})
export class HiringsPage {
  private readonly api = inject(HiringApi);
  private readonly patients = inject(ActivePatientStore);

  protected readonly statusOptions = Object.entries(HIRING_STATUS_LABELS) as [
    HiringStatus,
    string,
  ][];
  protected readonly statusLabels = HIRING_STATUS_LABELS;

  readonly requests = signal<HiringRequest[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly statusFilter = signal<HiringStatus | null>(null);
  readonly completingId = signal<string | null>(null);
  readonly cancellingId = signal<string | null>(null);
  readonly reviewRequestId = signal<string | null>(null);

  /** UC-22: la vista respeta el paciente activo; 'all' es la vista global opt-in. */
  readonly patientScope = signal<'patient' | 'all'>('patient');

  readonly multiPatient = computed(() => this.patients.patients().length > 1);
  readonly activePatientName = computed(() => this.patients.activePatient()?.fullName ?? 'Paciente');

  private readonly patientNames = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.patients.patients()) {
      map.set(p.id, p.fullName);
    }
    return map;
  });

  readonly emptyTitle = computed(() => {
    if (this.statusFilter() !== null) {
      return 'Nada por acá con ese estado';
    }
    if (this.multiPatient() && this.patientScope() === 'patient') {
      return `${this.activePatientName()} todavía no tiene contrataciones`;
    }
    return 'Todavía no tenés contrataciones';
  });

  readonly filtered = computed(() => {
    const status = this.statusFilter();
    // Solo hay ambigüedad de contexto con más de un paciente (UC-22 A2).
    const scopeToPatient = this.multiPatient() && this.patientScope() === 'patient';
    const activeId = this.patients.activePatientId();
    return this.requests().filter((r) => {
      if (status !== null && r.status !== status) {
        return false;
      }
      if (scopeToPatient && activeId && r.patientId !== activeId) {
        return false;
      }
      return true;
    });
  });

  constructor() {
    // El shell ya carga los perfiles; idempotente por si se entra directo acá.
    this.patients.load();
    // Refetch siempre al entrar: los estados cambian por barridos del sistema.
    this.fetch();
    // Elegir un paciente en el selector devuelve el contexto a ese paciente
    // (aunque se estuviera viendo "Todos"): cambiar el selector filtra la lista.
    effect(() => {
      this.patients.activePatientId();
      this.patientScope.set('patient');
    });
  }

  patientName(id: string): string {
    return this.patientNames().get(id) ?? 'Paciente';
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

  closeReview(): void {
    this.reviewRequestId.set(null);
    // Refetch: si acaba de calificar, la card pasa a mostrar su reseña en vez del botón (KER-39).
    this.fetch();
  }

  cancel(r: HiringRequest): void {
    if (this.cancellingId()) {
      return;
    }
    if (!confirm('¿Cancelar esta solicitud? El cuidador dejará de verla.')) {
      return;
    }
    this.cancellingId.set(r.id);
    this.error.set(null);
    this.api.cancelRequest(r.id).subscribe({
      next: () => {
        this.cancellingId.set(null);
        this.fetch();
      },
      error: (err: ApiError) => {
        this.cancellingId.set(null);
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
