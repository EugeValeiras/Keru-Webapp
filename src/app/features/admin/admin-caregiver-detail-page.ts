import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { AdminApi } from '../../core/api/admin-api.service';
import {
  AdminCaregiverDetail,
  ApiError,
  CaregiverStatus,
  CertificationView,
  DAY_LABELS,
  MODALITY_LABELS,
  Modality,
  SPECIALTY_LABELS,
  Specialty,
} from '../../core/api/api.types';
import { StepUpStore } from '../../core/auth/step-up.store';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge, BadgeTone } from '../../shared/ui/kr-badge';
import { KrModal } from '../../shared/ui/kr-modal';
import { formatDate } from '../../shared/utils/dates';

const STATUS_LABEL: Record<CaregiverStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  deactivated: 'Desactivado',
};

const STATUS_TONE: Record<CaregiverStatus, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  deactivated: 'neutral',
};

/** KER-52 · Estado por-certificación. */
const CERT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Verificada',
  rejected: 'Rechazada',
};
const CERT_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

@Component({
  selector: 'kr-admin-caregiver-detail-page',
  imports: [FormsModule, KrAvatar, KrBadge, KrModal],
  template: `
    <div class="max-w-3xl mx-auto flex flex-col gap-6">
      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ err }}</p>
      }
      @if (success(); as msg) {
        <p class="text-sm text-success bg-success-50 rounded-control px-3 py-2">{{ msg }}</p>
      }

      @if (loading()) {
        <p class="text-ink-500">Cargando detalle…</p>
      } @else if (detail(); as d) {
        <!-- Header -->
        <div class="bg-surface rounded-card shadow-card p-6 flex items-center gap-4">
          <kr-avatar [seed]="d.id" [name]="d.displayName" [size]="56" />
          <div class="flex-1">
            <div class="flex items-center gap-3">
              <h1>{{ d.displayName }}</h1>
              <kr-badge [tone]="statusTone[d.status]">{{ statusLabel[d.status] }}</kr-badge>
            </div>
            <p class="text-sm text-ink-500 mt-1">Postulación del {{ formatDate(d.createdAt) }}</p>
            @if (d.reviewedBy && d.reviewedAt) {
              <p class="text-sm text-ink-500">
                Revisado por {{ d.reviewedBy }} el {{ formatDate(d.reviewedAt) }}
              </p>
            }
          </div>
        </div>

        @if (d.rejectionReason) {
          <div class="bg-danger-50 border border-danger-600/25 rounded-card p-6">
            <h2 class="font-semibold text-danger mb-1">Motivo de rechazo</h2>
            <p class="text-ink-900">{{ d.rejectionReason }}</p>
          </div>
        }

        <!-- Especialidades -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-3">Especialidades</h2>
          <div class="flex flex-wrap gap-2">
            @for (s of d.specialties; track s) {
              <kr-badge tone="primary">{{ specialtyLabel(s) }}</kr-badge>
            }
          </div>
        </div>

        <!-- Certificaciones (KER-52: revisión por-cert con documento privado) -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-3">Certificaciones</h2>
          @if (d.certifications.length === 0) {
            <p class="text-ink-500 text-sm">No declaró certificaciones.</p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (c of d.certifications; track c.id) {
                <li class="rounded-control border border-ink-200 p-4 flex flex-col gap-2">
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span class="font-medium">{{ c.badgeIcon }} {{ c.label }}</span>
                      <span class="text-ink-500"> — {{ c.institution }}, {{ c.year }}</span>
                    </div>
                    <kr-badge [tone]="certStatusTone(c.status)">{{ certStatusLabel(c.status) }}</kr-badge>
                  </div>
                  @if (c.rejectionReason) {
                    <p class="text-xs text-danger">Motivo: {{ c.rejectionReason }}</p>
                  }
                  <div class="flex flex-wrap gap-2">
                    @if (c.hasDocument) {
                      <button
                        type="button"
                        (click)="downloadDoc(c.id)"
                        class="rounded-pill border border-ink-300 text-ink-700 text-sm font-medium py-1.5 px-4 hover:bg-primary-50 transition-colors"
                      >
                        Ver documento
                      </button>
                    }
                    @if (c.status === 'pending') {
                      <button
                        type="button"
                        (click)="approveCert(c.id)"
                        [disabled]="busy()"
                        class="rounded-pill bg-primary-600 text-white text-sm font-semibold py-1.5 px-4 hover:bg-primary-700 disabled:opacity-50 transition-colors"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        (click)="openRejectCert(c.id)"
                        [disabled]="busy()"
                        class="rounded-pill border border-ink-300 text-danger text-sm font-semibold py-1.5 px-4 hover:bg-danger-50 disabled:opacity-50 transition-colors"
                      >
                        Rechazar
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </div>

        <!-- Disponibilidad -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-3">Disponibilidad</h2>
          @if (d.availability.length === 0) {
            <p class="text-ink-500 text-sm">Sin horarios declarados.</p>
          } @else {
            <ul class="flex flex-col gap-2">
              @for (a of d.availability; track $index) {
                <li class="text-ink-900">
                  <span class="font-medium">{{ dayLabel(a.dayOfWeek) }}</span>
                  <span class="text-ink-500"> · {{ a.from }} a {{ a.to }}</span>
                </li>
              }
            </ul>
          }
        </div>

        <!-- Tarifa -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-3">Tarifa</h2>
          <p class="text-xl font-bold text-primary-700">
            $ {{ d.rates.ratePerHour }}/hora
            <span class="text-sm font-medium text-ink-500">({{ d.rates.currency }})</span>
          </p>
          @if (d.rates.description) {
            <p class="text-ink-500 text-sm mt-1">{{ d.rates.description }}</p>
          }
        </div>

        <!-- Zona y modalidades -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-3">Zona y modalidades</h2>
          <p class="text-ink-900 mb-2">{{ d.zone }}</p>
          <div class="flex flex-wrap gap-2">
            @for (m of d.modalities; track m) {
              <kr-badge tone="neutral">{{ modalityLabel(m) }}</kr-badge>
            }
          </div>
        </div>

        <!-- Insignias -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-3">Insignias</h2>
          <p class="text-xs text-ink-500 mb-3">
            La insignia <strong>Certificaciones verificadas</strong> es automática: se enciende cuando
            aprobás al menos una certificación (arriba). Identidad y antecedentes se marcan acá.
          </p>
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span
                class="inline-flex h-4 w-4 items-center justify-center rounded-sm"
                [class.bg-success]="badgeCertifications"
                [class.bg-ink-200]="!badgeCertifications"
                aria-hidden="true"
              ></span>
              <span class="text-ink-700">
                Certificaciones verificadas
                <span class="text-xs text-ink-500">(derivada: {{ badgeCertifications ? 'sí' : 'no' }})</span>
              </span>
            </div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="badge-identity"
                [(ngModel)]="badgeIdentity"
                class="accent-primary-600"
              />
              <span class="text-ink-700">Identidad verificada</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="badge-background"
                [(ngModel)]="badgeBackground"
                class="accent-primary-600"
              />
              <span class="text-ink-700">Antecedentes verificados</span>
            </label>
          </div>
          <button
            type="button"
            (click)="saveBadges()"
            [disabled]="busy()"
            class="mt-4 rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            Guardar insignias
          </button>
        </div>

        <!-- Acciones -->
        <div class="bg-surface rounded-card shadow-card p-6 flex flex-wrap gap-3">
          @switch (d.status) {
            @case ('pending') {
              <button
                type="button"
                (click)="approve()"
                [disabled]="busy()"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Aprobar
              </button>
              <button
                type="button"
                (click)="rejectOpen.set(true)"
                [disabled]="busy()"
                class="rounded-pill border border-ink-300 text-danger font-semibold py-2.5 px-6 hover:bg-danger-50 disabled:opacity-50 transition-colors"
              >
                Rechazar
              </button>
            }
            @case ('approved') {
              <button
                type="button"
                (click)="deactivateOpen.set(true)"
                [disabled]="busy()"
                class="rounded-pill border border-ink-300 text-ink-700 font-semibold py-2.5 px-6 hover:bg-sand-100 disabled:opacity-50 transition-colors"
              >
                Desactivar
              </button>
            }
            @default {
              <button
                type="button"
                (click)="reactivate()"
                [disabled]="busy()"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Reactivar
              </button>
            }
          }
        </div>
      }

      <!-- Modal rechazo -->
      @if (rejectOpen()) {
        <kr-modal title="Rechazar postulación" (closed)="rejectOpen.set(false)">
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Motivo (obligatorio)</span>
              <textarea
                name="rejectReason"
                rows="4"
                maxlength="400"
                [(ngModel)]="rejectReason"
                placeholder="Ej: Certificación de RCP ilegible"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              ></textarea>
              <span class="text-xs text-ink-500">{{ rejectReason.length }}/400</span>
            </label>
            <div class="flex justify-end gap-3">
              <button
                type="button"
                (click)="rejectOpen.set(false)"
                class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-sand-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                (click)="reject()"
                [disabled]="busy() || rejectReason.trim().length === 0 || rejectReason.length > 400"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {{ busy() ? 'Rechazando…' : 'Confirmar rechazo' }}
              </button>
            </div>
          </div>
        </kr-modal>
      }

      <!-- Modal rechazo de una certificación (KER-52) -->
      @if (certRejectId()) {
        <kr-modal title="Rechazar certificación" (closed)="certRejectId.set(null)">
          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Motivo (obligatorio)</span>
              <textarea
                name="certRejectReason"
                rows="4"
                maxlength="400"
                [(ngModel)]="certRejectReason"
                placeholder="Ej: El documento está ilegible"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              ></textarea>
              <span class="text-xs text-ink-500">{{ certRejectReason.length }}/400</span>
            </label>
            <div class="flex justify-end gap-3">
              <button
                type="button"
                (click)="certRejectId.set(null)"
                class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-sand-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                (click)="rejectCert()"
                [disabled]="busy() || certRejectReason.trim().length === 0"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {{ busy() ? 'Rechazando…' : 'Confirmar rechazo' }}
              </button>
            </div>
          </div>
        </kr-modal>
      }

      <!-- Modal desactivación -->
      @if (deactivateOpen()) {
        <kr-modal title="Desactivar perfil" (closed)="deactivateOpen.set(false)">
          <div class="flex flex-col gap-4">
            <p class="text-sm text-warning bg-warning-50 rounded-control px-3 py-2">
              Desactivar afecta contrataciones activas de forma asincrónica.
            </p>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Motivo (opcional)</span>
              <textarea
                name="deactivateReason"
                rows="3"
                [(ngModel)]="deactivateReason"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              ></textarea>
            </label>
            <div class="flex justify-end gap-3">
              <button
                type="button"
                (click)="deactivateOpen.set(false)"
                class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-sand-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                (click)="deactivate()"
                [disabled]="busy()"
                class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {{ busy() ? 'Desactivando…' : 'Desactivar' }}
              </button>
            </div>
          </div>
        </kr-modal>
      }
    </div>
  `,
})
export class AdminCaregiverDetailPage {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly stepUp = inject(StepUpStore);

