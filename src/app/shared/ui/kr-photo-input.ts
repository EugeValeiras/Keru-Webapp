import { Component, DestroyRef, ElementRef, computed, inject, model, signal, viewChild } from '@angular/core';
import { ApiError } from '../../core/api/api.types';
import { MembershipApi } from '../../core/api/membership-api.service';
import { KrModal } from './kr-modal';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

// Recorte: viewport cuadrado con máscara CIRCULAR (igual a como se ve en kr-avatar),
// exportado a un canvas mayor para no perder nitidez. El zoom va de "encaje" (1) a 4x.
const VIEW = 256;
const OUTPUT = 512;
const MAX_ZOOM = 4;

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), max);

/**
 * Subida de foto de perfil. Compartido por todas las superficies que dejan cambiar
 * la foto (perfil de cuenta, alta/ficha de paciente, onboarding de cuidador).
 *
 * UX (KER-48):
 *  - El avatar es un botón claramente clickeable: cursor pointer, overlay con ícono de
 *    cámara + "Cambiar" al hover/focus-visible (motion-safe), aria-label y operable por teclado.
 *  - Al elegir una imagen se abre un paso de RECORTE con máscara circular (coincide con la
 *    forma final del avatar): arrastrar para mover y zoom (accesible por teclado) para
 *    encuadrar; al confirmar se renderiza el recorte a un canvas y se sube ESE blob.
 *
 * Contrato intacto: sube a POST /files/images y expone la URL COMMITTEADA del servidor
 * vía el model `url` (lo que se persiste al guardar, nunca un blob local).
 *
 * Preview optimista (KER-69): al confirmar el recorte mostramos YA la imagen local (un object
 * URL del blob recortado) vía el model `preview`, y la subida sigue en segundo plano. El propio
 * avatar del componente pinta `preview() ?? url()`, y la página puede consumir `preview` para su
 * preview grande. Cuando la subida resuelve, `url` pasa a la URL del servidor y `preview` se
 * limpia (swap silencioso); si falla, `preview` se revierte al valor previo. Los object URLs se
 * revocan al swap y al destruir para no filtrar memoria.
 */
