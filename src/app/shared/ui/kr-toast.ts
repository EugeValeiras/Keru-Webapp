import { Component, computed, inject } from '@angular/core';
import { Toast, ToastService } from './toast.service';

// Tinte -50 + texto -700, mismo patrón que kr-badge. El toast entra con un
// fade-in (`.kr-toast` → kr-rise, opacity<1 a mitad de animación), así que el
// texto se compone con el fondo mientras aparece: el -600 sobre -50 pasa AA en
// reposo pero con margen fino (~4.7:1) y se agota en ese muestreo (flake de
// KER-72). El -700 da ≥6.9:1, holgado, y sobrevive al fade-in por diseño.
const TONE_CLASSES: Record<Toast['tone'], string> = {
  success: 'bg-success-50 text-success-700',
  error: 'bg-danger-50 text-danger-700',
  info: 'bg-info-50 text-info-700',
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
