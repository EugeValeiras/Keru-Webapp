import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApiError,
  CaregiverCard,
  MODALITY_LABELS,
  Modality,
  SPECIALTY_LABELS,
  Specialty,
} from '../../core/api/api.types';
import { HiringApi, MarketplaceFilters } from '../../core/api/hiring-api.service';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge } from '../../shared/ui/kr-badge';
import { KrEmptyState } from '../../shared/ui/kr-empty-state';

const BADGE_LABELS: [key: 'certifications' | 'identity' | 'background', label: string][] = [
  ['certifications', 'Certificaciones'],
  ['identity', 'Identidad'],
  ['background', 'Antecedentes'],
];

@Component({
  selector: 'kr-marketplace-page',
  imports: [FormsModule, RouterLink, KrAvatar, KrBadge, KrEmptyState],
  template: `
    <h1 class="text-2xl font-bold mb-4">Encontrá cuidadores</h1>

    <!-- Barra de filtros -->
    <form
      class="bg-surface rounded-card shadow-card p-4 mb-4 flex flex-wrap items-end gap-3"
      (ngSubmit)="search()"
    >
      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-ink-700">Tipo de cuidado</span>
        <select
          name="careType"
          [(ngModel)]="careType"
          class="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          <option value="">Todas</option>
          @for (opt of specialtyOptions; track opt[0]) {
            <option [value]="opt[0]">{{ opt[1] }}</option>
          }
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-ink-700">Modalidad</span>
        <select
          name="modality"
          [(ngModel)]="modality"
          class="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          <option value="">Todas</option>
          @for (opt of modalityOptions; track opt[0]) {
            <option [value]="opt[0]">{{ opt[1] }}</option>
          }
        </select>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-ink-700">Zona</span>
        <input
          name="zone"
          [(ngModel)]="zone"
          placeholder="Zona, ej. Palermo"
          class="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </label>

      <label class="flex flex-col gap-1 w-28">
        <span class="text-xs font-medium text-ink-700">Tarifa mín.</span>
        <input
          type="number"
          name="minRate"
          [(ngModel)]="minRate"
          min="0"
          placeholder="$"
          class="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </label>

      <label class="flex flex-col gap-1 w-28">
        <span class="text-xs font-medium text-ink-700">Tarifa máx.</span>
        <input
          type="number"
          name="maxRate"
          [(ngModel)]="maxRate"
          min="0"
          placeholder="$"
          class="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
      </label>

      <button
        type="submit"
        [disabled]="loading()"
        class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
      >
        Buscar
      </button>

      <button
        type="button"
        (click)="toggleOnlyFavorites()"
        class="rounded-pill border px-4 py-2 text-sm font-medium transition-colors"
        [class]="
          onlyFavorites()
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-surface text-primary-600 border-ink-300 hover:border-primary-600'
        "
      >
        Solo favoritos ♥
      </button>
    </form>

    @if (error(); as err) {
      <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2 mb-4">{{ err }}</p>
    }

    @if (loading()) {
      <p class="text-ink-500 text-sm">Buscando cuidadores…</p>
    } @else if (cards().length === 0) {
      <kr-empty-state
        icon="🔍"
        [title]="onlyFavorites() ? 'Todavía no marcaste favoritos' : 'No encontramos cuidadores'"
        [subtitle]="
          onlyFavorites()
            ? 'Tocá el corazón de una card para guardarla acá.'
            : 'Probá ampliar la zona o cambiar los filtros.'
        "
      />
    } @else {
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        @for (c of cards(); track c.id) {
          <a
            [routerLink]="['/app/marketplace', c.id]"
            class="relative bg-surface rounded-card shadow-card p-6 flex flex-col gap-3 hover:shadow-card-hover transition-shadow"
          >
            <button
              type="button"
              (click)="onHeart($event, c)"
              class="absolute top-4 right-4 text-2xl leading-none transition-transform hover:scale-110"
              [class.text-primary-600]="c.isFavorite"
              [class.text-ink-300]="!c.isFavorite"
              [attr.aria-label]="c.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'"
            >
              {{ c.isFavorite ? '♥' : '♡' }}
            </button>

            <div class="flex items-center gap-4">
              <kr-avatar [name]="c.displayName" [seed]="c.id" [size]="56" />
              <div class="min-w-0 pr-8">
                <p class="font-semibold text-ink-900 truncate">{{ c.displayName }}</p>
                <p class="text-sm text-ink-500 truncate">{{ c.zone }}</p>
              </div>
            </div>

            <div class="flex flex-wrap gap-1.5">
              @for (s of c.specialties.slice(0, 3); track s) {
                <kr-badge tone="primary">{{ specialtyLabel(s) }}</kr-badge>
              }
              @if (c.specialties.length > 3) {
                <kr-badge tone="neutral">+{{ c.specialties.length - 3 }}</kr-badge>
              }
            </div>

            <p class="text-sm text-ink-500">
              @for (m of c.modalities; track m; let last = $last) {
                {{ modalityLabel(m) }}@if (!last) {<span> · </span>}
              }
            </p>

            <p class="text-lg font-bold text-ink-900">
              $ {{ c.ratePerHour }} <span class="text-sm font-medium text-ink-500">{{ c.currency }}/hora</span>
            </p>

            @if (c.badges.certifications || c.badges.identity || c.badges.background) {
              <div class="flex flex-wrap gap-1.5">
                @for (b of badgeLabels; track b[0]) {
                  @if (c.badges[b[0]]) {
                    <kr-badge tone="success">✓ {{ b[1] }}</kr-badge>
                  }
                }
              </div>
            }
          </a>
        }
      </div>
    }
  `,
})
export class MarketplacePage {
  private readonly api = inject(HiringApi);

