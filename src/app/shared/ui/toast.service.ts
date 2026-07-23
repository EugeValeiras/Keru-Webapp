import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

/** Cuánto vive cada toast: los errores duran más porque piden una decisión. */
const DURATION_MS: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  error: 7000,
};

/**
 * Feedback unificado (KER-23): confirma acciones que antes pasaban en silencio
 * o con banners ad-hoc. El outlet <kr-toast-outlet> del shell los muestra.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(tone: ToastTone, message: string): void {
    const id = ++this.seq;
    this.toasts.update((list) => [...list, { id, tone, message }]);
    setTimeout(() => this.dismiss(id), DURATION_MS[tone]);
  }
}
