import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AppNotification,
  HistoryItem,
  MetricKey,
  PatientState,
  QuarantinedRecord,
  RecordMedicationDto,
  RecordNoteDto,
  RecordResponse,
  RecordVitalsDto,
  SeriesPoint,
} from './api.types';

/** care-record (escritura + campana) y care-consult (lectura). */
@Injectable({ providedIn: 'root' })
export class CareApi {
  private readonly http = inject(HttpClient);

  recordVitals(patientId: string, dto: RecordVitalsDto): Observable<RecordResponse> {
    return this.http.post<RecordResponse>(`/api/v1/patients/${patientId}/vitals`, dto);
  }

  recordMedication(patientId: string, dto: RecordMedicationDto): Observable<RecordResponse> {
    return this.http.post<RecordResponse>(`/api/v1/patients/${patientId}/medications`, dto);
  }

  recordNote(patientId: string, dto: RecordNoteDto): Observable<RecordResponse> {
    return this.http.post<RecordResponse>(`/api/v1/patients/${patientId}/notes`, dto);
  }

  getState(patientId: string): Observable<PatientState> {
    return this.http.get<PatientState>(`/api/v1/patients/${patientId}/state`);
  }

  /** Orden measuredAt DESC, sin paginación: filtrar client-side. */
  getHistory(patientId: string): Observable<HistoryItem[]> {
    return this.http.get<HistoryItem[]>(`/api/v1/patients/${patientId}/history`);
  }

  /** Orden ASC, listo para graficar. metricKey inválido devuelve [] silencioso. */
  getSeries(patientId: string, metricKey: MetricKey): Observable<SeriesPoint[]> {
    return this.http.get<SeriesPoint[]>(`/api/v1/patients/${patientId}/metrics/${metricKey}/series`);
  }

  /** UC-12 A3 · Cuarentena (NFR-30): visible para el círculo. receivedAt DESC; incluye resueltos. */
  getQuarantine(patientId: string): Observable<QuarantinedRecord[]> {
    return this.http.get<QuarantinedRecord[]>(`/api/v1/patients/${patientId}/quarantine`);
  }

  /** Resuelven consent-holder/manager (viewer: 403). Re-aplicar es no-op idempotente. */
  approveQuarantined(patientId: string, id: string): Observable<QuarantinedRecord> {
    return this.http.post<QuarantinedRecord>(`/api/v1/patients/${patientId}/quarantine/${id}/approve`, {});
  }

  /** Marca el item como descartado con traza — nunca se borra. */
  discardQuarantined(patientId: string, id: string): Observable<QuarantinedRecord> {
    return this.http.post<QuarantinedRecord>(`/api/v1/patients/${patientId}/quarantine/${id}/discard`, {});
  }

  getNotifications(): Observable<AppNotification[]> {
    return this.http.get<AppNotification[]>('/api/v1/notifications');
  }

  getUnreadCount(): Observable<{ unread: number }> {
    return this.http.get<{ unread: number }>('/api/v1/notifications/unread-count');
  }

  /** Siempre responde { ok: true }, aun con id ajeno/inexistente. */
  markRead(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`/api/v1/notifications/${id}/read`, {});
  }

  /** Idempotente: updated = cuántas pasaron a leídas (0 si se repite). */
  markAllRead(): Observable<{ ok: boolean; updated: number }> {
    return this.http.post<{ ok: boolean; updated: number }>('/api/v1/notifications/read-all', {});
  }
}
