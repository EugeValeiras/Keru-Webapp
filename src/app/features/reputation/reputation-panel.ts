import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ApiError, Reputation } from '../../core/api/api.types';
import { ReputationApi } from '../../core/api/reputation-api.service';
import { KrRating } from '../../shared/ui/kr-rating';
import { formatDate } from '../../shared/utils/dates';

@Component({
  selector: 'kr-reputation-panel',
  imports: [KrRating],
  template: `
    <section class="bg-surface rounded-card shadow-card p-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-semibold">Reputación</h2>
        @if (reputation(); as rep) {
          @if (rep.aggregate.count > 0) {
            <kr-rating [value]="rep.aggregate.average" [count]="rep.aggregate.count" />
          }
        }
      </div>

      @if (error(); as err) {
        <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{{ err }}</p>
      } @else if (!reputation()) {
        <p class="text-sm text-ink-500">Cargando reseñas…</p>
      } @else if (reputation(); as rep) {
        @if (rep.aggregate.count === 0) {
          <p class="text-sm text-ink-500">Todavía sin reseñas.</p>
        } @else {
          <ul class="flex flex-col gap-4">
            @for (review of rep.reviews; track review.id) {
              <li class="border-b border-ink-300/40 last:border-0 pb-4 last:pb-0">
                <div class="flex items-center justify-between gap-3">
                  <kr-rating [value]="review.rating" />
                  <span class="text-xs text-ink-500">{{ format(review.createdAt) }}</span>
                </div>
                @if (review.comment) {
                  <p class="text-sm text-ink-700 mt-1">{{ review.comment }}</p>
                }
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
})
export class ReputationPanel {
  private readonly api = inject(ReputationApi);

  readonly subjectId = input.required<string>();
  readonly subjectType = input.required<'caregiver' | 'patient'>();

  readonly reputation = signal<Reputation | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.subjectId();
      const type = this.subjectType();
      untracked(() => this.load(id, type));
    });
  }

  private load(id: string, type: 'caregiver' | 'patient'): void {
    this.reputation.set(null);
    this.error.set(null);
    const source =
      type === 'caregiver' ? this.api.getCaregiverReputation(id) : this.api.getPatientReputation(id);
    source.subscribe({
      next: (rep) => this.reputation.set(rep),
      error: (err: ApiError) => this.error.set(err.message),
    });
  }

  format(iso: string): string {
    return formatDate(iso);
  }
}