  private readonly id = this.route.snapshot.paramMap.get('id')!;

  readonly detail = signal<AdminCaregiverDetail | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly rejectOpen = signal(false);
  readonly deactivateOpen = signal(false);

  readonly statusLabel = STATUS_LABEL;
  readonly statusTone = STATUS_TONE;
  readonly formatDate = formatDate;

  // Insignias: certificaciones es DERIVADA (solo lectura); identidad/antecedentes son toggles.
  badgeCertifications = false;
  badgeIdentity = false;
  badgeBackground = false;

  rejectReason = '';
  deactivateReason = '';

  /** KER-52 · id de la cert que se está rechazando (abre el modal) + su motivo. */
  readonly certRejectId = signal<string | null>(null);
  certRejectReason = '';

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getDetail(this.id).subscribe({
      next: (d) => {
        this.loading.set(false);
        this.detail.set(d);
        this.badgeCertifications = !!d.badges.certifications;
        this.badgeIdentity = !!d.badges.identity;
        this.badgeBackground = !!d.badges.background;
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
      },
    });
  }

  saveBadges(): void {
    // KER-52: la insignia `certifications` es derivada (≥1 cert aprobada); no se setea a mano.
    this.run(
      () =>
        this.api.setBadges(this.id, {
          identity: this.badgeIdentity,
          background: this.badgeBackground,
        }),
      'Insignias guardadas.',
    );
  }

  certStatusLabel(status: string): string {
    return CERT_STATUS_LABEL[status] ?? status;
  }

  certStatusTone(status: string): BadgeTone {
    return CERT_STATUS_TONE[status] ?? 'neutral';
  }

  /** KER-52 (UC-19) · Descarga el documento privado de una cert (solo admin; auditado en backend). */
  downloadDoc(certId: string): void {
    this.error.set(null);
    this.api.downloadCertificationDocument(this.id, certId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (err: ApiError) => this.error.set(err.message),
    });
  }

  /** KER-52 (UC-19) · Aprueba una cert individual (exige step-up). */
  async approveCert(certId: string): Promise<void> {
    const token = await this.stepUp.require();
    if (!token) return;
    this.run(
      () => this.api.approveCertification(this.id, certId, token),
      'Certificación aprobada: su insignia ya se ve en el marketplace.',
    );
  }

  openRejectCert(certId: string): void {
    this.certRejectReason = '';
    this.certRejectId.set(certId);
  }

  /** KER-52 (UC-19 A2) · Rechaza una cert individual con motivo (exige step-up). */
  async rejectCert(): Promise<void> {
    const certId = this.certRejectId();
    const reason = this.certRejectReason.trim();
    if (!certId || !reason) return;
    const token = await this.stepUp.require();
    if (!token) return;
    this.run(
      () => this.api.rejectCertification(this.id, certId, reason, token),
      'Certificación rechazada.',
      () => {
        this.certRejectId.set(null);
        this.certRejectReason = '';
      },
    );
  }

  /** KER-38 (NFR-33): aprobar exige re-confirmación de identidad (step-up). */
  async approve(): Promise<void> {
    const token = await this.stepUp.require();
    if (!token) {
      return; // canceló la re-confirmación
    }
    this.run(() => this.api.approve(this.id, token), 'Perfil aprobado: ya es visible en el marketplace.');
  }

  /** KER-38 (NFR-33): rechazar exige re-confirmación de identidad (step-up). */
  async reject(): Promise<void> {
    const reason = this.rejectReason.trim();
    if (!reason || reason.length > 400) {
      return;
    }
    const token = await this.stepUp.require();
    if (!token) {
      return;
    }
    this.run(
      () => this.api.reject(this.id, reason, token),
      'Postulación rechazada.',
      () => {
        this.rejectOpen.set(false);
        this.rejectReason = '';
      },
    );
  }

  deactivate(): void {
    const reason = this.deactivateReason.trim();
    this.run(
      () => this.api.deactivate(this.id, reason || undefined),
      'Perfil desactivado: quedó oculto del marketplace.',
      () => {
        this.deactivateOpen.set(false);
        this.deactivateReason = '';
      },
    );
  }

  reactivate(): void {
    this.run(() => this.api.reactivate(this.id), 'Perfil reactivado: vuelve a estar aprobado.');
  }

  private run(
    action: () => Observable<unknown>,
    successMsg: string,
    onSuccess?: () => void,
  ): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    action().subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.success.set(successMsg);
        this.load();
      },
      error: (err: ApiError) => {
        this.busy.set(false);
        // El step-up cacheado venció en vuelo: que el próximo intento re-pida el password.
        if (err.code === 'STEP_UP_REQUIRED') {
          this.stepUp.clear();
        }
        this.error.set(err.message);
      },
    });
  }

  specialtyLabel(s: string): string {
    return SPECIALTY_LABELS[s as Specialty] ?? s;
  }

  modalityLabel(m: string): string {
    return MODALITY_LABELS[m as Modality] ?? m;
  }

  dayLabel(day: number): string {
    return DAY_LABELS[day] ?? `Día ${day}`;
  }
}
