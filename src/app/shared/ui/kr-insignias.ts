import { Component, computed, input } from '@angular/core';
import { KrCertIcon } from './kr-cert-icon';

/** KER-87 · Familia de la insignia (define el tratamiento por defecto). */
export type InsigniaKind = 'especialidad' | 'certificacion' | 'verificacion';

/** KER-87 · Estado por-certificación (solo aplica a `kind: 'certificacion'` en la vista admin). */
export type InsigniaStatus = 'pending' | 'approved' | 'rejected';

/**
 * KER-87 · Modelo tipado de UNA insignia del cuidador — la unidad que renderiza `kr-insignias`.
 * Unifica especialidades (áreas de cuidado), verificaciones agregadas (identidad/antecedentes) y
 * certificaciones del catálogo bajo el mismo estilo tipográfico. El `verified`/`status` decide el
 * realce (dorado para lo verificado). Lo arma el mapper `caregiverInsignias`, no cada vista.
 */
export interface Insignia {
  /** Clave estable para el trackBy (id de cert, o `esp:<key>` / `ver:<key>`). */
  key: string;
  label: string;
  kind: InsigniaKind;
  /** iconKey del catálogo (`kr-cert-icon`); ausente en especialidades (píldora de solo texto). */
  iconKey?: string;
  /** Estado por-cert (admin). Ausente = no aplica (público/especialidad/verificación). */
  status?: InsigniaStatus;
  /** true = verificada/completada → tratamiento DORADO. Lo deriva el mapper. */
  verified?: boolean;
}

const STATUS_ADJ: Record<InsigniaStatus, string> = {
  pending: 'pendiente',
  approved: 'verificada',
  rejected: 'rechazada',
};

// Tinte -50 + texto -700 (holgura AA ≥6.4:1, patrón kr-badge / KER-72): robusto aun cuando axe
// muestrea a mitad del fade-in de la card (opacity <1 → color compuesto). El dorado sigue la misma
// regla: gold-700 sobre gold-50 = 6.4:1 (AA). El borde da todas las píldoras al mismo alto.
const TONE = {
  especialidad: 'bg-primary-50 text-primary-700 border-transparent',
  verified: 'kr-insignia-verified bg-gold-50 text-gold-700 border-gold-300',
  pending: 'bg-warning-50 text-warning-700 border-transparent',
  rejected: 'bg-danger-50 text-danger-700 border-transparent',
} as const;

/**
 * KER-87 · Fila UNIFICADA de insignias del cuidador (especialidades + verificaciones + certificaciones)
 * con un ÚNICO estilo tipográfico (píldora `rounded-tag`, Figtree 500 12px, ícono opcional). Consolida
 * lo que antes estaban dispersos (chips de especialidad con `kr-badge`, badges de verificación, e
 * insignias por-cert de KER-82): una sola pieza para marketplace (card + ficha) y admin (listado +
 * detalle), para consistencia.
 *
 * Realce "verificada" (dorado, KER-87): las certificaciones APROBADAS y las verificaciones completadas
 * (identidad/antecedentes) usan el tono dorado del brand con un leve brillo (solo con motion habilitado;
 * ver `.kr-insignia-verified` en styles.css). Resaltan por sobre las especialidades (neutrales) y las
 * no-verificadas. En admin, las certs pendientes/rechazadas se tiñen por estado (warning/danger).
 *
 * Vacío → no renderiza nada (sin filas vacías ni placeholders). Overflow "+N" para no romper el layout
 * de las vistas de lista; en el detalle se pasa un `max` alto para mostrarlas todas.
 *
 * AA: el ícono es decorativo (`aria-hidden` en `kr-cert-icon`); el nombre accesible lo aportan el texto
 * y el `aria-label` del chip (etiqueta + condición: p.ej. "Certificación verificada: Primeros Auxilios").
 * No se depende solo del color/ícono.
 */
@Component({
  selector: 'kr-insignias',
  imports: [KrCertIcon],
  template: `
    @if (visible().length) {
      <div class="flex flex-wrap items-center gap-1.5">
        @for (i of visible(); track i.key) {
          <span
            class="inline-flex items-center gap-1 rounded-tag border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
            [class]="toneClass(i)"
            [title]="chipLabel(i)"
            [attr.aria-label]="chipLabel(i)"
          >
            @if (i.iconKey; as iconKey) {
              <kr-cert-icon [iconKey]="iconKey" [size]="16" [inherit]="true" />
            }
            <span>{{ i.label }}</span>
          </span>
        }
        @if (overflow(); as n) {
          <span
            class="inline-flex items-center rounded-tag border border-transparent px-2 py-0.5 text-xs font-medium bg-sand-100 text-ink-700"
            [title]="overflowLabel()"
            [attr.aria-label]="overflowLabel()"
            >+{{ n }}</span
          >
        }
      </div>
    }
  `,
})
export class KrInsignias {
  /** Insignias a mostrar (ya filtradas y ordenadas por `caregiverInsignias`). */
  readonly insignias = input<Insignia[]>([]);
  /** Máximo visible antes de colapsar el resto en "+N". Lista → corta; detalle → alto (todas). */
  readonly max = input(4);

  readonly visible = computed(() => this.insignias().slice(0, this.max()));
  private readonly hidden = computed(() => this.insignias().slice(this.max()));
  readonly overflow = computed(() => this.hidden().length);

  toneClass(i: Insignia): string {
    if (i.verified || i.status === 'approved') {
      return TONE.verified;
    }
    if (i.status === 'pending') {
      return TONE.pending;
    }
    if (i.status === 'rejected') {
      return TONE.rejected;
    }
    return TONE.especialidad;
  }

  chipLabel(i: Insignia): string {
    if (i.kind === 'certificacion') {
      return `Certificación ${STATUS_ADJ[i.status ?? 'approved']}: ${i.label}`;
    }
    if (i.kind === 'verificacion') {
      return `Verificación de ${i.label.toLowerCase()}`;
    }
    return `Especialidad: ${i.label}`;
  }

  overflowLabel(): string {
    const rest = this.hidden().map((i) => i.label);
    return `${rest.length} más: ${rest.join(', ')}`;
  }
}
