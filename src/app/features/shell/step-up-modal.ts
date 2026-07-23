import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StepUpStore } from '../../core/auth/step-up.store';
import { KrModal } from '../../shared/ui/kr-modal';
import { KrPasswordInput } from '../../shared/ui/kr-password-input';

/**
 * Re-confirmación de identidad para operaciones sensibles (KER-38, UC-04 A3, NFR-33).
 * Hosteado por AppShell: cualquier pantalla lo dispara vía StepUpStore.require().
 */
@Component({
  selector: 'kr-step-up-modal',
  imports: [FormsModule, KrModal, KrPasswordInput],
  template: `
    @if (stepUp.open()) {
      <kr-modal title="Confirmá tu identidad" (closed)="cancel()">
        <form class="flex flex-col gap-4" (ngSubmit)="confirm()">
          <p class="text-sm text-ink-700">
            Esta operación es sensible: volvé a ingresar tu contraseña para continuar.
          </p>
          @if (stepUp.error(); as err) {
            <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
              {{ err }}
            </p>
          }
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Contraseña</span>
            <kr-password-input
              name="stepUpPassword"
              [(ngModel)]="password"
              autocomplete="current-password"
            />
          </label>
          <div class="flex justify-end gap-3">
            <button
              type="button"
              (click)="cancel()"
              class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-sand-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="stepUp.busy() || password.length === 0"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {{ stepUp.busy() ? 'Verificando…' : 'Confirmar' }}
            </button>
          </div>
        </form>
      </kr-modal>
    }
  `,
})
export class StepUpModal {
  protected readonly stepUp = inject(StepUpStore);
  password = '';

  constructor() {
    // El password nunca queda colgado en memoria de la vista al cerrarse el modal.
    effect(() => {
      if (!this.stepUp.open()) {
        this.password = '';
      }
    });
  }

  confirm(): void {
    this.stepUp.confirm(this.password);
  }

  cancel(): void {
    this.password = '';
    this.stepUp.cancel();
  }
}
