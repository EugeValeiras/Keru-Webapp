import { Injectable, computed, signal } from '@angular/core';
import { AuthResponse } from '../api/api.types';

const STORAGE_KEY = 'keru.session';

type Session = AuthResponse;

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

/**
 * Sesión JWT stateless: la API no tiene refresh ni logout server-side.
 * Ante cualquier 401 el errorInterceptor llama a clear() y redirige a login.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly session = signal<Session | null>(readStoredSession());

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly role = computed(() => this.session()?.role ?? null);
  readonly displayName = computed(() => this.session()?.displayName ?? '');
  readonly accountId = computed(() => this.session()?.accountId ?? null);
  readonly email = computed(() => this.session()?.email ?? '');
  /** UC-23 · Foto de la cuenta: signal que el header consume para pintar el avatar sin recargar. */
  readonly photoUrl = computed(() => this.session()?.photoUrl ?? null);
  /** UC-04 A5 · Sesión limitada de first-login: la cuenta aún no definió su contraseña. */
  readonly mustSetPassword = computed(() => this.session()?.mustSetPassword === true);

  setSession(auth: AuthResponse): void {
    this.session.set(auth);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  }

  /**
   * UC-23 · Actualiza en la sesión el nombre/foto tras guardar "Mi perfil", para que el header
   * reaccione al instante (sin recargar ni relogin). Solo toca esos campos; no reemite el token.
   */
  updateProfile(patch: { displayName?: string; photoUrl?: string | null }): void {
    const current = this.session();
    if (!current) {
      return;
    }
    const next: Session = {
      ...current,
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.photoUrl !== undefined ? { photoUrl: patch.photoUrl } : {}),
    };
    this.session.set(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  clear(): void {
    this.session.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }
}
