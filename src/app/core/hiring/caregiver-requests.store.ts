import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HiringApi } from '../api/hiring-api.service';
import { HiringRequest } from '../api/api.types';
import { AuthStore } from '../auth/auth-store';

const POLL_MS = 60_000;

/**
 * KER-56 · Conteo de solicitudes PENDIENTES del cuidador para el badge de la
 * navegación. Decisión docs-first (mínima): se reutiliza el endpoint existente
 * GET /caregiver/requests y se cuenta status==='pending' en el cliente (la
 * bandeja de un cuidador es chica) — sin endpoint de conteo nuevo ni cambios de
 * contrato. Se refresca al montar el shell, tras aceptar/declinar (la bandeja
 * alimenta el conteo con setFromRequests, sin doble fetch) y por polling suave
 * pausado con la pestaña oculta, igual que la campana (notification.store).
 */
@Injectable({ providedIn: 'root' })
export class CaregiverRequestsStore {
  private readonly api = inject(HiringApi);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly pendingCount = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  startPolling(): void {
    if (this.timer) {
      return;
    }
    this.refresh();
    this.timer = setInterval(() => {
      if (!document.hidden && this.auth.isAuthenticated()) {
        this.refresh();
      }
    }, POLL_MS);
    const onFocus = () => this.auth.isAuthenticated() && this.refresh();
    document.addEventListener('visibilitychange', onFocus);
    this.destroyRef.onDestroy(() => {
      this.stopPolling();
      document.removeEventListener('visibilitychange', onFocus);
    });
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Trae la bandeja y deriva el conteo de pendientes. Silencioso: un fallo transitorio no rompe la UI. */
  refresh(): void {
    this.api.getCaregiverInbox().subscribe({
      next: (items) => this.setFromRequests(items),
      error: () => undefined,
    });
  }

  /** La bandeja ya trae la lista; deriva el conteo sin un segundo request. */
  setFromRequests(items: HiringRequest[]): void {
    this.pendingCount.set(items.filter((r) => r.status === 'pending').length);
  }
}
