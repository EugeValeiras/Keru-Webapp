import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError, homeForRole } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthShell } from './auth-shell';

/**
 * UC-04 A5 (KER-49 + KER-63) · Confirmación de la verificación de email según la sesión del browser.
 * El token llega en el query param del link. Antes de consumirlo, hacemos un `peek` (sin efecto) que
 * devuelve el email destino del token, y ramificamos:
 *   - Sin sesión, o sesión de la MISMA cuenta del token → `confirm` (auto-login/renovación) + feedback.
 *   - Sesión de OTRA cuenta → NO cambiamos de identidad en silencio: cerramos sesión y mandamos a
 *     login con el email destino prefilleado + `returnUrl` que retoma la verificación, avisando el
 *     porqué. Al loguearse con la cuenta correcta, vuelve acá —ahora "misma cuenta"— y confirma.
 * Token inválido/expirado/usado (410) → error con la salida de reenviar.
 */
@Component({
  selector: 'kr-email-verify-page',
  imports: [RouterLink, AuthShell],
  template: `
    <kr-auth-shell
      tagline="Verificá tu email."
      subline="Con esto activás del todo tu cuenta de Keru."
    >
      <div class="bg-surface rounded-card shadow-card p-8 flex flex-col gap-4">
        @if (verifying()) {
          <h1 class="text-[1.375rem]">Verificando tu email…</h1>
          <p class="text-sm text-ink-500" role="status">Dame un segundo mientras confirmo el enlace.</p>
        } @else if (done()) {
          <h1 class="text-[1.375rem]">¡Tu email quedó verificado!</h1>
          <p class="text-sm text-ink-500" role="status">Te estamos llevando a tu inicio…</p>
        } @else {
          <h1 class="text-[1.375rem]">No pudimos verificar tu email</h1>
          <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
            <p>{{ error() }}</p>
          </div>
          <p class="text-sm text-ink-500">
            El enlace pudo haber expirado o ya haberse usado. Iniciá sesión y pedí un enlace nuevo
            desde el aviso de "verificá tu email".
          </p>
          <a
            routerLink="/login"
            class="mt-2 text-center rounded-pill bg-primary-600 text-white font-semibold py-2.5 hover:bg-primary-700 transition-colors"
          >
            Ir a iniciar sesión
          </a>
        }
      </div>
    </kr-auth-shell>
  `,
})
export class EmailVerifyPage {
  private readonly api = inject(AuthApi);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly verifying = signal(true);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (!this.token) {
      this.verifying.set(false);
      this.error.set('El enlace de verificación es inválido o expiró.');
      return;
    }
    // Peek (sin efecto): conocemos el email destino ANTES de consumir el token, para ramificar por sesión.
    this.api.peekEmailVerification({ token: this.token }).subscribe({
      next: ({ email }) => this.branchOnSession(email),
      error: (err: ApiError) => {
        this.verifying.set(false);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  /** Ramifica según la sesión activa vs el email destino del token. */
  private branchOnSession(targetEmail: string): void {
    const sessionEmail = this.store.email();
    const sameOrNoSession =
      !this.store.isAuthenticated() || normalizeEmail(sessionEmail) === normalizeEmail(targetEmail);

    if (sameOrNoSession) {
      // Sin sesión → auto-login (KER-49); misma cuenta → renueva la sesión, sin pedir credenciales.
      this.confirmAndEnter();
      return;
    }

    // Otra cuenta: NO cambiamos de identidad en silencio. Cerramos sesión y pedimos credenciales de
    // la cuenta correcta; el returnUrl retoma la verificación tras loguearse (ahí ya será "misma cuenta").
    this.store.clear();
    void this.router.navigate(['/login'], {
      queryParams: {
        email: targetEmail,
        returnUrl: `/verify-email?token=${this.token}`,
        notice: 'Este enlace es de otra cuenta. Iniciá sesión con esa cuenta para verificar el email.',
      },
    });
  }

  private confirmAndEnter(): void {
    this.api.confirmEmailVerification({ token: this.token }).subscribe({
      next: (auth) => {
        this.store.setSession(auth);
        this.verifying.set(false);
        this.done.set(true);
        this.toast.success('Tu email quedó verificado. ¡Bienvenido a Keru!');
        void this.router.navigateByUrl(homeForRole(auth.role));
      },
      error: (err: ApiError) => {
        this.verifying.set(false);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: ApiError): string {
    switch (err.statusCode) {
      case 410:
        return 'Este enlace ya fue usado o expiró.';
      case 429:
        return 'Demasiados intentos. Esperá un minuto y volvé a probar.';
      default:
        return err.message;
    }
  }
}

/** Comparación de emails tolerante a mayúsculas/espacios para decidir "misma cuenta". */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
