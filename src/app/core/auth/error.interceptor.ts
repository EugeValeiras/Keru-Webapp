import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toApiError } from '../api/api.types';
import { AuthStore } from './auth-store';

// KER-38: el 401 de step-up (password incorrecto) o de logout (token ya revocado) NO es
// "sesión vencida" — esas llamadas no limpian la sesión ni redirigen.
const AUTH_ENDPOINTS = [
  '/api/v1/auth/login',
  '/api/v1/auth/signup',
  '/api/v1/auth/step-up',
  '/api/v1/auth/logout',
];

/**
 * Normaliza el envelope de error de la API a un ApiError tipado y, ante un 401
 * fuera de login/signup (token vencido — no hay refresh), limpia la sesión y
 * redirige a login conservando la URL de retorno.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }
      const apiError = toApiError(err.status, err.error);
      const isAuthCall = AUTH_ENDPOINTS.some((url) => req.url.startsWith(url));
      if (apiError.statusCode === 401 && !isAuthCall) {
        store.clear();
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url === '/login' ? undefined : router.url },
        });
      }
      return throwError(() => apiError);
    }),
  );
};
