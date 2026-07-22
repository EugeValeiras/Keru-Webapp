import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Reputation, Review, SubmitReviewDto } from './api.types';

@Injectable({ providedIn: 'root' })
export class ReputationApi {
  private readonly http = inject(HttpClient);

  /** id = id del perfil de cuidador (el mismo del marketplace/hiring). */
  getCaregiverReputation(caregiverId: string): Observable<Reputation> {
    return this.http.get<Reputation>(`/api/v1/caregivers/${caregiverId}/reputation`);
  }

  getPatientReputation(patientId: string): Observable<Reputation> {
    return this.http.get<Reputation>(`/api/v1/patients/${patientId}/reputation`);
  }

  /** Familia → cuidador. 400 "Ya reseñaste" = estado, no error. */
  reviewCaregiver(requestId: string, dto: SubmitReviewDto): Observable<Review> {
    return this.http.post<Review>(`/api/v1/hiring-requests/${requestId}/review-caregiver`, dto);
  }

  /** Cuidador → paciente. */
  reviewPatient(requestId: string, dto: SubmitReviewDto): Observable<Review> {
    return this.http.post<Review>(`/api/v1/hiring-requests/${requestId}/review-patient`, dto);
  }
}
