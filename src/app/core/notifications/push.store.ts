import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CareApi } from '../api/care-api.service';
import { AuthStore } from '../auth/auth-store';
import { SubscribePushDto } from '../api/api.types';

/** applicationServerKey: la clave VAPID viaja base64url y el navegador la quiere en bytes. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Canal Web Push de ESTE navegador (UC-18). El push es siempre adicional: cualquier falla acá
 * (sin soporte, permiso denegado, push service caído, server sin VAPID) degrada en silencio a
 * la campana, que es la garantía (constitution §2.7). En el primer inicio la app ofrece
 * activar el permiso (flujo 1); el rechazo deja solo la campana (A1) y se puede activar
 * después desde la campana misma.
 */
@Injectable({ providedIn: 'root' })
export class PushStore {
  private readonly api = inject(CareApi);
  private readonly auth = inject(AuthStore);

  /** Capacidades del navegador (falso en browsers viejos o contextos no seguros). */
  readonly supported =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window;

  /** El server tiene claves VAPID: hay canal push para ofrecer. */
  readonly serverEnabled = signal(false);
  readonly permission = signal<NotificationPermission>(this.supported ? Notification.permission : 'denied');
  /** Este navegador tiene una suscripción activa registrada en la API. */
  readonly subscribed = signal(false);
  readonly busy = signal(false);

  private readonly promptDismissed = signal(false);
  private publicKey: string | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private initializedFor: string | null = null;

  /** UC-18 flujo 1 · Banner de primer inicio: permiso sin decidir y oferta no descartada. */
  readonly shouldPrompt = computed(
    () =>
      this.supported &&
      this.serverEnabled() &&
      this.permission() === 'default' &&
      !this.subscribed() &&
      !this.promptDismissed(),
  );

  /** Idempotente por cuenta: el shell lo llama en cada inicio de sesión de familia. */
  async init(): Promise<void> {
    const accountId = this.auth.accountId();
    if (!this.supported || !accountId || this.initializedFor === accountId) {
      return;
    }
    this.initializedFor = accountId;
    this.promptDismissed.set(localStorage.getItem(this.dismissKey(accountId)) === '1');
    try {
      const config = await firstValueFrom(this.api.getPushConfig());
      this.publicKey = config.publicKey;
      this.serverEnabled.set(config.enabled && !!config.publicKey);
      if (!this.serverEnabled()) {
        return;
      }
      this.registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await this.registration.pushManager.getSubscription();
      if (existing) {
        // Renueva en la API (upsert idempotente): reasocia la suscripción a esta cuenta.
        await firstValueFrom(this.api.subscribePush(this.toDto(existing)));
        this.subscribed.set(true);
      } else if (this.permission() === 'granted') {
        // Permiso ya otorgado antes (re-login, otro dispositivo limpio): reengancha sin preguntar.
        await this.subscribe();
      }
    } catch {
      // Canal push no disponible: la campana sigue sola (§2.7). Nada que romper.
    }
  }

  /** UC-18 flujo 1 · El usuario acepta desde el banner o desde la campana. */
  async enable(): Promise<void> {
    if (!this.supported || !this.serverEnabled() || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const permission = await Notification.requestPermission();
      this.permission.set(permission);
      if (permission !== 'granted') {
        // A1: rechazo → solo campana; puede reintentar más tarde desde la campana.
        this.dismissPrompt();
        return;
      }
      await this.subscribe();
    } finally {
      this.busy.set(false);
    }
  }

  /** Revoca la suscripción de este navegador (criterio: revocable). La campana sigue. */
  async disable(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const existing = await this.registration?.pushManager.getSubscription();
      if (existing) {
        await firstValueFrom(this.api.unsubscribePush(existing.endpoint));
        await existing.unsubscribe();
      }
      this.subscribed.set(false);
    } catch {
      this.subscribed.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  /** "Ahora no": no volver a ofrecer en esta cuenta; queda la campana y el toggle. */
  dismissPrompt(): void {
    const accountId = this.auth.accountId();
    if (accountId) {
      localStorage.setItem(this.dismissKey(accountId), '1');
    }
    this.promptDismissed.set(true);
  }

  private async subscribe(): Promise<void> {
    if (!this.registration || !this.publicKey) {
      return;
    }
    try {
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(this.publicKey).buffer as ArrayBuffer,
      });
      await firstValueFrom(this.api.subscribePush(this.toDto(subscription)));
      this.subscribed.set(true);
    } catch {
      // El push service no acompañó: solo campana (§2.7).
    }
  }

  /** Solo endpoint+keys: el DTO de la API es estricto (forbidNonWhitelisted). */
  private toDto(subscription: PushSubscription): SubscribePushDto {
    const json = subscription.toJSON();
    return {
      endpoint: json.endpoint ?? subscription.endpoint,
      keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
    };
  }

  private dismissKey(accountId: string): string {
    return `keru.pushPrompt.${accountId}`;
  }
}
