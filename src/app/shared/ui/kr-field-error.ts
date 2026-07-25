import { Component } from '@angular/core';

/**
 * KER-61 · Mensaje de error INLINE por campo.
 *
 * Texto danger, compacto, que se muestra debajo del input cuando el campo requerido quedó vacío
 * al enviar (`ctrl.invalid && form.submitted`). Reemplaza/complementa el banner genérico: en vez
 * de listar los requeridos juntos, cada campo dice QUÉ falta, al lado del control.
 *
 * El error NO se apoya solo en el color: hay el "*" en el label ([[kr-required-mark]]), el atributo
 * `required` (ARIA) en el input, `aria-invalid` cuando corresponde, y este texto explícito.
 *
 * Vincular el mensaje al input con `aria-describedby` + `aria-invalid` programático es el alcance de
 * KER-80 (follow-up); acá el mensaje es visual + `aria-invalid` en el control.
 *
 * Uso:
 *   @if (ctrl.invalid && f.submitted) {
 *     <kr-field-error>Ingresá la condición principal.</kr-field-error>
 *   }
 */
@Component({
  selector: 'kr-field-error',
  host: { class: 'text-sm text-danger' },
  template: `<ng-content />`,
})
export class KrFieldError {}
