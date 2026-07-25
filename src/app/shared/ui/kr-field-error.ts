import { Component } from '@angular/core';

/**
 * KER-61 · Mensaje de error INLINE por campo. · KER-80 · Vinculado al input y anunciado.
 *
 * Texto danger, compacto, que se muestra debajo del input cuando el campo requerido quedó vacío
 * al enviar (`ctrl.invalid && form.submitted`). Reemplaza/complementa el banner genérico: en vez
 * de listar los requeridos juntos, cada campo dice QUÉ falta, al lado del control.
 *
 * El error NO se apoya solo en el color: hay el "*" en el label ([[kr-required-mark]]), el atributo
 * `required` (ARIA) en el input, `aria-invalid` cuando corresponde, y este texto explícito.
 *
 * KER-80 · Vínculo error↔input (WCAG 1.3.1 / 3.3.1 / 4.1.3):
 *   - `role="alert"` (host): al insertarse en el DOM tras un envío fallido, el lector anuncia el
 *     mensaje (Status Messages). La región es la assertive del error de formulario, no una polite.
 *   - `id` estable por campo (p.ej. `err-fullName`): un `id="…"` puesto en el selector cae tal cual
 *     en el host element (Angular), así el input lo referencia con `aria-describedby` y el lector
 *     lee el texto del error al enfocar el control. Sin envío/error, el input no cuelga el describedby.
 *
 * Uso:
 *   <input … [attr.aria-invalid]="ctrl.invalid && f.submitted ? 'true' : null"
 *            [attr.aria-describedby]="ctrl.invalid && f.submitted ? 'err-fullName' : null" />
 *   @if (ctrl.invalid && f.submitted) {
 *     <kr-field-error id="err-fullName">Ingresá el nombre completo.</kr-field-error>
 *   }
 */
@Component({
  selector: 'kr-field-error',
  host: { class: 'text-sm text-danger', role: 'alert' },
  template: `<ng-content />`,
})
export class KrFieldError {}
