import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthResponse, LoginDto, LogoutResponse, SignupDto, StepUpResponse } from './api.types';

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
}
