import { Injectable, inject } from '@angular/core';
import { NotificationStore } from './notification.store';

/** Forma del mensaje que el service worker emite a las pestañas al recibir un Web Push. */
interface SwPushMessage {
  source: 'keru-sw';
  kind: 'push';
  type?: string;
}

function isSwPushMessage(data: unknown): data is SwPushMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === 'keru-sw' &&
    (data as { kind?: unknown }).kind === 'push'
  );
}

/**
 * KER-78 (ADR-0004 Fase 1) · Puente Web Push → campana. El service worker (`sw.js`), al recibir
 * un push, hace `postMessage` a las pestañas abiertas; este bridge escucha ese mensaje y dispara
 * el refetch inmediato del unread-count (y de la lista si el panel ya la cargó), cerrando la
 * brecha de frescura del badge sin esperar el ciclo de polling (NFR-42).
 *
 * Es aditivo y best-effort: si no hay service worker (browser viejo, contexto no seguro) no se
 * registra nada y el polling sigue siendo la única frescura (NFR-09, degradación graceful). No
 * introduce SSE ni WebSocket: reusa el canal Web Push (VAPID) que ya existe end-to-end (UC-18).
 */
@Injectable({ providedIn: 'root' })
export class PushRefreshBridge {
  private readonly notifications = inject(NotificationStore);
  private started = false;

  /** Idempotente: registra el listener del SW una sola vez por vida de la app. */
  start(): void {
    if (this.started || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    this.started = true;
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      if (isSwPushMessage(event.data)) {
        this.notifications.pushRefresh();
      }
    });
  }
}