  protected readonly specialtyOptions = Object.entries(SPECIALTY_LABELS);
  protected readonly modalityOptions = Object.entries(MODALITY_LABELS);
  protected readonly badgeLabels = BADGE_LABELS;

  careType = '';
  modality = '';
  zone = '';
  minRate: number | null = null;
  maxRate: number | null = null;

  readonly cards = signal<CaregiverCard[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly onlyFavorites = signal(false);

  constructor() {
    this.search();
  }

  search(): void {
    this.onlyFavorites.set(false);
    const filters: MarketplaceFilters = {
      careType: (this.careType || undefined) as Specialty | undefined,
      modality: (this.modality || undefined) as Modality | undefined,
      zone: this.zone.trim() || undefined,
      minRatePerHour: this.minRate ?? undefined,
      maxRatePerHour: this.maxRate ?? undefined,
    };
    this.fetch(this.api.searchCaregivers(filters));
  }

  toggleOnlyFavorites(): void {
    const next = !this.onlyFavorites();
    this.onlyFavorites.set(next);
    if (next) {
      this.fetch(this.api.getFavorites(), true);
    } else {
      this.search();
    }
  }

  private fetch(source: ReturnType<HiringApi['searchCaregivers']>, markFavorites = false): void {
    this.loading.set(true);
    this.error.set(null);
    source.subscribe({
      next: (cards) => {
        this.loading.set(false);
        this.cards.set(markFavorites ? cards.map((c) => ({ ...c, isFavorite: true })) : cards);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.cards.set([]);
        this.error.set(err.message);
      },
    });
  }

  onHeart(event: Event, card: CaregiverCard): void {
    event.preventDefault();
    event.stopPropagation();
    const wasFavorite = !!card.isFavorite;
    // Optimista: actualizar YA y revertir si falla.
    this.setFavorite(card.id, !wasFavorite);
    const call = wasFavorite ? this.api.removeFavorite(card.id) : this.api.addFavorite(card.id);
    call.subscribe({
      error: (err: ApiError) => {
        this.setFavorite(card.id, wasFavorite, true);
        this.error.set(err.message);
      },
    });
  }

  private setFavorite(id: string, isFavorite: boolean, revert = false): void {
    this.cards.update((cards) => {
      const updated = cards.map((c) => (c.id === id ? { ...c, isFavorite } : c));
      // En la vista "Solo favoritos", quitar de la lista al des-favoritear (y reponer no aplica: en revert la card ya no está si no revertimos el filtrado — por eso solo filtramos cuando NO es revert).
      if (this.onlyFavorites() && !isFavorite && !revert) {
        return updated.filter((c) => c.id !== id);
      }
      return updated;
    });
    if (this.onlyFavorites() && revert && isFavorite) {
      // Revert de un quitado en la vista favoritos: recargar la lista del server.
      this.fetch(this.api.getFavorites(), true);
    }
  }

  specialtyLabel(s: string): string {
    return SPECIALTY_LABELS[s as Specialty] ?? s;
  }

  modalityLabel(m: string): string {
    return MODALITY_LABELS[m as Modality] ?? m;
  }
}
