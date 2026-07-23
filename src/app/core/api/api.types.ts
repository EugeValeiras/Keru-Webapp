import type { components } from './schema';

/** Acceso corto a los schemas del contrato generado (npm run gen:api). */
export type Schemas = components['schemas'];

export type AuthResponse = Schemas['AuthResponseDto'];
export type LoginDto = Schemas['LoginDto'];
export type SignupDto = Schemas['SignupDto'];

// UC-23 · Perfil de la cuenta (KER-41): datos propios + edición de nombre y foto.
export type AccountProfile = Schemas['AccountResponseDto'];
export type UpdateAccountDto = Schemas['UpdateAccountDto'];

// KER-38 · logout server-side + step-up (NFR-33/41)
export type LogoutResponse = Schemas['LogoutResponseDto'];
export type StepUpResponse = Schemas['StepUpResponseDto'];

export type Role = AuthResponse['role'];

// ---------------------------------------------------------------------------
// Overrides y tipos no declarados en openapi.json (shapes reales verificadas
// contra los controllers de Keru-API — no tocar sin re-verificar).
// ---------------------------------------------------------------------------

export interface Badges {
  certifications?: boolean;
  identity?: boolean;
  background?: boolean;
}

export type Patient = Schemas['PatientResponseDto'];
export type RegisterPatientDto = Schemas['RegisterPatientDto'];
export type EmergencyContact = Schemas['EmergencyContactDto'];

/** `emergencyContact` viene como objeto {name, phone, relationship?}; el schema lo declara vacío. */
export type PatientRecord = Omit<Schemas['PatientRecordDto'], 'emergencyContact'> & {
  emergencyContact: EmergencyContact;
};
export type PatientLinkRole = PatientRecord['linkRole'];
export type UpdatePatientDto = Schemas['UpdatePatientDto'];
/** UC-22 · Miembro del círculo: cuenta vinculada al paciente + rol del vínculo. */
export type PatientCircleMember = Schemas['PatientLinkDto'];

export type Specialty = Schemas['RegisterCaregiverDto']['specialties'][number];
export type Modality = Schemas['CreateRequestDto']['modality'];
export type CaregiverStatus = Schemas['CaregiverResponseDto']['status'];
export type RegisterCaregiverDto = Schemas['RegisterCaregiverDto'];
/** UC-02 A3 · Set parcial del perfil aprobado (sin credenciales); la tarifa es efectivo-fechada. */
export type UpdateCaregiverProfileDto = Schemas['UpdateCaregiverProfileDto'];
export type Certification = Schemas['CertificationDto'];
export type Availability = Schemas['AvailabilityDto'];
export type Rates = Schemas['RatesDto'];

/** `badges`/`certifications`/`availability`/`rates` vienen tipados; el schema los declara vacíos. */
export type CaregiverProfile = Omit<
  Schemas['CaregiverResponseDto'],
  'badges' | 'rejectionReason' | 'certifications' | 'availability' | 'rates'
> & {
  badges: Badges;
  rejectionReason?: string | null;
  certifications: (Certification & { verified?: boolean })[];
  availability: Availability[];
  rates: Rates;
};

export type CaregiverCard = Omit<Schemas['CaregiverCardDto'], 'badges'> & { badges: Badges };

export type MarketplaceProfile = Omit<
  Schemas['CaregiverProfileDto'],
  'badges' | 'certifications' | 'availability'
> & {
  badges: Badges;
  certifications: (Certification & { verified?: boolean })[];
  availability: Availability[];
};

export type AdminCaregiverDetail = Omit<
  Schemas['CaregiverDetailDto'],
  'badges' | 'certifications' | 'availability' | 'rates' | 'rejectionReason' | 'reviewedBy' | 'reviewedAt'
> & {
  badges: Badges;
  certifications: (Certification & { verified?: boolean })[];
  availability: Availability[];
  rates: Rates;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
};

export interface AdminCaregiverList {
  items: CaregiverProfile[];
  total: number;
  page: number;
  pageSize: number;
}

export type CreateRequestDto = Schemas['CreateRequestDto'];
/** ratePerHourSnapshot llega como string numérico sin moneda. */
export type HiringRequest = Schemas['RequestResponseDto'];
export type HiringStatus = HiringRequest['status'];

export type CaregiverHistoryItem = Schemas['CaregiverHistoryItemDto'];

export type MetricKey = Schemas['MetricValueDto']['metricKey'];
export type MetricValue = Schemas['MetricValueDto'];
export type RecordVitalsDto = Schemas['RecordVitalsDto'];
export type RecordMedicationDto = Schemas['RecordMedicationDto'];
export type RecordNoteDto = Schemas['RecordNoteDto'];
/** `status` aún no está en el schema generado: quarantined = llegada tardía en cuarentena (NFR-30). */
export type RecordResponse = Schemas['RecordResponseDto'] & { status: 'recorded' | 'quarantined' };

/** `type` incluye 'quarantine' (UC-12 A3); el schema generado aún declara solo alert|note. */
export type AppNotification = Omit<Schemas['NotificationDto'], 'type'> & {
  type: 'alert' | 'note' | 'quarantine';
};

/** UC-18 · Web Push (adicional a la campana). */
export type PushConfig = Schemas['PushConfigDto'];
export type SubscribePushDto = Schemas['SubscribePushDto'];
export type PushSubscriptionInfo = Schemas['PushSubscriptionDto'];

