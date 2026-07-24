import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthResponse,
  EmailVerificationConfirmDto,
  EmailVerificationRequestResponse,
  LoginDto,
  LogoutResponse,
  PasswordResetConfirmDto,
  PasswordResetRequestResponse,
  SignupDto,
  StepUpResponse,
} from './api.types';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(dto: LoginDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/login', dto);
  }

  signup(dto: SignupDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/signup', dto);
  }

  /** KER-38 (NFR-41): logout server-side — revoca el token y las push de la sesión. */
  logout(pushEndpoint?: string): Observable<LogoutResponse> {
    return this.http.post<LogoutResponse>('/api/v1/auth/logout', pushEndpoint ? { pushEndpoint } : {});
  }

  /** KER-38 (NFR-33): re-confirma el password y emite el token corto step_up. */
  stepUp(password: string): Observable<StepUpResponse> {
    return this.http.post<StepUpResponse>('/api/v1/auth/step-up', { password });
  }

  /**
   * KER-46 (UC-04 A4): pide el reset de contraseña. Responde SIEMPRE 200 (anti-enumeración):
   * el cliente no debe distinguir un email registrado de uno que no lo está.
   */
  requestPasswordReset(email: string): Observable<PasswordResetRequestResponse> {
    return this.http.post<PasswordResetRequestResponse>('/api/v1/auth/password-reset/request', { email });
  }

  /** KER-46 (UC-04 A4): confirma el reset con el token del email y la contraseña nueva. */
  confirmPasswordReset(dto: PasswordResetConfirmDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/password-reset/confirm', dto);
  }

  /**
   * KER-49 (UC-04 A5): pide/reenvía el email de verificación. Responde SIEMPRE 200
   * (anti-enumeración): el cliente no distingue un email registrado de uno que no lo está.
   */
  requestEmailVerification(email: string): Observable<EmailVerificationRequestResponse> {
    return this.http.post<EmailVerificationRequestResponse>('/api/v1/auth/email-verification/request', { email });
  }

  /** KER-49 (UC-04 A5): confirma la verificación con el token del email (auto-login verificado). */
  confirmEmailVerification(dto: EmailVerificationConfirmDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/email-verification/confirm', dto);
  }
}
