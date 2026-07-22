import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  ApiError,
  CaregiverProfile,
  CreateInvitationDto,
  Invitation,
  InvitationConfirmed,
  InvitationPreview,
  Patient,
  RegisterCaregiverDto,
  RegisterPatientDto,
} from './api.types';

@Injectable({ providedIn: 'root' })
export class MembershipApi {
  private readonly http = inject(HttpClient);

  getPatients(): Observable<Patient[]> {
    return this.http.get<Patient[]>('/api/v1/patients');
  }

  registerPatient(dto: RegisterPatientDto): Observable<Patient> {
    return this.http.post<Patient>('/api/v1/patients', dto);
  }

  /** 404 = "todavía no tiene perfil profesional" (estado, no error) → null. */
  getMyCaregiverProfile(): Observable<CaregiverProfile | null> {
    return this.http.get<CaregiverProfile>('/api/v1/caregivers/me').pipe(
      catchError((err: ApiError) => {
        if (err.statusCode === 404) {
          return of(null);
        }
        throw err;
      }),
    );
  }

  registerCaregiver(dto: RegisterCaregiverDto): Observable<CaregiverProfile> {
    return this.http.post<CaregiverProfile>('/api/v1/caregivers', dto);
  }

  /** Sube una imagen (jpeg/png/webp, máx 5MB); la URL resultante sirve como photoUrl. */
  uploadImage(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ url: string }>('/api/v1/files/images', form);
  }

  /** NO es idempotente: cada POST crea una invitación nueva (no reintentar automático). */
  createInvitation(patientId: string, dto: CreateInvitationDto): Observable<Invitation> {
    return this.http.post<Invitation>(`/api/v1/patients/${patientId}/invitations`, dto);
  }

  /** Público (sin sesión). 404 = token inexistente. */
  getInvitationPreview(token: string): Observable<InvitationPreview> {
    return this.http.get<InvitationPreview>(`/api/v1/invitations/${token}`);
  }

  /** Requiere sesión con el email invitado. 400 usada/expirada, 403 otra cuenta. */
  confirmInvitation(token: string): Observable<InvitationConfirmed> {
    return this.http.post<InvitationConfirmed>(`/api/v1/invitations/${token}/confirm`, {});
  }
}
