import { Component, computed, input } from '@angular/core';
import { KrCertIcon } from './kr-cert-icon';

/** Forma mínima de una certificación para la insignia compacta (subconjunto de `CertificationView`). */
export interface CertInsignia {
  id: string;
  label: string;
  iconKey: string;
  status: 'pending' | 'approved' | 'rejected';
}

const STATUS_LABEL: Record<CertInsignia['status'], string> = {
  pending: 'Pendiente',
  approved: 'Verificada',
  rejected: 'Rechazada',
};

// Tinte -50 + texto -700 (holgura AA ≥6.9:1, patrón kr-badge / KER-72): robusto aun cuando axe
// muestrea a mitad del fade-in de la card del marketplace (opacity <1 → color compuesto).
const STATUS_TONE: Record<CertInsignia['status'], string> = {
  approved: 'bg-success-50 text-success-700',
  pending: 'bg-warning-50 text-warning-700',
  rejected: 'bg-danger-50 text-danger-700',
};

/**
 * KER-82 · Fila COMPACTA de insignias por-certificación para vistas de LISTA (card del marketplace
 * UC-06, listado admin UC-19). Reusa `kr-cert-icon` (KER-77) para el glifo SVG — no duplica lógica de
 * ícono. Cada insignia es ícono + etiqueta del catálogo; con `showStatus` (admin) tiñe según el estado
 * por-cert y lo suma al nombre accesible. Overflow "+N" con las restantes en el `title`/`aria-label`
 * para no romper el layout con muchas certificaciones. Vacío → no renderiza nada.
 *
 * Alcance del dato (lo decide quién la usa, no el componente):
 *  - marketplace/público: SOLO aprobadas (el backend ya filtra con `publicCertifications`); `showStatus` off.
 *  - admin (gestión): todas con su estado (`ownerCertifications`); `showStatus` on.
 *
 * AA: el ícono es decorativo (`aria-hidden` en `kr-cert-icon`); el nombre accesible lo aporta la
 * etiqueta de texto + el `aria-label` del chip (etiqueta + estado). No se depende solo del ícono/color.
 */
@Component({
  selector: 'kr-cert-insignias',
  imports: [KrCertIcon],
  template: `
    @if (visible().length) {
      <div class="flex flex-wrap items-center gap-1.5">
        @for (c of visible(); track c.id) {
          <span
            class="inline-flex items-center gap-1 rounded-tag px-2 py-0.5 text-xs font-medium whitespace-nowrap"
            [class]="toneClass(c.status)"
            [title]="chipLabel(c)"
            [attr.aria-label]="chipLabel(c)"
          >
            <kr-cert-icon [iconKey]="c.iconKey" [size]="16" />
            <span>{{ c.label }}</span>
          </span>
        }
        @if (overflow(); as n) {
          <span
            class="inline-flex items-center rounded-tag px-2 py-0.5 text-xs font-medium bg-sand-100 text-ink-700"
            [title]="overflowLabel()"
            [attr.aria-label]="overflowLabel()"
            >+{{ n }}</span
          >
        }
      </div>
    }
  `,
})
export class KrCertInsignias {
  /** Certificaciones a mostrar. El consumidor decide el alcance (aprobadas vs todas). */
  readonly certifications = input<CertInsignia[]>([]);
  /** Máximo visible antes de colapsar el resto en "+N". Brand: fila corta en listas. */
  readonly max = input(4);
  /** Admin: tiñe por estado y lo suma al nombre accesible. Público: off (todas ya son aprobadas). */
  readonly showStatus = input(false);

  readonly visible = computed(() => this.certifications().slice(0, this.max()));
  private readonly hidden = computed(() => this.certifications().slice(this.max()));
  readonly overflow = computed(() => this.hidden().length);

  toneClass(status: CertInsignia['status']): string {
    return this.showStatus() ? STATUS_TONE[status] : 'bg-primary-50 text-primary-700';
  }

  chipLabel(c: CertInsignia): string {
    return `${c.label} — ${STATUS_LABEL[c.status]}`;
  }

  overflowLabel(): string {
    const rest = this.hidden().map((c) => c.label);
    return `${rest.length} más: ${rest.join(', ')}`;
  }
}
