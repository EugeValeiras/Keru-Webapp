import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ApiError,
  DAY_LABELS,
  MODALITY_LABELS,
  MarketplaceProfile,
  Modality,
  SPECIALTY_LABELS,
  Specialty,
} from '../../core/api/api.types';
import { HiringApi } from '../../core/api/hiring-api.service';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge } from '../../shared/ui/kr-badge';
import { ReputationPanel } from '../reputation/reputation-panel';

const BADGE_LABELS: [key: 'certifications' | 'identity' | 'background', label: string][] = [
  ['certifications', 'Certificaciones'],
  ['identity', 'Identidad'],
  ['background', 'Antecedentes'],
];

@Component({
  selector: 'kr-caregiver-detail-page',
  imports: [RouterLink, KrAvatar, KrBadge, ReputationPanel],
  template: `
    @if (notFound()) {
      <div class="bg-surface rounded-card shadow-card p-12 text-center max-w-lg mx-auto">
        <p class="text-4xl mb-3">🕊️</p>
        <h1 class="text-lg font-semibold mb-1">Este cuidador ya no está disponible</h1>
        <p class="text-ink-500 text-sm mb-4">
          Puede haber pausado su perfil. Hay más cuidadores esperándote.
        </p>
        <a
          routerLink="/app/marketplace"
          class="inline-block rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
        >
          Volver al marketplace
        </a>
      </div>
    } @else if (error(); as err) {
      <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ err }}</p>
    } @else if (!profile()) {
      <p class="text-ink-500 text-sm">Cargando perfil…</p>
    } @else if (profile(); as p) {
      <div class="max-w-3xl mx-auto flex flex-col gap-4 pb-24">
        <a
          routerLink="/app/marketplace"
          class="text-sm text-primary-600 font-medium hover:underline"
        >
          ← Volver al marketplace
        </a>

        <!-- Hero -->
        <div class="bg-surface rounded-card shadow-card p-6 relative">
          <button
            type="button"
            (click)="toggleFavorite()"
            class="absolute top-5 right-5 text-3xl leading-none transition-transform hover:scale-110"
            [class.text-primary-600]="isFavorite()"
            [class.text-ink-300]="!isFavorite()"
            [attr.aria-label]="isFavorite() ? 'Quitar de favoritos' : 'Agregar a favoritos'"
          >
            {{ isFavorite() ? '♥' : '♡' }}
          </button>

          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <kr-avatar [name]="p.displayName" [seed]="p.id" [size]="96" [photoUrl]="p.photoUrl" />
            <div class="text-center sm:text-left">
              <h1>{{ p.displayName }}</h1>
              <p class="text-ink-500">{{ p.zone }}</p>
              <p class="text-sm text-ink-500 mt-1">
                @for (m of p.modalities; track m; let last = $last) {
                  {{ modalityLabel(m) }}
                  @if (!last) {
                    <span> · </span>
                  }
                }
              </p>
              <div class="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-3">
                @for (b of badgeLabels; track b[0]) {
                  @if (p.badges[b[0]]) {
                    <kr-badge tone="success">✓ {{ b[1] }}</kr-badge>
                  }
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Especialidades -->
        <section class="bg-surface rounded-card shadow-card p-6">
          <h2 class="font-semibold mb-3">Especialidades</h2>
          <div class="flex flex-wrap gap-1.5">
            @for (s of p.specialties; track s) {
              <kr-badge tone="primary">{{ specialtyLabel(s) }}</kr-badge>
            }
          </div>
        </section>

        <!-- Certificaciones -->
        <section class="bg-surface rounded-card shadow-card p-6">
          <h2 class="font-semibold mb-3">Certificaciones</h2>
          @if (p.certifications.length === 0) {
            <p class="text-sm text-ink-500">Sin certificaciones cargadas.</p>
          } @else {
            <ul class="flex flex-col gap-2">
              @for (cert of p.certifications; track $index) {
                <li class="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span class="font-medium text-ink-900">{{ cert.type }}</span>
                    <span class="text-ink-500"> — {{ cert.institution }}, {{ cert.year }}</span>
                  </span>
                  @if (cert.verified) {
                    <kr-badge tone="success">Verificada</kr-badge>
                  }
                </li>
              }
            </ul>
          }
        </section>

        <!-- Disponibilidad -->
        <section class="bg-surface rounded-card shadow-card p-6">
          <h2 class="font-semibold mb-3">Disponibilidad</h2>
          @if (availability().length === 0) {
            <p class="text-sm text-ink-500">Sin horarios cargados.</p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <tbody>
                  @for (slot of availability(); track $index) {
                    <tr class="border-b border-ink-300/40 last:border-0">
                      <td class="py-2 font-medium text-ink-900">{{ dayLabels[slot.dayOfWeek] }}</td>
                      <td class="py-2 text-ink-700 text-right">{{ slot.from }}–{{ slot.to }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <!-- Tarifa -->
        <section class="bg-surface rounded-card shadow-card p-6">
          <h2 class="font-semibold mb-2">Tarifa</h2>
          <p class="text-2xl font-bold text-ink-900">
            $ {{ p.ratePerHour }}
            <span class="text-sm font-medium text-ink-500">{{ p.currency }}/hora</span>
          </p>
          @if (rateDescription(); as desc) {
            <p class="text-sm text-ink-500 mt-1">{{ desc }}</p>
          }
        </section>

        <!-- Reputación -->
        <kr-reputation-panel [subjectId]="p.id" subjectType="caregiver" />

        <!-- CTA -->
        <div class="fixed bottom-0 inset-x-0 bg-surface border-t border-ink-300/50 p-4 z-40">
          <div class="max-w-3xl mx-auto flex items-center justify-between gap-4">
            <p class="font-semibold text-ink-900">
              $ {{ p.ratePerHour }}
              <span class="text-sm font-medium text-ink-500">{{ p.currency }}/hora</span>
            </p>
            <a
              [routerLink]="['/app/marketplace', p.id, 'request']"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
            >
              Solicitar cuidado
            </a>
          </div>
        </div>
      </div>
    }
  `,
})
export class CaregiverDetailPage {
  private readonly api = inject(HiringApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly badgeLabels = BADGE_LABELS;
  protected readonly dayLabels = DAY_LABELS;

  private readonly caregiverId = this.route.snapshot.paramMap.get('caregiverId')!;

  readonly profile = signal<MarketplaceProfile | null>(null);
  readonly notFound = signal(false);
  readonly error = signal<string | null>(null);
  /** isFavorite NO viene en este endpoint: se deriva de getFavorites(). */
  readonly isFavorite = signal(false);

  readonly availability = computed(() =>
    [...(this.profile()?.availability ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek),
  );

  /** El contrato no declara description en el perfil; mostrarla si algún día viene. */
  readonly rateDescription = computed(() => {
    const p = this.profile() as (MarketplaceProfile & { rates?: { description?: string } }) | null;
    return p?.rates?.description ?? null;
  });

  constructor() {
    this.api.getCaregiverProfile(this.caregiverId).subscribe({
      next: (p) => this.profile.set(p),
      error: (err: ApiError) => {
        if (err.statusCode === 404) {
          this.notFound.set(true);
        } else {
          this.error.set(err.message);
        }
      },
    });
    this.api.getFavorites().subscribe({
      next: (favs) => this.isFavorite.set(favs.some((f) => f.id === this.caregiverId)),
      // Si falla, el corazón queda apagado: no bloquea la ficha.
      error: () => undefined,
    });
  }

  toggleFavorite(): void {
    const was = this.isFavorite();
    this.isFavorite.set(!was);
    const call = was
      ? this.api.removeFavorite(this.caregiverId)
      : this.api.addFavorite(this.caregiverId);
    call.subscribe({
      error: (err: ApiError) => {
        this.isFavorite.set(was);
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