export type SubmitReviewDto = Schemas['SubmitReviewDto'];
export type Review = Omit<Schemas['ReviewDto'], 'comment'> & { comment?: string | null };
export interface Reputation {
  aggregate: { average: number; count: number };
  reviews: Review[];
}

export type CreateInvitationDto = Schemas['CreateInvitationDto'];
export type Invitation = Schemas['InvitationResponseDto'];
/** UC-03 · Invitación emitida (gestión: listar y revocar). */
export type EmittedInvitation = Schemas['EmittedInvitationDto'];

/** GET /invitations/:token (público, sin schema en openapi). */
export interface InvitationPreview {
  patientId: string;
  patientName: string;
  invitedEmail: string;
  expiresAt: string;
  /** true solo si status=pending y no expiró; false → deshabilitar confirmar. */
  valid: boolean;
}

export type InvitationConfirmed = Schemas['InvitationConfirmedDto'];

/** GET /catalogs — estático por deploy, cachear por sesión. */
export interface CatalogMetric {
  key: MetricKey;
  label: string;
  unit: string;
  plausible: { min: number; max: number };
  defaultRange: { min: number; max: number };
}
export interface Catalogs {
  metrics: CatalogMetric[];
  [key: string]: unknown;
}

/** GET /patients/:id/state — sin schema en openapi. */
export interface PatientState {
  patientId: string;
  metrics: { metricKey: MetricKey; value: number; measuredAt: string }[];
  asOf: string;
}

/** GET /patients/:id/history — sin schema en openapi. */
export interface HistoryItem {
  id: string;
  type: 'vitals' | 'medication' | 'note';
  measuredAt: string;
  authorRole: 'patient' | 'family' | 'caregiver' | 'admin';
  data:
    | { values: MetricValue[] }
    | { medication: string; dose: string; schedule?: string; observations?: string }
    | { text: string };
}

export interface SeriesPoint {
  measuredAt: string;
  value: number;
}

/**
 * UC-12 A3 · Registro tardío no autorizado en cuarentena (NFR-30) — GET
 * /patients/:id/quarantine (sin schema en openapi). Lo ve todo el círculo;
 * resuelven consent-holder/manager. Nunca se borra: los resueltos quedan con traza.
 */
export interface QuarantinedRecord {
  id: string;
  patientId: string;
  type: HistoryItem['type'];
  /** Tiempo de medición original (NFR-36): si se aprueba, el historial ordena por acá. */
  measuredAt: string;
  /** Tiempo de llegada. */
  receivedAt: string;
  authorAccountId: string;
  authorRole: HistoryItem['authorRole'];
  reason: string;
  status: 'pending' | 'approved' | 'discarded';
  data: HistoryItem['data'];
  resolvedByAccountId?: string | null;
  resolvedAt?: string | null;
  approvedRecordId?: string | null;
}

export interface SweepResult {
  assignmentsClosed: number;
  requestsExpired: number;
  revealed: number;
}

// ---------------------------------------------------------------------------

/** Envelope uniforme de error de la API (AllExceptionsFilter). */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  path?: string;
  timestamp?: string;
  /** Mensajes por campo cuando details = { fields: string[] } (validación). */
  fields: string[];
}

/** Mensajes para respuestas que NO traen el envelope de la API (proxy caído, 413 del server, red). */
function fallbackMessage(status: number): string {
  switch (status) {
    case 0:
      return 'No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.';
    case 413:
      return 'El archivo es demasiado grande para el servidor.';
    case 502:
    case 503:
    case 504:
      return 'El servidor no está respondiendo. Probá de nuevo en unos segundos.';
    default:
      return `Ocurrió un error inesperado (HTTP ${status}). Probá de nuevo.`;
  }
}

export function toApiError(status: number, body: unknown): ApiError {
  const raw = (body ?? {}) as Partial<ApiError> & { details?: { fields?: string[] } };
  return {
    statusCode: raw.statusCode ?? status,
    code: raw.code ?? 'ERROR',
    message: raw.message ?? fallbackMessage(status),
    details: raw.details,
    path: raw.path,
    timestamp: raw.timestamp,
    fields: raw.details?.fields ?? [],
  };
}

/** Home de cada rol; también decide el redirect post-login. */
export function homeForRole(role: Role): string {
  switch (role) {
    case 'caregiver':
      return '/caregiver';
    case 'admin':
      return '/admin';
    default:
      return '/app';
  }
}

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  'elder-care': 'Adultos mayores',
  'post-surgical': 'Post-quirúrgico',
  'chronic-illness': 'Enfermedades crónicas',
  disability: 'Discapacidad',
  palliative: 'Cuidados paliativos',
  pediatric: 'Pediátrico',
  rehabilitation: 'Rehabilitación',
  companionship: 'Compañía',
};

export const MODALITY_LABELS: Record<Modality, string> = {
  home: 'A domicilio',
  hospital: 'En internación',
};

export const HIRING_STATUS_LABELS: Record<HiringStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  'in-progress': 'En curso',
  declined: 'Rechazada',
  cancelled: 'Cancelada',
  completed: 'Finalizada',
  expired: 'Vencida',
};

export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