@Component({
  selector: 'kr-photo-input',
  imports: [KrModal],
  template: `
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-4">
        <button
          type="button"
          (click)="pick()"
          [attr.aria-label]="displaySrc() ? 'Cambiar foto de perfil' : 'Subir foto de perfil'"
          class="group relative block h-20 w-20 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
        >
          @if (displaySrc(); as u) {
            <img
              [src]="u"
              alt="Foto de perfil"
              class="h-20 w-20 rounded-full object-cover select-none"
            />
          } @else {
            <span
              class="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-primary-300 bg-primary-50 text-primary-500"
            >
              <svg viewBox="0 0 24 24" fill="none" class="h-7 w-7" aria-hidden="true">
                <path
                  d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l.7-1.3A2 2 0 0 1 10.2 3.6h3.6a2 2 0 0 1 1.8 1.1l.7 1.3h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
                  stroke="currentColor"
                  stroke-width="1.6"
                />
                <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </span>
          }
          <span
            class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-full bg-ink-900/55 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:transition-opacity"
          >
            <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5" aria-hidden="true">
              <path
                d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l.7-1.3A2 2 0 0 1 10.2 3.6h3.6a2 2 0 0 1 1.8 1.1l.7 1.3h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
                stroke="currentColor"
                stroke-width="1.6"
              />
              <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" stroke-width="1.6" />
            </svg>
            <span class="text-[10px] font-semibold leading-none">Cambiar</span>
          </span>
        </button>

        <div class="flex flex-col items-start gap-1 text-sm">
          @if (displaySrc()) {
            <button
              type="button"
              (click)="remove()"
              [disabled]="uploading()"
              class="rounded-pill border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-primary-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              Quitar
            </button>
          } @else {
            <p class="text-ink-700">Agregá una foto <span class="text-ink-500">(opcional)</span></p>
            <p class="text-xs text-ink-500">Tocá el círculo para elegirla.</p>
          }
        </div>

        <input
          #fileInput
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          (change)="onFile($event)"
        />
      </div>

      @if (error(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ err }}</p>
      }
    </div>

    @if (cropSrc(); as src) {
      <kr-modal title="Ajustá tu foto" [width]="360" (closed)="cancelCrop()">
        <div class="flex flex-col gap-4">
          <p class="text-sm text-ink-700">
            Arrastrá para mover y usá el zoom para encuadrar. Así se va a ver en tu perfil.
          </p>

          <div
            class="relative self-center touch-none overflow-hidden rounded-card bg-ink-200 select-none"
            style="width: 256px; height: 256px"
            (pointerdown)="onPointerDown($event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp()"
            (pointercancel)="onPointerUp()"
          >
            <img
              #cropImg
              [src]="src"
              alt=""
              draggable="false"
              (load)="onImageLoad($event)"
              class="pointer-events-none absolute max-w-none select-none"
              [style.width.px]="dispW()"
              [style.height.px]="dispH()"
              [style.left.px]="imgLeft()"
              [style.top.px]="imgTop()"
            />
            <!-- Máscara: oscurece TODO menos el círculo (mismo recorte que el avatar). -->
            <div
              class="pointer-events-none absolute inset-0 rounded-full"
              style="box-shadow: 0 0 0 9999px rgba(23, 23, 23, 0.55)"
            ></div>
            <div class="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80"></div>
          </div>

          <label class="flex items-center gap-3 text-sm text-ink-700">
            <span class="font-medium">Zoom</span>
            <input
              type="range"
              min="1"
              [max]="maxZoom"
              step="0.01"
              [value]="scale()"
              (input)="onZoom($event)"
              class="flex-1 accent-primary-600"
              aria-label="Zoom de la foto"
            />
          </label>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              (click)="cancelCrop()"
              [disabled]="uploading()"
              class="rounded-pill border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-primary-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              Cancelar
            </button>
            <button
              type="button"
              (click)="confirmCrop()"
              [disabled]="uploading() || !ready()"
              class="rounded-pill bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              {{ uploading() ? 'Subiendo…' : 'Recortar y subir' }}
            </button>
          </div>
        </div>
      </kr-modal>
    }
  `,
})
export class KrPhotoInput {
  private readonly api = inject(MembershipApi);

  // `url` = URL committeada del servidor (lo que se guarda). `preview` = object URL local optimista
  // mientras la subida está en vuelo (o null cuando ya asentó). `uploading` es model para que la
  // página deshabilite "Guardar" mientras hay una subida en curso.
  readonly url = model<string | null>(null);
  readonly preview = model<string | null>(null);
  readonly uploading = model(false);
  readonly error = signal<string | null>(null);

  // Lo que se muestra en el avatar del componente: el preview optimista tiene prioridad.
  protected readonly displaySrc = computed(() => this.preview() ?? this.url());

  protected readonly maxZoom = MAX_ZOOM;

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly cropImg = viewChild<ElementRef<HTMLImageElement>>('cropImg');

  // Estado del recorte. cropSrc no-nulo = modal abierto.
  protected readonly cropSrc = signal<string | null>(null);
  protected readonly scale = signal(1);
  private readonly natW = signal(0);
  private readonly natH = signal(0);
  private readonly offset = signal({ x: 0, y: 0 });
  private drag: { x: number; y: number; ox: number; oy: number } | null = null;

  // Escala mínima ("cover"): el lado corto de la imagen llena el viewport.
  private readonly coverScale = computed(() => {
    const w = this.natW();
    const h = this.natH();
    return w && h ? Math.max(VIEW / w, VIEW / h) : 1;
  });
  protected readonly dispW = computed(() => this.natW() * this.coverScale() * this.scale());
  protected readonly dispH = computed(() => this.natH() * this.coverScale() * this.scale());
  protected readonly imgLeft = computed(() => (VIEW - this.dispW()) / 2 + this.offset().x);
  protected readonly imgTop = computed(() => (VIEW - this.dispH()) / 2 + this.offset().y);
  // La imagen ya cargó sus dimensiones naturales: recién ahí el recorte es correcto.
  protected readonly ready = computed(() => this.natW() > 0 && this.natH() > 0);

