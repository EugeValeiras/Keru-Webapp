import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CaregiverCard,
  CaregiverHistoryItem,
  CreateRequestDto,
  HiringRequest,
  MarketplaceProfile,
  Modality,
  Specialty,
} from './api.types';

export interface MarketplaceFilters {
  careType?: Specialty;
  modality?: Modality;
  zone?: string;
  minRatePerHour?: number;
  maxRatePerHour?: number;
}

@Injectable({ providedIn: 'root' })
export class HiringApi {
  private readonly http = inject(HttpClient);

  searchCaregivers(filters: MarketplaceFilters = {}): Observable<CaregiverCard[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<CaregiverCard[]>('/api/v1/marketplace/caregivers', { params });
  }

  /** Ojo: isFavorite NO viene poblado acá; derivarlo de getFavorites(). */
  getCaregiverProfile(id: string): Observable<MarketplaceProfile> {
    return this.http.get<MarketplaceProfile>(`/api/v1/marketplace/caregivers/${id}`);
  }

  getFavorites(): Observable<CaregiverCard[]> {
    return this.http.get<CaregiverCard[]>('/api/v1/favorites');
  }

  addFavorite(caregiverId: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`/api/v1/favorites/${caregiverId}`, {});
  }

  removeFavorite(caregiverId: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/api/v1/favorites/${caregiverId}`);
  }

  createRequest(dto: CreateRequestDto): Observable<HiringRequest> {
    return this.http.post<HiringRequest>('/api/v1/hiring-requests', dto);
  }

  /** Lado demanda. Sin filtros server-side. */
  getMyRequests(): Observable<HiringRequest[]> {
    return this.http.get<HiringRequest[]>('/api/v1/hiring-requests');
  }

  /** Solo el solicitante; deja la request 'completed' (razón terminal, KER-31). */
  completeRequest(id: string): Observable<HiringRequest> {
    return this.http.post<HiringRequest>(`/api/v1/hiring-requests/${id}/complete`, {});
  }

  /** Solo el solicitante y solo 'pending'; estado terminal 'cancelled' (el cuidador deja de verla). */
  cancelRequest(id: string): Observable<HiringRequest> {
    return this.http.post<HiringRequest>(`/api/v1/hiring-requests/${id}/cancel`, {});
  }

  /** Bandeja del cuidador. El DTO no incluye contactData ni specialRequirements. */
  getCaregiverInbox(): Observable<HiringRequest[]> {
    return this.http.get<HiringRequest[]>('/api/v1/caregiver/requests');
  }

  acceptRequest(id: string): Observable<HiringRequest> {
    return this.http.post<HiringRequest>(`/api/v1/caregiver/requests/${id}/accept`, {});
  }

  declineRequest(id: string): Observable<HiringRequest> {
    return this.http.post<HiringRequest>(`/api/v1/caregiver/requests/${id}/decline`, {});
  }

  getPatientCaregivers(patientId: string): Observable<CaregiverHistoryItem[]> {
    return this.http.get<CaregiverHistoryItem[]>(`/api/v1/patients/${patientId}/caregivers`);
  }
}
