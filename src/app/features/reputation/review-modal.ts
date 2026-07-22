import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError, SubmitReviewDto } from '../../core/api/api.types';
import { ReputationApi } from '../../core/api/reputation-api.service';
import { KrModal } from '../../shared/ui/kr-modal';
import { KrRating } from '../../shared/ui/kr-rating';

@Component({
  selector: 'kr-review-modal',
  imports: [FormsModule, KrModal, KrRating],
  template: `
    <kr-modal [title]="title()" (closed)="closed.emit()">
      @if (successMessage(); as msg) {
        <div class="text-center py-4">
          <p class="text-4xl mb-3">{{ revealed() ? '🎉' : '🔒' }}</p>
          <p class="font-medium text-ink-900 mb-6">{{ msg }}</p>
          <button
            type="button"
            (click)="closed.emit()"
            class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
          >
            Listo
          </button>
        </div>
      } @else if (infoMessage(); as msg) {
        <div class="text-center py-4">
          <p class="text-4xl mb-3">ℹ️</p>
          <p class="text-ink-700 bg-primary-50 rounded-lg px-3 py-2 mb-6">{{ msg }}</p>
          <button
            type="button"
            (click)="closed.emit()"
            class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 transition-colors"
          >
            Cerrar
          </button>
        </div>
      } @else {
        <form class="flex flex-col gap-4" (ngSubmit)="submit()">
          @if (error(); as err) {
            <p role="alert" class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{{ err }}</p>
          }

          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">¿Cómo fue la experiencia?</span>
            <kr-rating [interactive]="true" [(value)]="rating" />
          </div>

          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Comentario (opcional)</span>
            <textarea
              name="comment"
              [(ngModel)]="comment"
              rows="4"
              maxlength="1000"
              placeholder="Contanos cómo fue…"
              class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
            ></textarea>
            <span class="text-xs text-ink-500 self-end">{{ comment.length }}/1000</span>
          </label>

          <button
            type="submit"
            [disabled]="submitting() || rating() < 1"
            class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {{ submitting() ? 'Enviando…' : 'Enviar calificación' }}
          </button>
        </form>
      }
    </kr-modal>
  `,
})
export class ReviewModal {
  private readonly api = inject(ReputationApi);

  readonly requestId = input.required<string>();
  readonly mode = input.required<'caregiver' | 'patient'>();
  readonly closed = output<void>();

  readonly title = computed(() =>
    this.mode() === 'caregiver' ? 'Calificar cuidador' : 'Calificar paciente',
  );

  readonly rating = signal(0);
  comment = '';
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly revealed = signal(false);

  submit(): void {
    if (this.submitting() || this.rating() < 1) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    const dto: SubmitReviewDto = {
      rating: this.rating(),
      comment: this.comment.trim() || undefined,
    };
    const call =
      this.mode() === 'caregiver'
        ? this.api.reviewCaregiver(this.requestId(), dto)
        : this.api.reviewPatient(this.requestId(), dto);
    call.subscribe({
      next: (review) => {
        this.submitting.set(false);
        this.revealed.set(review.revealed);
        this.successMessage.set(
          review.revealed
            ? '¡Reseñas publicadas!'
            : 'Tu reseña quedó sellada: se publica cuando la otra parte también califique o a los 14 días.',
        );
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        if (err.statusCode === 400) {
          // "Ya reseñaste" es un estado, no un error agresivo.
          this.infoMessage.set(err.message);
        } else {
          this.error.set(err.message);
        }
      },
    });
  }
}
