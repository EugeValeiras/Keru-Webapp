import { booleanAttribute, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Input de contraseña con toggle "mostrar/ocultar" (KER-45, feedback de usuario).
 *
 * Envuelve un <input> nativo y un botón de ojo que alterna el type entre
 * `password` y `text`. Implementa ControlValueAccessor para funcionar con
 * [(ngModel)] igual que un input crudo, así reemplaza a los `type="password"`
 * sueltos sin tocar el resto del formulario.
 *
 * Accesibilidad (brand book §5, WCAG AA): el botón lleva aria-label dinámico
 * ("Mostrar/Ocultar contraseña") + aria-pressed, es focusable por teclado y su
 * ícono (Lucide eye/eye-off, 20px, trazo 1.75, currentColor) es aria-hidden.
 * El <input> queda como primer descendiente labelable, así el <label> externo
 * (`<label><span>Contraseña</span><kr-password-input/></label>`) lo sigue
 * nombrando y `getByLabel('Contraseña')` sigue resolviendo.
 */
@Component({
  selector: 'kr-password-input',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => KrPasswordInput),
      multi: true,
    },
  ],
  template: `
    <div class="relative">
      <input
        [type]="visible() ? 'text' : 'password'"
        [name]="name()"
        [required]="required()"
        [attr.minlength]="minlength()"
        [autocomplete]="autocomplete()"
        [value]="value()"
        [disabled]="disabled()"
        (input)="onInput($event)"
        (blur)="onTouched()"
        class="w-full rounded-control border border-ink-300 bg-surface px-3 py-2 pr-11 hover:border-ink-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
      />
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-label]="visible() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        [attr.aria-pressed]="visible()"
        class="absolute inset-y-0 right-0 flex items-center px-3 text-ink-500 rounded-control hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
      >
        @if (visible()) {
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path
              d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"
            />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <path d="m2 2 20 20" />
          </svg>
        } @else {
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        }
      </button>
    </div>
  `,
})
export class KrPasswordInput implements ControlValueAccessor {
  /** Nombre del control dentro del <form> template-driven (registra el ngModel). */
  readonly name = input('');
  /** current-password (login/step-up) o new-password (signup). */
  readonly autocomplete = input('current-password');
  readonly required = input(false, { transform: booleanAttribute });
  readonly minlength = input<number | null>(null);

  protected readonly visible = signal(false);
  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  protected onTouched: () => void = () => {};

  toggle(): void {
    this.visible.update((v) => !v);
  }

  onInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
