import { Component, input } from '@angular/core';

/**
 * KER-77 (expande KER-52) · Insignia de una certificación como ÍCONO SVG DISEÑADO.
 *
 * Mapea la `iconKey` estable del catálogo (backend: `CertificationView.iconKey` /
 * `CertificationCatalogItemDto.iconKey`) a un SVG BUNDLEADO LOCALMENTE — nunca `<img src=…>` a un host
 * externo. Reemplaza el emoji (`badgeIcon`) que queda como fallback text-only (p.ej. en el `<option>`
 * del onboarding, que no puede renderizar SVG inline).
 *
 * Íconos del set **Lucide** (lucide-static v1.26.0, licencia **ISC**), el set de referencia del brand
 * book §5: trazo lineal redondeado, 24px, `currentColor`. Decorativos (`aria-hidden`): el nombre de la
 * certificación siempre los acompaña como texto, que es el contenido accesible. Atribución Lucide en
 * `docs/brand/ATTRIBUTIONS.md`.
 *
 * Alta de un ícono nuevo: sumá su `iconKey` como `@case` acá y en `certification-catalog.ts` (backend).
 * Un `iconKey` desconocido cae al genérico `award` (mismo default que el backend).
 */
@Component({
  selector: 'kr-cert-icon',
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[attr.data-cert-icon]': 'iconKey()',
    class: 'inline-flex shrink-0 align-text-bottom text-primary-600',
  },
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      class="w-full h-full"
    >
      @switch (iconKey()) {
        @case ('stethoscope') {
          <path d="M11 2v2" />
          <path d="M5 2v2" />
          <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
          <path d="M8 15a6 6 0 0 0 12 0v-3" />
          <circle cx="20" cy="10" r="2" />
        }
        @case ('syringe') {
          <path d="m18 2 4 4" />
          <path d="m17 7 3-3" />
          <path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5" />
          <path d="m9 11 4 4" />
          <path d="m5 19-3 3" />
          <path d="m14 4 6 6" />
        }
        @case ('heart-pulse') {
          <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
          <path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
        }
        @case ('ambulance') {
          <path d="M10 10H6" />
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14" />
          <path d="M8 8v4" />
          <path d="M9 18h6" />
          <circle cx="17" cy="18" r="2" />
          <circle cx="7" cy="18" r="2" />
        }
        @case ('accessibility') {
          <circle cx="16" cy="4" r="1" />
          <path d="m18 19 1-7-6 1" />
          <path d="m5 8 3-3 5.5 3-2.36 3.5" />
          <path d="M4.24 14.5a5 5 0 0 0 6.88 6" />
          <path d="M13.76 17.5a5 5 0 0 0-6.88-6" />
        }
        @case ('bird') {
          <path d="M16 7h.01" />
          <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
          <path d="m20 7 2 .5-2 .5" />
          <path d="M10 18v3" />
          <path d="M14 17.75V21" />
          <path d="M7 18a6 6 0 0 0 3.84-10.61" />
        }
        @case ('brain') {
          <path d="M12 18V5" />
          <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
          <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
          <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
          <path d="M18 18a4 4 0 0 0 2-7.464" />
          <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
          <path d="M6 18a4 4 0 0 1-2-7.464" />
          <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
        }
        @case ('bone') {
          <path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z" />
        }
        @case ('heart-handshake') {
          <path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762" />
        }
        @case ('baby') {
          <path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" />
          <path d="M15 12h.01" />
          <path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" />
          <path d="M9 12h.01" />
        }
        @case ('apple') {
          <path d="M12 6.528V3a1 1 0 0 1 1-1h0" />
          <path d="M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21" />
        }
        @default {
          <!-- award: genérico de certificación (fallback, mismo default que el backend) -->
          <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" />
          <circle cx="12" cy="8" r="6" />
        }
      }
    </svg>
  `,
})
export class KrCertIcon {
  /** Clave estable del ícono (nombre Lucide), del catálogo del backend. */
  readonly iconKey = input.required<string>();
  /** Lado en px. Brand book §5: 20px en líneas de texto, 24px en headers. */
  readonly size = input(20);
}
