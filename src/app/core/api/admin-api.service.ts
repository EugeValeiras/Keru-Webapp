import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminCaregiverDetail,
  AdminCaregiverList,
  AdminUpdateCaregiverDto,
  AdminUpdateCertificationDto,
  Badges,
  CaregiverProfile,
  CaregiverStatus,
  CertificationCatalogItem,
  SweepResult,
} from './api.types';

/** KER-52 · Header del token corto de step-up (NFR-33) para operaciones sensibles. */
const stepUpHeaders = (stepUpToken: string) => ({ 'x-step-up-token': stepUpToken });

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  /** Cola FIFO de revisión, sin paginación. */
  getPending(): Observable<CaregiverProfile[]> {
    return this.http.get<CaregiverProfile[]>('/api/v1/admin/caregivers/pending');
  }

  list(opts: { status?: CaregiverStatus; q?: string; page?: number; pageSize?: number } = {}): Observable<AdminCaregiverList> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(opts)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<AdminCaregiverList>('/api/v1/admin/caregivers', { params });
  }

  getDetail(id: string): Observable<AdminCaregiverDetail> {
    return this.http.get<AdminCaregiverDetail>(`/api/v1/admin/caregivers/${id}`);
  }

  /** KER-38 (NFR-33): aprobar es operación sensible — viaja con el token corto de step-up. */
  approve(id: string, stepUpToken: string): Observable<CaregiverProfile> {
    return this.http.post<CaregiverProfile>(`/api/v1/admin/caregivers/${id}/approve`, {}, {
      headers: { 'x-step-up-token': stepUpToken },
    });
  }

  /** KER-38 (NFR-33): rechazar es operación sensible — viaja con el token corto de step-up. */
  reject(id: string, reason: string, stepUpToken: string): Observable<CaregiverProfile> {
    return this.http.post<CaregiverProfile>(`/api/v1/admin/caregivers/${id}/reject`, { reason }, {
      headers: { 'x-step-up-token': stepUpToken },
    });
  }

  setBadges(id: string, badges: Badges): Observable<CaregiverProfile> {
    return this.http.put<CaregiverProfile>(`/api/v1/admin/caregivers/${id}/badges`, badges);
  }

  /**
   * KER-52 (UC-19) · Descarga el documento privado de una certificación (solo admin). Devuelve el
   * binario; el componente arma un object URL para abrirlo. Cada descarga se audita en el backend.
   */
  downloadCertificationDocument(id: string, certId: string): Observable<Blob> {
    return this.http.get(`/api/v1/admin/caregivers/${id}/certifications/${certId}/document`, {
      responseType: 'blob',
    });
  }

  /** KER-52 (UC-19) · Aprueba una certificación (se muestra con su insignia). Exige step-up (NFR-33). */
  approveCertification(id: string, certId: string, stepUpToken: string): Observable<AdminCaregiverDetail> {
    return this.http.post<AdminCaregiverDetail>(
      `/api/v1/admin/caregivers/${id}/certifications/${certId}/approve`,
      {},
      { headers: stepUpHeaders(stepUpToken) },
    );
  }

  /** KER-52 (UC-19 A2) · Rechaza una certificación con motivo. Exige step-up (NFR-33). */
  rejectCertification(
    id: string,
    certId: string,
    reason: string,
    stepUpToken: string,
  ): Observable<AdminCaregiverDetail> {
    return this.http.post<AdminCaregiverDetail>(
      `/api/v1/admin/caregivers/${id}/certifications/${certId}/reject`,
      { reason },
      { headers: stepUpHeaders(stepUpToken) },
    );
  }

  /**
   * #49 (UC-19 A3) · Editar los datos del cuidador (identidad + perfil, set parcial: mandar SOLO lo que
   * cambia). Funciona en cualquier estado y no toca status/insignias. Exige step-up (NFR-33); la tarifa
   * es efectivo-fechada, por eso el DTO lleva operationId.
   */
  update(id: string, patch: AdminUpdateCaregiverDto, stepUpToken: string): Observable<AdminCaregiverDetail> {
    return this.http.patch<AdminCaregiverDetail>(`/api/v1/admin/caregivers/${id}`, patch, {
      headers: stepUpHeaders(stepUpToken),
    });
  }

  /** #49 (UC-19 A3) · Corregir tipo/institución/año de una certificación existente. Exige step-up. */
  updateCertification(
    id: string,
    certId: string,
    patch: AdminUpdateCertificationDto,
    stepUpToken: string,
  ): Observable<AdminCaregiverDetail> {
    return this.http.patch<AdminCaregiverDetail>(
      `/api/v1/admin/caregivers/${id}/certifications/${certId}`,
      patch,
      { headers: stepUpHeaders(stepUpToken) },
    );
  }

  /** #49 (UC-19 A3) · Dar de baja una certificación existente (recalcula la insignia derivada). Exige step-up. */
  removeCertification(id: string, certId: string, stepUpToken: string): Observable<AdminCaregiverDetail> {
    return this.http.delete<AdminCaregiverDetail>(
      `/api/v1/admin/caregivers/${id}/certifications/${certId}`,
      { headers: stepUpHeaders(stepUpToken) },
    );
  }

  /** #49 · Catálogo finito de certificaciones, expuesto al admin para elegir el tipo al editar. */
  getCertificationCatalog(): Observable<CertificationCatalogItem[]> {
    return this.http.get<CertificationCatalogItem[]>('/api/v1/admin/caregivers/certification-catalog');
  }

  deactivate(id: string, reason?: string): Observable<CaregiverProfile> {
    return this.http.post<CaregiverProfile>(`/api/v1/admin/caregivers/${id}/deactivate`, reason ? { reason } : {});
  }

  reactivate(id: string): Observable<CaregiverProfile> {
    return this.http.post<CaregiverProfile>(`/api/v1/admin/caregivers/${id}/reactivate`, {});
  }

  sweep(): Observable<SweepResult> {
    return this.http.post<SweepResult>('/api/v1/admin/ops/sweep', {});
  }
}
