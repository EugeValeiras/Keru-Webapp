import { Injectable, inject, signal } from '@angular/core';
import { AuthApi } from '../api/auth-api.service';
import { ApiError } from '../api/api.types';

/** Margen para que un token cacheado no muera en vuelo camino a la API. */
const EXPIRY_MARGIN_SECONDS = 30;

/**
 * Step-up (KER-38, NFR-33): las operaciones sensibles (aprobar/rechazar cuidador, liberar
 * cuarentena) exigen re-confirmar el password. `require()` devuelve un token corto vigente —
 * cacheado mientras dure (~5 min) para no pedir el password en cada acción de una tanda — y
 * abre el modal de re-confirmación (hosteado por AppShell) cuando hace falta.
 */
@Injectable({ providedIn: 'root' })
export class StepUpStore {
  private readonly api = inject(AuthApi);

  /** El modal de re-confirmación está abierto (lo renderiza AppShell). */
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  private resolver: ((token: string | null) => void) | null = null;
  private cached: { token: string; expiresAt: number } | null = null;

  /** Token step_up vigente, pidiendo re-confirmación si no hay uno cacheado. null = canceló. */
  require(): Promise<string | null> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return Promise.resolve(this.cached.token);
    }
    this.error.set(null);
    this.open.set(true);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  /** El usuario confirmó su password en el modal. */
  confirm(password: string): void {
    if (this.busy() || !password) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.stepUp(password).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.cached = {
          token: res.stepUpToken,
          expiresAt: Date.now() + Math.max(res.expiresInSeconds - EXPIRY_MARGIN_SECONDS, 0) * 1000,
        };
        this.open.set(false);
        this.resolver?.(res.stepUpToken);
        this.resolver = null;
      },
      error: (err: ApiError) => {
        this.busy.set(false);
        this.error.set(err.statusCode === 401 ? 'El password no coincide. Probá de nuevo.' : err.message);
      },
    });
  }

  cancel(): void {
    this.open.set(false);
    this.error.set(null);
    this.resolver?.(null);
    this.resolver = null;
  }

  /** Descarta el token cacheado (logout, o la API respondió STEP_UP_REQUIRED igual). */
  clear(): void {
    this.cached = null;
  }
}
