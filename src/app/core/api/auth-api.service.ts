import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthResponse, LoginDto, SignupDto } from './api.types';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(dto: LoginDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/login', dto);
  }

  signup(dto: SignupDto): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('/api/v1/auth/signup', dto);
  }
}
