import { Badges, CertificationView, SPECIALTY_LABELS, Specialty } from '../../core/api/api.types';
import { Insignia } from './kr-insignias';

/**
 * KER-87 · Traduce los datos del cuidador (que ya vienen en los DTOs: `specialties`, `certifications`
 * con estado/verified/iconKey, y `badges` de verificación agregada) a la lista tipada de insignias que
 * renderiza `kr-insignias`. Una sola fuente para las 4 vistas (marketplace card + ficha, admin listado +
 * detalle), así el orden y el criterio de "verificada" no divergen entre pantallas.
 *
 * Verificaciones agregadas: identidad y antecedentes se muestran como insignias DORADAS cuando el nivel
 * está otorgado. La insignia agregada "Certificaciones" NO se emite: sería redundante con las
 * certificaciones aprobadas reales, que ya aparecen (cada una con su ícono del catálogo).
 */
type CaregiverInsigniaData = {
  certifications: CertificationView[];
  badges: Badges;
};

const VERIFICATION_META = {
  identity: { label: 'Identidad', iconKey: 'identity' },
  background: { label: 'Antecedentes', iconKey: 'background' },
} as const;

// Admin: qué falta revisar primero (pendientes), luego lo aprobado, luego lo rechazado.
const ADMIN_CERT_ORDER: Record<CertificationView['status'], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

/** Una certificación (del catálogo) como insignia; dorada si está aprobada/verificada. */
export function certInsigniaOf(c: CertificationView): Insignia {
  return {
    key: `cert:${c.id}`,
    label: c.label,
    kind: 'certificacion',
    iconKey: c.iconKey,
    status: c.status,
    verified: c.status === 'approved',
  };
}

/** Especialidades (áreas de cuidado) como insignias neutrales, sin ícono. */
export function specialtyInsignias(specialties: string[]): Insignia[] {
  return specialties.map(
    (s): Insignia => ({
      key: `esp:${s}`,
      label: SPECIALTY_LABELS[s as Specialty] ?? s,
      kind: 'especialidad',
    }),
  );
}

/** Verificaciones agregadas otorgadas (identidad/antecedentes) como insignias doradas. */
export function verificationInsignias(badges: Badges): Insignia[] {
  return (['identity', 'background'] as const)
    .filter((k) => badges[k])
    .map(
      (k): Insignia => ({
        key: `ver:${k}`,
        label: VERIFICATION_META[k].label,
        kind: 'verificacion',
        iconKey: VERIFICATION_META[k].iconKey,
        verified: true,
      }),
    );
}

/**
 * Insignias de CONFIANZA (certificaciones + verificaciones agregadas), para la fila que resalta por
 * sobre las especialidades. Público (`mode: 'public'`): el backend ya filtró a las aprobadas → todas
 * doradas. Admin: todas las certs con su estado, ordenadas para la gestión (pendientes primero).
 */
export function trustInsignias(data: CaregiverInsigniaData, mode: 'public' | 'admin'): Insignia[] {
  const certs =
    mode === 'admin'
      ? [...data.certifications].sort(
          (a, b) => ADMIN_CERT_ORDER[a.status] - ADMIN_CERT_ORDER[b.status],
        )
      : data.certifications;
  return [...certs.map(certInsigniaOf), ...verificationInsignias(data.badges)];
}
