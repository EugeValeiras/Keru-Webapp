import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminCaregiverDetail,
  AdminCaregiverList,
  Badges,
  CaregiverProfile,
  CaregiverStatus,
  SweepResult,
} from './api.types';

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
