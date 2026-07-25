import { Component } from '@angular/core';

/**
 * KER-61 · Marcador de campo REQUERIDO en un label.
 *
 * Renderiza el glifo "*" como indicador de FORMA (no depende solo del color → WCAG 1.4.1):
 * el asterisco es un carácter visible, y el color danger es refuerzo, no el único canal.
 *
 * Es DECORATIVO para tecnologías de asistencia (`aria-hidden`): el "requerido" que anuncia
 * el lector de pantalla lo aporta el atributo `required` nativo del input (equivalente ARIA de
 * `aria-required`), que ya vive en el markup.
 *
 * IMPORTANTE — el "*" NO debe entrar en el accessible name del control (si no, rompe los
 * `getByLabel('Nombre', { exact: true })` de los specs). OJO: `aria-hidden` NO alcanza cuando el
 * "*" está dentro del `<label>` implícito — Chromium igual concatena su texto al name-from-content.
 * Por eso el input debe fijar su nombre con `aria-labelledby` apuntando a un `<span id>` que
 * contenga SOLO el texto del campo, dejando el "*" fuera de ese span:
 *   <label>
 *     <span><span id="cond-label">Condición principal</span> <kr-required-mark /></span>
 *     <input aria-labelledby="cond-label" required … />
 *   </label>
 */
@Component({
  selector: 'kr-required-mark',
  host: {
    'aria-hidden': 'true',
    class: 'text-danger font-semibold select-none',
  },
  template: `*`,
})
export class KrRequiredMark {}
