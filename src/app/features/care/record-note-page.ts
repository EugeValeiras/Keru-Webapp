import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CareApi } from '../../core/api/care-api.service';
import { ApiError, RecordNoteDto } from '../../core/api/api.types';
import { newOperationId } from '../../core/idempotency/operation-id';

/** Registro de novedad (nota libre). Montado bajo /app y /caregiver → links relativos. */
@Component({
  selector: 'kr-record-note-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto">
      <a routerLink="../../dashboard" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver al estado actual
      </a>
      <h1 class="text-2xl font-bold mt-2 mb-6">Registrar novedad</h1>

      <form class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4" (ngSubmit)="submit()">
        @if (error(); as err) {
          <div class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">
            <p>{{ err }}</p>
            @for (f of fields(); track f) {
              <p class="mt-1">• {{ f }}</p>
            }
          </div>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">¿Qué pasó?</span>
          <textarea
            name="text"
            rows="5"
            required
            [(ngModel)]="text"
            placeholder="Durmió bien, comió poco en el almuerzo…"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          ></textarea>
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Momento (opcional)</span>
          <input
            type="datetime-local"
            name="measuredAt"
            [(ngModel)]="measuredAt"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <span class="text-xs text-ink-500">Si lo dejás vacío, se registra ahora.</span>
        </label>

        <button
          type="submit"
          [disabled]="loading()"
          class="mt-1 rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ loading() ? 'Guardando…' : 'Guardar novedad' }}
        </button>
      </form>
    </div>
  `,
})
export class RecordNotePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CareApi);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  /** NFR-34: un solo operationId por montaje del form; se reusa en reintentos. */
  private readonly operationId = newOperationId();

  text = '';
  measuredAt = '';

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fields = signal<string[]>([]);

  submit(): void {
    if (this.loading()) {
      return;
    }
    if (!this.text.trim()) {
      this.error.set('Escribí la novedad antes de guardar.');
      this.fields.set([]);
      return;
    }

    const dto: RecordNoteDto = {
      operationId: this.operationId,
      text: this.text.trim(),
      ...(this.measuredAt ? { measuredAt: new Date(this.measuredAt).toISOString() } : {}),
    };

    this.loading.set(true);
    this.error.set(null);
    this.fields.set([]);

    this.api.recordNote(this.patientId, dto).subscribe({
      next: () => {
        void this.router.navigate(['../../dashboard'], { relativeTo: this.route });
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message);
        this.fields.set(err.fields);
      },
    });
  }
}
