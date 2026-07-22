import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CareApi } from '../../core/api/care-api.service';
import { ApiError, RecordMedicationDto } from '../../core/api/api.types';
import { newOperationId } from '../../core/idempotency/operation-id';

/** Registro de medicación. Montado bajo /app y /caregiver → links relativos. */
@Component({
  selector: 'kr-record-medication-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto">
      <a routerLink="../../dashboard" class="text-sm text-primary-600 font-medium hover:underline">
        ← Volver al estado actual
      </a>
      <h1 class="text-2xl font-bold mt-2 mb-6">Registrar medicación</h1>

      @if (quarantined()) {
        <div role="status" class="bg-amber-50 border border-amber-300 rounded-card p-6 text-sm text-ink-700">
          <p class="font-semibold mb-1">⏳ El registro quedó en cuarentena</p>
          <p>
            Llegó sin una asignación vigente que cubriera su momento de medición. No se descartó
            (NFR-30): el círculo del paciente lo va a revisar para aprobarlo o descartarlo.
          </p>
        </div>
      } @else {
      <form
        class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4"
        (ngSubmit)="submit()"
      >
        @if (error(); as err) {
          <div role="alert" class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">
            <p>{{ err }}</p>
            @for (f of fields(); track f) {
              <p class="mt-1">• {{ f }}</p>
            }
          </div>
        }

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Medicamento</span>
          <input
            type="text"
            name="medication"
            required
            [(ngModel)]="medication"
            placeholder="Enalapril"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Dosis</span>
          <input
            type="text"
            name="dose"
            required
            [(ngModel)]="dose"
            placeholder="10 mg"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Horario (opcional)</span>
          <input
            type="text"
            name="schedule"
            [(ngModel)]="schedule"
            placeholder="08:00"
            class="rounded-lg border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
        </label>

        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium text-ink-700">Observaciones (opcional)</span>
          <textarea
            name="observations"
            rows="3"
            [(ngModel)]="observations"
            placeholder="Tomada con el desayuno"
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
          {{ loading() ? 'Guardando…' : 'Guardar medicación' }}
        </button>
      </form>
      }
    </div>
  `,
})
export class RecordMedicationPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CareApi);

  private readonly patientId = this.route.snapshot.paramMap.get('patientId')!;

  /** NFR-34: un solo operationId por montaje del form; se reusa en reintentos. */
  private readonly operationId = newOperationId();

  medication = '';
  dose = '';
  schedule = '';
  observations = '';
  measuredAt = '';

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fields = signal<string[]>([]);
  /** UC-12 A3 (NFR-30): llegada tardía no autorizada — quedó en cuarentena, no en el historial. */
  protected readonly quarantined = signal(false);

  submit(): void {
    if (this.loading()) {
      return;
    }
    if (!this.medication.trim() || !this.dose.trim()) {
      this.error.set('Completá el medicamento y la dosis.');
      this.fields.set([]);
      return;
    }

    const dto: RecordMedicationDto = {
      operationId: this.operationId,
      medication: this.medication.trim(),
      dose: this.dose.trim(),
      ...(this.schedule.trim() ? { schedule: this.schedule.trim() } : {}),
      ...(this.observations.trim() ? { observations: this.observations.trim() } : {}),
      ...(this.measuredAt ? { measuredAt: new Date(this.measuredAt).toISOString() } : {}),
    };

    this.loading.set(true);
    this.error.set(null);
    this.fields.set([]);

    this.api.recordMedication(this.patientId, dto).subscribe({
      next: (res) => {
        if (res.status === 'quarantined') {
          this.loading.set(false);
          this.quarantined.set(true);
          return;
        }
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
