import { Component, computed, inject } from '@angular/core';
import { Toast, ToastService } from './toast.service';

const TONE_CLASSES: Record<Toast['tone'], string> = {
  success: 'bg-success-50 text-success',
  error: 'bg-danger-50 text-danger',
  info: 'bg-info-50 text-info',
};

/**
 * Outlet de toasts: vive siempre montado en el shell para que las regiones
 * vivas existan ANTES de insertar mensajes (así el lector de pantalla anuncia
 * el contenido nuevo). Dos regiones: polite para confirmaciones, assertive
 * (role="alert") para errores.
 */
@Component({
  selector: 'kr-toast-outlet',
  template: `
    <div
      class="fixed bottom-6 inset-x-0 z-50 px-4 flex flex-col items-center gap-2 pointer-events-none"
    >
      <div role="status" aria-live="polite" class="flex flex-col items-center gap-2">
        @for (t of polite(); track t.id) {
          <div
            class="kr-toast pointer-events-auto flex items-center gap-3 rounded-card shadow-modal px-4 py-3 text-sm font-medium max-w-md {{
              toneClass(t)
            }}"
          >
            <span aria-hidden="true">{{ t.tone === 'success' ? '✓' : 'ℹ' }}</span>
            <span>{{ t.message }}</span>
            <button
              type="button"
              (click)="toasts.dismiss(t.id)"
              aria-label="Cerrar aviso"
              class="leading-none opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        }
      </div>
      <div role="alert" class="flex flex-col items-center gap-2">
        @for (t of alerts(); track t.id) {
          <div
            class="kr-toast pointer-events-auto flex items-center gap-3 rounded-card shadow-modal px-4 py-3 text-sm font-medium max-w-md {{
              toneClass(t)
            }}"
          >
            <span aria-hidden="true">!</span>
            <span>{{ t.message }}</span>
            <button
              type="button"
              (click)="toasts.dismiss(t.id)"
              aria-label="Cerrar aviso"
              class="leading-none opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class KrToastOutlet {
  protected readonly toasts = inject(ToastService);

  protected readonly polite = computed(() => this.toasts.toasts().filter((t) => t.tone !== 'error'));
  protected readonly alerts = computed(() => this.toasts.toasts().filter((t) => t.tone === 'error'));

  protected toneClass(t: Toast): string {
    return TONE_CLASSES[t.tone];
  }
}
