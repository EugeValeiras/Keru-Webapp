import { Component, computed, inject, signal } from '@angular/core';
import { AuthApi } from '../../core/api/auth-api.service';
import { AuthStore } from '../../core/auth/auth-store';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * UC-04 A5 (KER-49) · Banner persistente de "verificá tu email" para las cuentas de self-signup
 * que todavía no confirmaron su email. No se puede descartar: se muestra hasta que la cuenta quede
 * verificada (store.emailVerified() sube a true tras confirmar el link). Ofrece reenviar el email
 * (la API responde siempre 200, anti-enumeración) con feedback por toast (KER-23).
 */
@Component({
  selector: 'kr-email-verification-banner',
  template: `
    @if (show()) {
      <div
        class="bg-warning-50 border-b border-warning-600/40"
        role="region"
        aria-label="Verificación de cuenta pendiente"
      >
        <div class="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span class="text-sm text-ink-700 flex-1 min-w-48">
            Verificá tu email para activar tu cuenta. Te enviamos un enlace a
            <strong>{{ store.email() }}</strong>; hasta confirmarlo no vas a poder invitar a otras personas.
          </span>
          <button
            type="button"
            (click)="resend()"
            [disabled]="busy()"
            class="rounded-pill bg-primary-600 text-white text-sm font-medium px-4 py-1.5 hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {{ busy() ? 'Enviando…' : 'Reenviar email' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class EmailVerificationBanner {
  protected readonly store = inject(AuthStore);
  private readonly api = inject(AuthApi);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly show = computed(() => this.store.isAuthenticated() && !this.store.emailVerified());

  resend(): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.api.requestEmailVerification(this.store.email()).subscribe({
      // Anti-enumeración: la API responde siempre 200; el feedback es idéntico pase lo que pase.
      next: () => {
        this.busy.set(false);
        this.toast.info('Te reenviamos el email de verificación. Revisá tu casilla (y el spam).');
      },
      error: () => {
        this.busy.set(false);
        this.toast.error('No pudimos reenviar el email ahora. Probá de nuevo en un minuto.');
      },
    });
  }
}
