import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  AccountProfile,
  ApiError,
  CaregiverProfile,
  CreateInvitationDto,
  EmittedInvitation,
  Invitation,
  InvitationConfirmed,
  InvitationPreview,
  Patient,
  PatientCircleMember,
  PatientRecord,
  RegisterCaregiverDto,
  RegisterPatientDto,
  UpdateAccountDto,
  UpdateCaregiverProfileDto,
  UpdatePatientDto,
} from './api.types';

@Injectable({ providedIn: 'root' })
export class MembershipApi {
  private readonly http = inject(HttpClient);

  getPatients(): Observable<Patient[]> {
    return this.http.get<Patient[]>('/api/v1/patients');
  }

  /** UC-23 · Mi perfil de cuenta (nombre, email, rol, foto). Cualquier rol lee el suyo. */
  getMyAccount(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>('/api/v1/accounts/me');
  }

  /** UC-23 · Editar mi perfil de cuenta: set parcial de nombre y/o foto (el email no se edita). Sin operationId (naturalmente idempotente). */
  updateMyAccount(dto: UpdateAccountDto): Observable<AccountProfile> {
    return this.http.patch<AccountProfile>('/api/v1/accounts/me', dto);
  }

  registerPatient(dto: RegisterPatientDto): Observable<Patient> {
    return this.http.post<Patient>('/api/v1/patients', dto);
  }

  /** Ficha completa. Cualquier vinculado lee; 403 = sin vínculo con el paciente. */
  getPatientRecord(id: string): Observable<PatientRecord> {
    return this.http.get<PatientRecord>(`/api/v1/patients/${id}`);
  }

  /** Set parcial (mandar SOLO lo que cambia). Solo consent-holder|manager; viewer → 403. Sin operationId. */
  updatePatient(id: string, dto: UpdatePatientDto): Observable<PatientRecord> {
    return this.http.patch<PatientRecord>(`/api/v1/patients/${id}`, dto);
  }

  /** UC-22 · Círculo del paciente. Cualquier vinculado lee; 403 = sin vínculo. */
  getPatientLinks(id: string): Observable<PatientCircleMember[]> {
    return this.http.get<PatientCircleMember[]>(`/api/v1/patients/${id}/links`);
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

  /** Re-postulación tras rechazo: solo desde 'rejected', vuelve a 'pending'. Exige operationId como el alta. */
  resubmitCaregiver(dto: RegisterCaregiverDto): Observable<CaregiverProfile> {
    return this.http.put<CaregiverProfile>('/api/v1/caregivers/me', dto);
  }

  /**
   * UC-02 A3 · Edición del perfil aprobado (solo status approved, sin re-aprobación). Set parcial
   * de foto/disponibilidad/tarifas/zona/modalidades; la tarifa es efectivo-fechada (NFR-03/23),
   * por eso exige operationId. Credenciales (nombre/especialidades/certificaciones) no van acá.
   */
  updateCaregiverProfile(dto: UpdateCaregiverProfileDto): Observable<CaregiverProfile> {
    return this.http.patch<CaregiverProfile>('/api/v1/caregivers/me', dto);
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

  /** UC-03 · Invitaciones emitidas del paciente. Cualquier vinculado lee; 403 = sin vínculo. */
  listInvitations(patientId: string): Observable<EmittedInvitation[]> {
    return this.http.get<EmittedInvitation[]>(`/api/v1/patients/${patientId}/invitations`);
  }

  /** Solo emisor o consent-holder (403 otro vinculado). 400 = ya aceptada; re-revocar es no-op. */
  revokeInvitation(token: string): Observable<EmittedInvitation> {
    return this.http.post<EmittedInvitation>(`/api/v1/invitations/${token}/revoke`, {});
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
