import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { CareApi } from '../api/care-api.service';
import { AppNotification } from '../api/api.types';
import { AuthStore } from '../auth/auth-store';
import { PushStore } from './push.store';
import { ToastService } from '../../shared/ui/toast.service';

/**
 * KER-78 (ADR-0004 Fase 1) · Cadencia del polling del badge:
 * - sin push activo → piso corto: el polling es la única frescura del contador.
 * - con push activo → fallback largo: el Web Push ya empuja el refetch inmediato (bridge),
 *   así el polling queda como red de seguridad (degradación graceful, NFR-09) sin castigar la API.
 */
const POLL_FLOOR_MS = 45_000;
const POLL_FALLBACK_MS = 300_000;

/** KER-86 · Tamaño de página de la campana (coincide con el default del API). */
const PAGE_SIZE = 20;

/**
 * Campana in-app. El badge se refresca por polling de unread-count (pausado con la pestaña
 * oculta, refetch on-focus) y, cuando el Web Push está activo, por un empujón inmediato al
 * recibir el push (ADR-0004 Fase 1); el polling permanece como piso garantizado (NFR-09).
 */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly api = inject(CareApi);
  private readonly auth = inject(AuthStore);
  private readonly push = inject(PushStore);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly unread = signal(0);
  readonly items = signal<AppNotification[]>([]);
  /** El panel llegó a cargar la lista: un empujón por push la re-sincroniza en vivo. */
  private readonly listLoaded = signal(false);
  /** La última carga de la lista falló: el panel muestra feedback con reintento (no queda colgado). */
  readonly listError = signal(false);
  /** KER-86 · Cursor de la página siguiente de la campana; null = no hay más para traer. */
  private readonly nextCursor = signal<string | null>(null);
  /** Hay más páginas por traer con "mostrar más". */
  readonly hasMore = computed(() => this.nextCursor() !== null);
  /** Una carga incremental ("mostrar más") está en vuelo: evita doble-submit y da feedback. */
  readonly loadingMore = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  startPolling(): void {
    if (this.timer) {
      return;
    }
    this.refreshCount();
    this.scheduleNext();
    const onFocus = () => this.auth.isAuthenticated() && this.refreshCount();
    document.addEventListener('visibilitychange', onFocus);
    this.destroyRef.onDestroy(() => {
      this.stopPolling();
      document.removeEventListener('visibilitychange', onFocus);
    });
  }

  /**
   * Auto-programa el próximo poll eligiendo el intervalo según haya o no push activo, de modo
   * que activar/desactivar el push en caliente reajusta la cadencia en el siguiente ciclo.
   */
  private scheduleNext(): void {
    const delay = this.push.active() ? POLL_FALLBACK_MS : POLL_FLOOR_MS;
    this.timer = setTimeout(() => {
      if (!document.hidden && this.auth.isAuthenticated()) {
        this.refreshCount();
      }
      this.scheduleNext();
    }, delay);
  }

  stopPolling(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * KER-78 (ADR-0004 Fase 1) · Empujón del Web Push: al recibir un push el SW avisa a la pestaña
   * y el badge se refetchea al instante, sin esperar el ciclo de polling. Best-effort: si no hay
   * sesión no hace nada, y cualquier fallo del fetch queda silencioso (la campana no se rompe).
   */
  pushRefresh(): void {
    if (!this.auth.isAuthenticated()) {
      return;
    }
    this.refreshCount();
    if (this.listLoaded()) {
      this.loadList();
    }
  }

  refreshCount(): void {
    this.api.getUnreadCount().subscribe({
      next: ({ unread }) => this.unread.set(unread),
      error: () => undefined, // polling silencioso: no romper la UI por un fallo transitorio
    });
  }

  /**
   * KER-86 · Carga (o recarga) la PRIMERA página de la campana y resetea el cursor. Abrir el panel
   * o un empujón por push re-sincronizan desde arriba (lo más nuevo); "mostrar más" appendea con
   * loadMore. El contador de no leídas (badge) va por su propio endpoint, intacto.
   */
  loadList(): void {
    this.listError.set(false);
    this.api.getNotifications({ limit: PAGE_SIZE }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.listLoaded.set(true);
        this.listError.set(false);
      },
      error: () => {
        // No dejar la campana colgada: marcá el intento como resuelto y avisá con reintento.
        this.listLoaded.set(true);
        this.listError.set(true);
      },
    });
  }

  /**
   * KER-86 · "Mostrar más": trae la página siguiente por cursor y la appendea (de-dup por id por si
   * un push intercaló algo). Sin cursor o ya cargando, no hace nada. Un fallo no rompe la lista:
   * deja lo cargado y el botón queda para reintentar.
   */
  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) {
      return;
    }
    this.loadingMore.set(true);
    this.api.getNotifications({ limit: PAGE_SIZE, cursor }).subscribe({
      next: (page) => {
        this.items.update((current) => {
          const seen = new Set(current.map((n) => n.id));
          return [...current, ...page.items.filter((n) => !seen.has(n.id))];
        });
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loadingMore.set(false);
      },
    });
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
