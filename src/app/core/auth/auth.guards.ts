import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Role, homeForRole } from '../api/api.types';
import { AuthStore } from './auth-store';

export const authGuard: CanActivateFn = (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (!store.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  // UC-04 A5: una cuenta pendiente de definir su contraseña no puede usar la app hasta setearla.
  if (store.mustSetPassword()) {
    return router.createUrlTree(['/set-password']);
  }
  return true;
};

/**
 * UC-04 A5 · Guarda la pantalla "Definí tu contraseña": exige sesión y estado pendiente. Sin
 * sesión → login; ya con contraseña → home del rol (no tiene nada que hacer acá).
 */
export const setPasswordGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (!store.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (!store.mustSetPassword()) {
    const role = store.role();
    return router.createUrlTree([role ? homeForRole(role) : '/login']);
  }
  return true;
};

/** Restringe un árbol de rutas a ciertos roles; rol equivocado → home de su rol. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const store = inject(AuthStore);
    const router = inject(Router);
    const role = store.role();
    if (role && roles.includes(role)) {
      return true;
    }
    return router.createUrlTree([role ? homeForRole(role) : '/login']);
  };
}
