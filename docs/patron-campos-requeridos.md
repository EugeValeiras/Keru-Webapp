# Patrón de campos requeridos (KER-61)

Patrón reutilizable para señalar campos **requeridos** en los formularios de Keru y dar feedback
puntual cuando quedan vacíos al enviar. Nace del alta de paciente (`patient-register-page.ts`), que
es la primera implementación de referencia; el resto de los forms se migran con este mismo molde.

## Problema que resuelve

Antes, un campo requerido (p.ej. "Condición principal") no tenía señal visual de serlo, y al enviar
vacío el feedback era un banner genérico que listaba los tres requeridos **juntos** sin decir cuál
faltaba. `FormsModule` agrega `novalidate`, así que la validación nativa del browser (tooltips
"Please fill out this field") no aparece: el manejo es manual.

## Las tres piezas

1. **`<kr-required-mark />`** (`shared/ui/kr-required-mark.ts`) — el glifo `*` en el label.
   - Es un indicador de **forma** (un carácter visible), no solo color → cumple WCAG **1.4.1**.
   - Es `aria-hidden`: **no** entra en el _accessible name_ del control. El "requerido" que anuncia
     el lector de pantalla lo aporta el atributo **`required`** nativo del input (equivalente ARIA de
     `aria-required`). **Importante:** por eso NO se agrega texto sr-only "(requerido)" al label —
     contaminaría el accessible name y rompería los `getByLabel('Nombre', { exact: true })` de los
     specs e2e.

2. **`.input-error`** (`styles.css`, **sin `@layer`**) — el borde danger del input.
   - Va sin cascade layer a propósito: así gana por cascada a las utilities de Tailwind
     (`border-ink-300`), que viven en una capa y pierden contra CSS sin capa, sin pelear
     especificidad. La transición del borde ya existe en la base de estados suaves (KER-21).

3. **`<kr-field-error>…</kr-field-error>`** (`shared/ui/kr-field-error.ts`) — el mensaje inline
   danger, específico por campo, debajo del input.

## Cómo aplicarlo (template-driven / `ngModel`)

```html
<form #f="ngForm" (ngSubmit)="submit(f)">
  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium text-ink-700">Condición principal <kr-required-mark /></span>
    <input
      #conditionCtrl="ngModel"
      name="mainCondition"
      required
      [(ngModel)]="mainCondition"
      class="... border border-ink-300 ..."
      [class.input-error]="conditionCtrl.invalid && f.submitted"
      [attr.aria-invalid]="conditionCtrl.invalid && f.submitted ? 'true' : null"
    />
    @if (conditionCtrl.invalid && f.submitted) {
      <kr-field-error>Ingresá la condición principal.</kr-field-error>
    }
  </label>
</form>
```

Y en el componente:

```ts
submit(form: NgForm): void {
  if (form.invalid) {
    this.focusFirstInvalid(); // enfoca el primer control inválido del DOM (WCAG 3.3.1 / 2.4.3)
    return;
  }
  // ... construir DTO y llamar a la API
}

private focusFirstInvalid(): void {
  this.formEl()?.nativeElement
    .querySelector<HTMLElement>('input:invalid, select:invalid, textarea:invalid')
    ?.focus();
}
```

Claves del comportamiento:

- El borde rojo y el mensaje se muestran sobre **`ctrl.invalid && f.submitted`**: sólo tras el primer
  envío, no mientras el usuario todavía está tipeando por primera vez.
- El error **se auto-limpia** cuando el campo se completa: al volverse válido el control, la condición
  pasa a `false` y desaparecen borde y mensaje, sin reenviar.
- El foco va al **primer** inválido en orden del DOM. `novalidate` (de `FormsModule`) sólo apaga la UI
  nativa de validación; el pseudo-selector `:invalid` sigue matcheando por el atributo `required`.
- El banner genérico (`error()`) queda **sólo para errores de API** (el 4xx del backend), no para
  requeridos vacíos.

## Accesibilidad

El estado de error **no depende solo del color**: hay el `*` (forma) + `required`/`aria-invalid`
(programático) + el texto del mensaje. `axe` debe quedar verde. Vincular el mensaje al input con
`aria-describedby` para que el lector lea el texto del error al enfocar es el alcance de **KER-80**
(follow-up), no de este ticket.

## Rollout a los demás forms (follow-up)

Este ticket deja el patrón y lo aplica al **alta de paciente**. Forms pendientes de migrar (repiten
inputs Tailwind inline con `required` + validación manual): auth (login/signup/reset),
request-wizard, caregiver-onboarding, invite-modal, review-modal, record-medication/note,
patient-record. Migrar cada uno = agregar `<kr-required-mark />` en los labels requeridos,
`[class.input-error]` + `aria-invalid` en los inputs, `<kr-field-error>` por campo, y frenar el
submit + `focusFirstInvalid()` en el componente. Reutilizar `kr-password-input` donde aplique.
