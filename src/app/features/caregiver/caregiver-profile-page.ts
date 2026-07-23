import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MembershipApi } from '../../core/api/membership-api.service';
import {
  ApiError,
  CaregiverProfile,
  MODALITY_LABELS,
  Modality,
  SPECIALTY_LABELS,
  Specialty,
} from '../../core/api/api.types';
import { KrBadge } from '../../shared/ui/kr-badge';

const BADGE_ITEMS = [
  { key: 'certifications' as const, label: 'Certificaciones verificadas' },
  { key: 'identity' as const, label: 'Identidad verificada' },
  { key: 'background' as const, label: 'Antecedentes verificados' },
];

@Component({
  selector: 'kr-caregiver-profile-page',
  imports: [KrBadge, RouterLink],
  template: `
    <div class="max-w-3xl mx-auto flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <h1>Mi perfil profesional</h1>
        <button
          type="button"
          (click)="load()"
          [disabled]="loading()"
          class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2 px-5 hover:bg-primary-50 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Actualizando…' : 'Actualizar' }}
        </button>
      </div>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ err }}</p>
      }

      @if (profile(); as p) {
        <!-- Banner de estado -->
        @switch (p.status) {
          @case ('pending') {
            <div class="rounded-card bg-warning-50 border border-warning-600/25 p-6">
              <p class="text-warning font-semibold text-lg">Tu perfil está en revisión.</p>
              <p class="text-ink-700 mt-1">Te avisamos cuando esté aprobado.</p>
            </div>
          }
          @case ('approved') {
            <div class="rounded-card bg-success-50 border border-success-600/25 p-6">
              <p class="text-success font-semibold text-lg">✓ ¡Perfil aprobado!</p>
              <p class="text-ink-700 mt-1">Ya sos visible en el marketplace.</p>
              <!-- UC-02 A3: editar sin re-aprobación (tarifa efectivo-fechada) -->
              <a
                routerLink="/caregiver/profile/edit"
                class="inline-block mt-3 rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
              >
                Editar perfil
              </a>
            </div>
          }
          @case ('rejected') {
            <div class="rounded-card bg-danger-50 border border-danger-600/25 p-6">
              <p class="text-danger font-semibold text-lg">Tu postulación fue rechazada.</p>
              @if (p.rejectionReason) {
                <p class="text-ink-900 mt-2 bg-surface rounded-control px-3 py-2">
                  Motivo: {{ p.rejectionReason }}
                </p>
              }
              <p class="text-ink-700 mt-2">
                Podés corregir los datos observados y volver a postularte cuando quieras.
              </p>
              <a
                routerLink="/caregiver/onboarding"
                [queryParams]="{ mode: 'resubmit' }"
                class="inline-block mt-3 rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
              >
                Corregir y re-enviar postulación
              </a>
            </div>
          }
          @case ('deactivated') {
            <div class="rounded-card bg-sand-100 border border-ink-300 p-6">
              <p class="text-ink-900 font-semibold text-lg">
                Tu perfil está oculto del marketplace.
              </p>
            </div>
          }
        }

        <!-- Resumen del perfil -->
        <div class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
          <!-- Nombre propio, no título de sección: va en la sans (brand book §4). -->
          <h2 class="font-sans text-lg font-semibold">{{ p.displayName }}</h2>

          <div>
            <p class="text-sm font-medium text-ink-700 mb-2">Especialidades</p>
            <div class="flex flex-wrap gap-2">
              @for (s of p.specialties; track s) {
                <kr-badge tone="primary">{{ specialtyLabel(s) }}</kr-badge>
              }
            </div>
          </div>

          <div class="flex flex-wrap gap-8">
            <div>
              <p class="text-sm font-medium text-ink-700 mb-1">Zona</p>
              <p class="text-ink-900">{{ p.zone }}</p>
            </div>
            <div>
              <p class="text-sm font-medium text-ink-700 mb-1">Modalidades</p>
              <div class="flex flex-wrap gap-2">
                @for (m of p.modalities; track m) {
                  <kr-badge tone="neutral">{{ modalityLabel(m) }}</kr-badge>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Insignias -->
        <div class="bg-surface rounded-card shadow-card p-6">
          <h2 class="text-lg font-semibold mb-4">Insignias</h2>
          <div class="flex flex-col gap-3">
            @for (b of badgeItems; track b.key) {
              <div class="flex items-center justify-between">
                <span class="text-ink-700">{{ b.label }}</span>
                @if (p.badges[b.key]) {
                  <kr-badge tone="success">✓ Verificada</kr-badge>
                } @else {
                  <kr-badge tone="neutral">pendiente</kr-badge>
                }
              </div>
            }
          </div>
        </div>
      } @else if (loading()) {
        <p class="text-ink-500">Cargando tu perfil…</p>
      }
    </div>
  `,
})
export class CaregiverProfilePage {
  private readonly api = inject(MembershipApi);
  private readonly router = inject(Router);

  readonly profile = signal<CaregiverProfile | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly badgeItems = BADGE_ITEMS;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getMyCaregiverProfile().subscribe({
      next: (profile) => {
        this.loading.set(false);
        if (profile === null) {
          void this.router.navigate(['/caregiver/onboarding']);
          return;
        }
        this.profile.set(profile);
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

  modalityLabel(m: string): string {
    return MODALITY_LABELS[m as Modality] ?? m;
  }
}
