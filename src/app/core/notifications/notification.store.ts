import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { CareApi } from '../api/care-api.service';
import { AppNotification } from '../api/api.types';
import { AuthStore } from '../auth/auth-store';
import { ToastService } from '../../shared/ui/toast.service';

const POLL_MS = 45_000;

/**
 * Campana in-app. Sin push/SSE/WS en la API: badge por polling de
 * unread-count (pausado con la pestaña oculta), lista bajo demanda.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly api = inject(CareApi);
  private readonly auth = inject(AuthStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly unread = signal(0);
  readonly items = signal<AppNotification[]>([]);
  private timer: ReturnType<typeof setInterval> | null = null;

  startPolling(): void {
    if (this.timer) {
      return;
    }
    this.refreshCount();
    this.timer = setInterval(() => {
      if (!document.hidden && this.auth.isAuthenticated()) {
        this.refreshCount();
      }
    }, POLL_MS);
    const onFocus = () => this.auth.isAuthenticated() && this.refreshCount();
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

  refreshCount(): void {
    this.api.getUnreadCount().subscribe({
      next: ({ unread }) => this.unread.set(unread),
      error: () => undefined, // polling silencioso: no romper la UI por un fallo transitorio
    });
  }

  loadList(): void {
    this.api.getNotifications().subscribe((items) => this.items.set(items));
  }

  /** Optimista: marca local y dispara el POST (nunca falla con 404). */
  markRead(id: string): void {
    const item = this.items().find((n) => n.id === id);
    if (!item || item.read) {
      return;
    }
    this.items.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    this.unread.update((u) => Math.max(0, u - 1));
    this.api.markRead(id).subscribe({ error: () => this.refreshCount() });
  }

  /** Un solo POST idempotente; optimista y re-sincroniza el badge al confirmar. */
  markAllRead(): void {
    if (this.unread() === 0 && this.items().every((n) => n.read)) {
      return;
    }
    this.items.update((list) => list.map((n) => (n.read ? n : { ...n, read: true })));
    this.unread.set(0);
    this.api.markAllRead().subscribe({
      next: () => {
        this.refreshCount();
        this.toast.success('Listo, quedaron todas leídas.');
      },
      error: () => {
        this.refreshCount(); // revierte el optimismo si el server no acompañó
        this.toast.error('No pudimos marcarlas como leídas. Probá de nuevo.');
      },
    });
  }
}
