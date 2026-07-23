import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/api/auth-api.service';
import { ApiError, homeForRole } from '../../core/api/api.types';
import { AuthStore } from '../../core/auth/auth-store';
import { ToastService } from '../../shared/ui/toast.service';
import { AuthShell } from './auth-shell';

/**
 * UC-04 A5 (KER-49) · Confirmación de la verificación de email: el token llega en el query param
 * del link del email. La pantalla lo consume al cargar (sin pedir nada más). Con token válido la
 * API marca la cuenta verificada y devuelve una sesión nueva (auto-login) → guardamos la sesión y
 * redirigimos al home del rol. Con token inválido/expirado/usado (410) mostramos el error con la
 * salida de reenviar desde la app.
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
