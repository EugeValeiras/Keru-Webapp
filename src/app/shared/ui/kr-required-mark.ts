import { Component } from '@angular/core';

/**
 * KER-61 · Marcador de campo REQUERIDO en un label.
 *
 * Renderiza el glifo "*" como indicador de FORMA (no depende solo del color → WCAG 1.4.1):
 * el asterisco es un carácter visible, y el color danger es refuerzo, no el único canal.
 *
 * Es DECORATIVO para tecnologías de asistencia (`aria-hidden`): el "requerido" que anuncia
 * el lector de pantalla lo aporta el atributo `required` nativo del input (equivalente ARIA de
 * `aria-required`), que ya viven en el markup. A propósito el "*" NO entra en el accessible name
 * del control — así los `getByLabel('Nombre', { exact: true })` de los specs siguen matcheando.
 *
 * Uso: dentro del <span> del label de un campo requerido, junto al texto.
 *   <span>Condición principal <kr-required-mark /></span>
 */
@Component({
  selector: 'kr-required-mark',
  host: {
    'aria-hidden': 'true',
    class: 'text-danger font-semibold select-none',
    title: 'Requerido',
  },
  template: `*`,
})
export class KrRequiredMark {}
