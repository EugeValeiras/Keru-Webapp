import { Component, inject, model, signal } from '@angular/core';
import { ApiError } from '../../core/api/api.types';
import { MembershipApi } from '../../core/api/membership-api.service';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/** Subida de foto de perfil: valida tipo/tamaño, sube vía POST /files/images y expone la URL. */
@Component({
  selector: 'kr-photo-input',
  template: `
    <div class="flex flex-col gap-2">
      @if (url(); as u) {
        <div class="flex items-center gap-4">
          <img
            [src]="u"
            alt="Foto de perfil"
            class="rounded-full object-cover select-none"
            style="width: 80px; height: 80px"
          />
          <div class="flex gap-2">
            <label
              class="rounded-pill bg-primary-100 text-primary-700 font-semibold text-sm px-4 py-2 cursor-pointer hover:bg-primary-200 transition-colors"
            >
              Cambiar
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                (change)="onFile($event)"
              />
            </label>
            <button
              type="button"
              (click)="url.set(null)"
              class="rounded-pill border border-ink-300 text-ink-700 font-medium text-sm px-4 py-2 hover:bg-primary-50 transition-colors"
            >
              Quitar
            </button>
          </div>
        </div>
      } @else if (uploading()) {
        <p class="text-sm text-ink-500">Subiendo…</p>
      } @else {
        <label
          class="self-start rounded-pill bg-primary-100 text-primary-700 font-semibold text-sm px-4 py-2 cursor-pointer hover:bg-primary-200 transition-colors"
        >
          Subir foto (opcional)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            (change)="onFile($event)"
          />
        </label>
      }

      @if (error(); as err) {
        <p class="text-sm text-danger bg-red-50 rounded-lg px-3 py-2">{{ err }}</p>
      }
    </div>
  `,
})
export class KrPhotoInput {
  private readonly api = inject(MembershipApi);

  readonly url = model<string | null>(null);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Permite re-elegir el mismo archivo después de un error o de "Quitar".
    input.value = '';
    if (!file || this.uploading()) {
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.error.set('Formato no soportado: usá una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      this.error.set('La imagen es muy pesada: el máximo es 5MB.');
      return;
    }

    this.uploading.set(true);
    this.error.set(null);
    this.api.uploadImage(file).subscribe({
      next: (res) => {
        this.uploading.set(false);
        this.url.set(res.url);
      },
      error: (err: ApiError) => {
        this.uploading.set(false);
        this.error.set(err.message);
      },
    });
  }
}