  constructor() {
    // No filtrar object URLs si el componente se destruye con un preview o un recorte en curso.
    inject(DestroyRef).onDestroy(() => {
      const p = this.preview();
      if (p) {
        URL.revokeObjectURL(p);
      }
      const c = this.cropSrc();
      if (c) {
        URL.revokeObjectURL(c);
      }
    });
  }

  pick(): void {
    this.fileInput().nativeElement.click();
  }

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

    this.error.set(null);
    this.openCrop(file);
  }

  private openCrop(file: File): void {
    this.natW.set(0);
    this.natH.set(0);
    this.scale.set(1);
    this.offset.set({ x: 0, y: 0 });
    this.cropSrc.set(URL.createObjectURL(file));
  }

  onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.natW.set(img.naturalWidth);
    this.natH.set(img.naturalHeight);
    this.clampOffset();
  }

  onPointerDown(event: PointerEvent): void {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const { x, y } = this.offset();
    this.drag = { x: event.clientX, y: event.clientY, ox: x, oy: y };
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drag) {
      return;
    }
    this.setOffset(
      this.drag.ox + (event.clientX - this.drag.x),
      this.drag.oy + (event.clientY - this.drag.y),
    );
  }

  onPointerUp(): void {
    this.drag = null;
  }

  onZoom(event: Event): void {
    this.scale.set(Number((event.target as HTMLInputElement).value));
    this.clampOffset();
  }

  private setOffset(x: number, y: number): void {
    const maxX = Math.max(0, (this.dispW() - VIEW) / 2);
    const maxY = Math.max(0, (this.dispH() - VIEW) / 2);
    this.offset.set({ x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) });
  }

  private clampOffset(): void {
    const { x, y } = this.offset();
    this.setOffset(x, y);
  }

  cancelCrop(): void {
    if (this.uploading()) {
      return;
    }
    this.closeCrop();
  }

  private closeCrop(): void {
    const src = this.cropSrc();
    if (src) {
      URL.revokeObjectURL(src);
    }
    this.cropSrc.set(null);
    this.drag = null;
  }

  confirmCrop(): void {
    const img = this.cropImg()?.nativeElement;
    if (!img || this.uploading()) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.error.set('No pudimos procesar la imagen. Probá de nuevo.');
      this.closeCrop();
      return;
    }
    // Replica el mismo encuadre del viewport, escalado a la resolución de salida.
    const k = OUTPUT / VIEW;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, this.imgLeft() * k, this.imgTop() * k, this.dispW() * k, this.dispH() * k);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.error.set('No pudimos procesar la imagen. Probá de nuevo.');
          this.closeCrop();
          return;
        }
        // Preview optimista: mostramos YA el recorte local y cerramos el modal; la subida sigue
        // en segundo plano. `url` no se toca hasta que el servidor responde (lo que se guarda).
        this.setPreview(URL.createObjectURL(blob));
        this.closeCrop();
        this.upload(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  private upload(file: File): void {
    this.uploading.set(true);
    this.error.set(null);
    this.api.uploadImage(file).subscribe({
      next: (res) => {
        this.uploading.set(false);
        // Swap silencioso: la URL committeada pasa a ser la del servidor y soltamos el preview.
        this.url.set(res.url);
        this.setPreview(null);
      },
      error: (err: ApiError) => {
        this.uploading.set(false);
        this.error.set(err.message);
        // Revertir el preview optimista: displaySrc vuelve al valor previo de `url`.
        this.setPreview(null);
      },
    });
  }

  // Quita la foto (deshabilitado mientras hay una subida en vuelo para no re-agregarla al resolver).
  remove(): void {
    this.setPreview(null);
    this.url.set(null);
  }

  // Reemplaza el object URL del preview revocando el anterior para no filtrar memoria.
  private setPreview(next: string | null): void {
    const prev = this.preview();
    if (prev && prev !== next) {
      URL.revokeObjectURL(prev);
    }
    this.preview.set(next);
  }
}
