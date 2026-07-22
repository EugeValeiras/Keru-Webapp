import { Component, inject } from '@angular/core';
import { PushStore } from '../../core/notifications/push.store';

/**
 * UC-18 flujo 1 · Oferta de push en el primer inicio: la app pide el permiso del navegador
 * recién cuando el usuario acepta (gesto explícito, mejor señal para el prompt nativo).
 * "Ahora no" (o el rechazo del navegador, A1) deja solo la campana; se puede activar
 * después desde el panel de la campana.
 */
@Component({
  selector: 'kr-push-prompt-banner',
  template: `
    @if (push.shouldPrompt()) {
      <div class="bg-primary-50 border-b border-primary-100" role="region" aria-label="Activar notificaciones push">
        <div class="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span class="text-sm text-ink-700 flex-1 min-w-48">
            ¿Querés recibir las alertas del paciente como notificaciones de este navegador?
            La campana las guarda siempre; el push es un aviso extra.
          </span>
          <button
            type="button"
            (click)="push.enable()"
            [disabled]="push.busy()"
            class="rounded-pill bg-primary-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            Activar notificaciones
          </button>
          <button
            type="button"
            (click)="push.dismissPrompt()"
            class="text-sm font-medium text-ink-500 hover:text-ink-700 transition-colors"
          >
            Ahora no
          </button>
        </div>
      </div>
    }
  `,
})
export class PushPromptBanner {
  readonly push = inject(PushStore);
}
