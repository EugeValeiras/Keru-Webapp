import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import {
  AdminCaregiverDetail,
  ApiError,
  CaregiverStatus,
  DAY_LABELS,
  MODALITY_LABELS,
  Modality,
  SPECIALTY_LABELS,
  Specialty,
} from '../../core/api/api.types';
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

        <!-- Certificaciones -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-3">Certificaciones</h2>
          @if (d.certifications.length === 0) {
            <p class="text-ink-500 text-sm">No declaró certificaciones.</p>
          } @else {
            <ul class="flex flex-col gap-2">
              @for (c of d.certifications; track $index) {
                <li class="text-ink-900">
                  <span class="font-medium">{{ c.type }}</span>
                  <span class="text-ink-500"> — {{ c.institution }}, {{ c.year }}</span>
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
          <div class="flex flex-col gap-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="badge-cert"
                [(ngModel)]="badgeCertifications"
                class="accent-primary-600"
              />
              <span class="text-ink-700">Certificaciones verificadas</span>
            </label>
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

  // Toggles de insignias (ngModel)
  badgeCertifications = false;
  badgeIdentity = false;
  badgeBackground = false;

  rejectReason = '';
  deactivateReason = '';

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
    this.run(
      () =>
        this.api.setBadges(this.id, {
          certifications: this.badgeCertifications,
          identity: this.badgeIdentity,
          background: this.badgeBackground,
        }),
      'Insignias guardadas.',
    );
  }

  approve(): void {
    this.run(() => this.api.approve(this.id), 'Perfil aprobado: ya es visible en el marketplace.');
  }

  reject(): void {
    const reason = this.rejectReason.trim();
    if (!reason || reason.length > 400) {
      return;
    }
    this.run(
      () => this.api.reject(this.id, reason),
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
    action: () => ReturnType<AdminApi['approve']>,
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
