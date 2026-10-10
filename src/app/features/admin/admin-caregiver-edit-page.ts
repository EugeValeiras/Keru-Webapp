import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, concat, tap, toArray } from 'rxjs';
import { AdminApi } from '../../core/api/admin-api.service';
import {
  AdminCaregiverDetail,
  AdminUpdateCaregiverDto,
  AdminUpdateCertificationDto,
  ApiError,
  CertificationCatalogItem,
  MODALITY_LABELS,
  Modality,
  SPECIALTY_LABELS,
  Specialty,
} from '../../core/api/api.types';
import { StepUpStore } from '../../core/auth/step-up.store';
import { newOperationId } from '../../core/idempotency/operation-id';
import { DaySlot, isSlotValid, sortSlots } from '../../shared/ui/availability';
import { KrAvailabilityEditor } from '../../shared/ui/kr-availability-editor';
import { KrAvatar } from '../../shared/ui/kr-avatar';
import { KrBadge, BadgeTone } from '../../shared/ui/kr-badge';
import { KrCertIcon } from '../../shared/ui/kr-cert-icon';
import { KrFieldError } from '../../shared/ui/kr-field-error';
import { KrPhotoInput } from '../../shared/ui/kr-photo-input';
import { KrRequiredMark } from '../../shared/ui/kr-required-mark';
import { ToastService } from '../../shared/ui/toast.service';

/** Una certificación existente del cuidador tal como la edita el admin (tipo/institución/año + quitar). */
interface CertRow {
  id: string;
  catalogKey: string;
  institution: string;
  year: number | null;
  status: string;
  /** Valores con los que llegó: el guardado manda solo lo que cambió. */
  original: { catalogKey: string; institution: string; year: number };
  /** Marcada para darse de baja al guardar (se puede deshacer antes de guardar). */
  removed: boolean;
}

const CERT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Verificada',
  rejected: 'Rechazada',
};
const CERT_STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  approved: 'gold',
  rejected: 'danger',
};

const MIN_YEAR = 1950;
const MAX_YEAR = 2100;

/**
 * #49 · UC-19 A3 · El administrador corrige cualquier dato que el cuidador declaró: identidad (nombre y
 * foto, que viven en su cuenta — ADR-0003) y perfil profesional (especialidades, certificaciones
 * existentes, disponibilidad, tarifa, zona, modalidades), en cualquier estado del cuidador y sin tocar
 * su estado de aprobación ni sus insignias. Reutiliza los widgets del onboarding y de la edición del
 * cuidador (kr-photo-input, kr-availability-editor, selectores, catálogo).
 *
 * Guardar manda SOLO lo que cambió (set parcial): un PATCH del perfil/identidad y un PATCH/DELETE por
 * cada certificación corregida o quitada, todos con el mismo token de step-up (NFR-33) que pide
 * StepUpStore la primera vez. Los errores de validación se señalan en el campo y no persisten.
 */
@Component({
  selector: 'kr-admin-caregiver-edit-page',
  imports: [
    FormsModule,
    RouterLink,
    KrAvailabilityEditor,
    KrAvatar,
    KrBadge,
    KrCertIcon,
    KrFieldError,
    KrPhotoInput,
    KrRequiredMark,
  ],
  template: `
    <div class="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1>Editar cuidador</h1>
        <p class="text-ink-500 mt-1">
          Corregís los datos que declaró el cuidador. Su estado de aprobación y sus insignias no cambian.
        </p>
      </div>

      @if (loading()) {
        <p class="text-ink-500">Cargando los datos del cuidador…</p>
      } @else if (loadError(); as err) {
        <p role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">{{ err }}</p>
      } @else if (original(); as d) {
        <form class="flex flex-col gap-6" (ngSubmit)="save()" novalidate>
          @if (error(); as err) {
            <div role="alert" class="text-sm text-danger bg-danger-50 rounded-control px-3 py-2">
              <p>{{ err }}</p>
              @if (fieldErrors().length > 0) {
                <ul class="list-disc list-inside mt-1">
                  @for (f of fieldErrors(); track f) {
                    <li>{{ f }}</li>
                  }
                </ul>
              }
              @if (reloadRequired()) {
                <button
                  type="button"
                  (click)="reload()"
                  class="mt-2 rounded-pill border border-danger text-danger text-sm font-medium py-1.5 px-4 hover:bg-danger-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  Recargar la página
                </button>
              }
            </div>
          }

          <!-- Identidad: vive en la cuenta del cuidador (ADR-0003); se ve igual en el marketplace y en su encabezado. -->
          <section class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
            <h2 class="text-lg font-semibold">Identidad</h2>
            <p class="text-sm text-ink-500">
              Nombre y foto son los de la cuenta del cuidador: se ven en el buscador, en su ficha y en su
              encabezado.
            </p>
            <div class="flex items-center gap-4">
              <kr-avatar [name]="displayName() || '—'" [seed]="d.id" [photoUrl]="displayPhoto()" [size]="72" />
              <div class="min-w-0">
                <p class="font-semibold text-ink-900 truncate">{{ displayName() || 'Sin nombre' }}</p>
                <p class="text-sm text-ink-500">{{ statusLabel(d.status) }}</p>
              </div>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">
                <span id="edit-name-label">Nombre y apellido</span> <kr-required-mark />
              </span>
              <input
                type="text"
                name="displayName"
                aria-labelledby="edit-name-label"
                required
                maxlength="200"
                autocomplete="off"
                [ngModel]="displayName()"
                (ngModelChange)="displayName.set($event)"
                [attr.aria-invalid]="showNameError() ? 'true' : null"
                [attr.aria-describedby]="showNameError() ? 'err-displayName' : null"
                class="rounded-control border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                [class.border-ink-300]="!showNameError()"
                [class.border-danger]="showNameError()"
              />
              @if (showNameError()) {
                <kr-field-error id="err-displayName">Ingresá el nombre y apellido.</kr-field-error>
              }
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Foto de perfil</span>
              <kr-photo-input [(url)]="photoUrl" [(preview)]="pendingPreview" [(uploading)]="photoUploading" />
            </div>
          </section>

          <!-- Especialidades -->
          <section class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-3">
            <h2 class="text-lg font-semibold">
              <span id="edit-specialties-label">Especialidades</span> <kr-required-mark />
            </h2>
            <div
              role="group"
              aria-labelledby="edit-specialties-label"
              [attr.aria-describedby]="showSpecialtiesError() ? 'err-specialties' : null"
              class="grid grid-cols-2 gap-3"
            >
              @for (opt of specialtyOptions; track opt[0]) {
                <label
                  class="flex items-center gap-2 rounded-control border px-3 py-2 cursor-pointer transition-colors"
                  [class.border-primary-600]="specialtySel[opt[0]]"
                  [class.bg-primary-50]="specialtySel[opt[0]]"
                  [class.border-ink-300]="!specialtySel[opt[0]]"
                >
                  <input
                    type="checkbox"
                    [name]="'spec-' + opt[0]"
                    [(ngModel)]="specialtySel[opt[0]]"
                    class="accent-primary-600"
                  />
                  <span class="text-sm">{{ opt[1] }}</span>
                </label>
              }
            </div>
            @if (showSpecialtiesError()) {
              <kr-field-error id="err-specialties">Elegí al menos una especialidad.</kr-field-error>
            }
          </section>

          <!-- Certificaciones existentes: tipo/institución/año + quitar. Agregar una nueva sigue siendo del cuidador (UC-02 A4). -->
          <section class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
            <h2 class="text-lg font-semibold">Certificaciones</h2>
            @if (certs().length === 0) {
              <p class="text-sm text-ink-500">No declaró certificaciones.</p>
            } @else {
              <p class="text-sm text-ink-500">
                Corregís tipo, institución y año, o quitás una certificación. Su verificación no cambia al
                corregirla; el documento adjunto y las certificaciones nuevas las carga el cuidador.
              </p>
              <ul class="flex flex-col gap-3">
                @for (cert of certs(); track cert.id; let i = $index) {
                  <li class="rounded-control border border-ink-200 p-4 flex flex-col gap-3">
                    @if (cert.removed) {
                      <div class="flex items-center justify-between gap-3 flex-wrap">
                        <p class="text-sm text-ink-700">
                          <span class="line-through text-ink-500">{{ catalogLabel(cert.original.catalogKey) }}</span>
                          · se quita al guardar
                        </p>
                        <button
                          type="button"
                          (click)="undoRemoveCert(i)"
                          class="rounded-pill border border-ink-300 text-ink-700 text-sm font-medium py-1.5 px-4 hover:bg-primary-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          Deshacer
                        </button>
                      </div>
                    } @else {
                      <div class="flex items-center justify-between gap-2 flex-wrap">
                        <span class="font-medium inline-flex items-center gap-1.5">
                          <kr-cert-icon [iconKey]="catalogIconKey(cert.catalogKey)" />{{ catalogLabel(cert.catalogKey) }}
                        </span>
                        <kr-badge [tone]="certStatusTone(cert.status)">{{ certStatusLabel(cert.status) }}</kr-badge>
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <label class="flex flex-col gap-1">
                          <span class="text-sm font-medium text-ink-700">Tipo</span>
                          <select
                            [name]="'cert-type-' + cert.id"
                            [(ngModel)]="cert.catalogKey"
                            class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                          >
                            <!-- Un <option> no renderiza SVG: el emoji del catálogo es el fallback text-only (KER-77). -->
                            @for (item of catalog(); track item.key) {
                              <option [value]="item.key">{{ item.badgeIcon }} {{ item.label }}</option>
                            }
                          </select>
                        </label>
                        <label class="flex flex-col gap-1">
                          <span class="text-sm font-medium text-ink-700">
                            <span [id]="'cert-inst-label-' + cert.id">Institución</span> <kr-required-mark />
                          </span>
                          <input
                            type="text"
                            [name]="'cert-inst-' + cert.id"
                            [attr.aria-labelledby]="'cert-inst-label-' + cert.id"
                            required
                            maxlength="200"
                            [(ngModel)]="cert.institution"
                            [attr.aria-invalid]="showCertInstitutionError(cert) ? 'true' : null"
                            [attr.aria-describedby]="showCertInstitutionError(cert) ? 'err-cert-inst-' + cert.id : null"
                            class="rounded-control border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                            [class.border-ink-300]="!showCertInstitutionError(cert)"
                            [class.border-danger]="showCertInstitutionError(cert)"
                          />
                          @if (showCertInstitutionError(cert)) {
                            <kr-field-error [id]="'err-cert-inst-' + cert.id">Ingresá la institución.</kr-field-error>
                          }
                        </label>
                        <label class="flex flex-col gap-1">
                          <span class="text-sm font-medium text-ink-700">
                            <span [id]="'cert-year-label-' + cert.id">Año</span> <kr-required-mark />
                          </span>
                          <input
                            type="number"
                            [name]="'cert-year-' + cert.id"
                            [attr.aria-labelledby]="'cert-year-label-' + cert.id"
                            required
                            [min]="minYear"
                            [max]="maxYear"
                            [(ngModel)]="cert.year"
                            [attr.aria-invalid]="showCertYearError(cert) ? 'true' : null"
                            [attr.aria-describedby]="showCertYearError(cert) ? 'err-cert-year-' + cert.id : null"
                            class="rounded-control border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                            [class.border-ink-300]="!showCertYearError(cert)"
                            [class.border-danger]="showCertYearError(cert)"
                          />
                          @if (showCertYearError(cert)) {
                            <kr-field-error [id]="'err-cert-year-' + cert.id">
                              Ingresá un año entre {{ minYear }} y {{ maxYear }}.
                            </kr-field-error>
                          }
                        </label>
                      </div>
                      <div>
                        <button
                          type="button"
                          (click)="removeCert(i)"
                          [attr.aria-label]="'Quitar certificación ' + catalogLabel(cert.catalogKey)"
                          class="rounded-pill border border-ink-300 text-danger text-sm font-medium py-1.5 px-4 hover:bg-danger-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                        >
                          Quitar
                        </button>
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          </section>

          <!-- Disponibilidad (kr-availability-editor, KER-53) -->
          <section class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-3">
            <h2 class="text-lg font-semibold">Disponibilidad <kr-required-mark /></h2>
            <kr-availability-editor [(slots)]="slots" />
            @if (showSlotsError()) {
              <kr-field-error id="err-availability">Agregá al menos un horario válido.</kr-field-error>
            }
          </section>

          <!-- Tarifa (efectivo-fechada, NFR-03/23) -->
          <section class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
            <h2 class="text-lg font-semibold">Tarifa</h2>
            <p class="text-sm text-ink-500">
              El cambio rige desde ahora: las solicitudes ya emitidas conservan la tarifa con la que se hicieron.
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-ink-700">
                  <span id="edit-rate-label">Tarifa por hora</span> <kr-required-mark />
                </span>
                <input
                  type="number"
                  name="ratePerHour"
                  aria-labelledby="edit-rate-label"
                  required
                  min="1"
                  [(ngModel)]="ratePerHour"
                  [attr.aria-invalid]="showRateError() ? 'true' : null"
                  [attr.aria-describedby]="showRateError() ? 'err-ratePerHour' : null"
                  class="rounded-control border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  [class.border-ink-300]="!showRateError()"
                  [class.border-danger]="showRateError()"
                />
                @if (showRateError()) {
                  <kr-field-error id="err-ratePerHour">La tarifa tiene que ser mayor que 0.</kr-field-error>
                }
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-ink-700">
                  <span id="edit-currency-label">Moneda</span> <kr-required-mark />
                </span>
                <input
                  type="text"
                  name="currency"
                  aria-labelledby="edit-currency-label"
                  required
                  maxlength="8"
                  [(ngModel)]="currency"
                  [attr.aria-invalid]="showCurrencyError() ? 'true' : null"
                  [attr.aria-describedby]="showCurrencyError() ? 'err-currency' : null"
                  class="rounded-control border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  [class.border-ink-300]="!showCurrencyError()"
                  [class.border-danger]="showCurrencyError()"
                />
                @if (showCurrencyError()) {
                  <kr-field-error id="err-currency">Ingresá la moneda (p. ej. ARS).</kr-field-error>
                }
              </label>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Descripción de la tarifa (opcional)</span>
              <input
                type="text"
                name="rateDescription"
                maxlength="300"
                [(ngModel)]="rateDescription"
                placeholder="Ej: Incluye acompañamiento nocturno"
                class="rounded-control border border-ink-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
          </section>

          <!-- Zona y modalidades -->
          <section class="bg-surface rounded-card shadow-card p-6 flex flex-col gap-4">
            <h2 class="text-lg font-semibold">Zona y modalidades</h2>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">
                <span id="edit-zone-label">Zona</span> <kr-required-mark />
              </span>
              <input
                type="text"
                name="zone"
                aria-labelledby="edit-zone-label"
                required
                maxlength="120"
                [(ngModel)]="zone"
                placeholder="Ej: Palermo, CABA"
                [attr.aria-invalid]="showZoneError() ? 'true' : null"
                [attr.aria-describedby]="showZoneError() ? 'err-zone' : null"
                class="rounded-control border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-400"
                [class.border-ink-300]="!showZoneError()"
                [class.border-danger]="showZoneError()"
              />
              @if (showZoneError()) {
                <kr-field-error id="err-zone">Ingresá la zona de trabajo.</kr-field-error>
              }
            </label>
            <div class="flex flex-col gap-2">
              <p class="text-sm font-medium text-ink-700">
                <span id="edit-modalities-label">Modalidades</span> <kr-required-mark />
              </p>
              <div
                role="group"
                aria-labelledby="edit-modalities-label"
                [attr.aria-describedby]="showModalitiesError() ? 'err-modalities' : null"
                class="flex gap-3 flex-wrap"
              >
                @for (opt of modalityOptions; track opt[0]) {
                  <label
                    class="flex items-center gap-2 rounded-control border px-3 py-2 cursor-pointer transition-colors"
                    [class.border-primary-600]="modalitySel[opt[0]]"
                    [class.bg-primary-50]="modalitySel[opt[0]]"
                    [class.border-ink-300]="!modalitySel[opt[0]]"
                  >
                    <input
                      type="checkbox"
                      [name]="'mod-' + opt[0]"
                      [(ngModel)]="modalitySel[opt[0]]"
                      class="accent-primary-600"
                    />
                    <span class="text-sm">{{ opt[1] }}</span>
                  </label>
                }
              </div>
              @if (showModalitiesError()) {
                <kr-field-error id="err-modalities">Elegí al menos una modalidad.</kr-field-error>
              }
            </div>
          </section>

          <div class="flex justify-between gap-3 flex-wrap">
            <a
              [routerLink]="['/admin/caregivers', d.id]"
              class="rounded-pill border border-ink-300 text-ink-700 font-medium py-2.5 px-6 hover:bg-primary-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              Cancelar
            </a>
            <button
              type="submit"
              [disabled]="saving() || refreshing() || reloadRequired() || photoUploading()"
              class="rounded-pill bg-primary-600 text-white font-semibold py-2.5 px-6 hover:bg-primary-700 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              {{ saving() ? 'Guardando…' : refreshing() ? 'Actualizando…' : 'Guardar cambios' }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class AdminCaregiverEditPage {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly stepUp = inject(StepUpStore);
  private readonly toasts = inject(ToastService);

  private readonly id = this.route.snapshot.paramMap.get('id')!;
  /**
   * operationId del PRÓXIMO PATCH del perfil (NFR-34). Un guardado que falló lo reusa, así el reintento
   * es idempotente (no duplica la versión de tarifa); pero cuando el PATCH resolvió con éxito se acuña
   * uno nuevo: si la página sigue abierta (p. ej. falló una operación posterior sobre una certificación)
   * y el admin vuelve a corregir la tarifa, es OTRA versión efectivo-fechada (NFR-03/23) — con el id
   * viejo `createRateVersion` devolvería la versión anterior y la vigente quedaría sin historial.
   */
  private operationId = newOperationId();

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  /**
   * Tras un guardado que falló a mitad de camino, la base del diff (`original`) se refresca del backend;
   * hasta que resuelva, guardar sigue bloqueado: un reintento con la base vieja mandaría de nuevo lo que
   * ya persistió (otra versión de tarifa idéntica con el operationId nuevo, otro audit).
   */
  readonly refreshing = signal(false);
  /** El refresco falló: sin base confiable para el diff no se habilita el reintento a ciegas. */
  readonly reloadRequired = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<string[]>([]);
  /** Tras el primer intento de guardar, los errores se muestran en vivo junto a cada campo. */
  readonly submitted = signal(false);

  /** Lo que devolvió el backend: el guardado manda solo las claves que cambiaron respecto de esto. */
  readonly original = signal<AdminCaregiverDetail | null>(null);
  readonly catalog = signal<CertificationCatalogItem[]>([]);

  readonly specialtyOptions = Object.entries(SPECIALTY_LABELS) as [Specialty, string][];
  readonly modalityOptions = Object.entries(MODALITY_LABELS) as [Modality, string][];
  readonly minYear = MIN_YEAR;
  readonly maxYear = MAX_YEAR;

  // Estado del formulario.
  readonly displayName = signal('');
  readonly photoUrl = signal<string | null>(null);
  readonly pendingPreview = signal<string | null>(null);
  readonly photoUploading = signal(false);
  readonly displayPhoto = computed(() => this.pendingPreview() ?? this.photoUrl());
  specialtySel: Record<string, boolean> = {};
  readonly certs = signal<CertRow[]>([]);
  slots: DaySlot[] = [];
  ratePerHour: number | null = null;
  currency = 'ARS';
  rateDescription = '';
  zone = '';
  modalitySel: Record<string, boolean> = {};

  constructor() {
    this.api.getCertificationCatalog().subscribe({
      next: (items) => this.catalog.set(items),
      error: () => this.catalog.set([]),
    });
    this.api.getDetail(this.id).subscribe({
      next: (d) => {
        this.prefill(d);
        this.original.set(d);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.loadError.set(err.message);
      },
    });
  }

  private prefill(d: AdminCaregiverDetail): void {
    this.displayName.set(d.displayName);
    this.photoUrl.set(d.photoUrl ?? null);
    this.specialtySel = {};
    for (const s of d.specialties) {
      this.specialtySel[s] = true;
    }
    this.certs.set(
      d.certifications.map((c) => ({
        id: c.id,
        catalogKey: c.catalogKey,
        institution: c.institution,
        year: c.year,
        status: c.status,
        original: { catalogKey: c.catalogKey, institution: c.institution, year: c.year },
        removed: false,
      })),
    );
    this.slots = d.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, from: a.from, to: a.to }));
    this.ratePerHour = d.rates?.ratePerHour ?? null;
    this.currency = d.rates?.currency ?? 'ARS';
    this.rateDescription = d.rates?.description ?? '';
    this.zone = d.zone;
    this.modalitySel = {};
    for (const m of d.modalities) {
      this.modalitySel[m] = true;
    }
  }

  // --- Catálogo / etiquetas ---

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente de aprobación',
      approved: 'Aprobado',
      rejected: 'Rechazado',
      deactivated: 'Desactivado',
    };
    return labels[status] ?? status;
  }

  catalogLabel(key: string): string {
    return this.catalog().find((i) => i.key === key)?.label ?? key;
  }

  catalogIconKey(key: string): string {
    return this.catalog().find((i) => i.key === key)?.iconKey ?? 'award';
  }

  certStatusLabel(status: string): string {
    return CERT_STATUS_LABEL[status] ?? status;
  }

  certStatusTone(status: string): BadgeTone {
    return CERT_STATUS_TONE[status] ?? 'neutral';
  }

  // --- Certificaciones: quitar / deshacer ---

  removeCert(index: number): void {
    this.certs.update((list) => list.map((c, i) => (i === index ? { ...c, removed: true } : c)));
  }

  undoRemoveCert(index: number): void {
    this.certs.update((list) => list.map((c, i) => (i === index ? { ...c, removed: false } : c)));
  }

  // --- Validación inline (se muestra tras el primer intento de guardar) ---

  private selectedSpecialties(): Specialty[] {
    return this.specialtyOptions.map(([key]) => key).filter((key) => this.specialtySel[key]);
  }

  private selectedModalities(): Modality[] {
    return this.modalityOptions.map(([key]) => key).filter((key) => this.modalitySel[key]);
  }

  private nameValid(): boolean {
    return this.displayName().trim().length > 0;
  }
  private specialtiesValid(): boolean {
    return this.selectedSpecialties().length > 0;
  }
  private slotsValid(): boolean {
    return this.slots.length > 0 && this.slots.every(isSlotValid);
  }
  private rateValid(): boolean {
    return this.ratePerHour !== null && Number(this.ratePerHour) > 0;
  }
  private currencyValid(): boolean {
    return this.currency.trim().length > 0;
  }
  private zoneValid(): boolean {
    return this.zone.trim().length > 0;
  }
  private modalitiesValid(): boolean {
    return this.selectedModalities().length > 0;
  }
  private certInstitutionValid(cert: CertRow): boolean {
    return cert.removed || cert.institution.trim().length > 0;
  }
  private certYearValid(cert: CertRow): boolean {
    if (cert.removed) {
      return true;
    }
    const year = Number(cert.year);
    return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
  }

  showNameError(): boolean {
    return this.submitted() && !this.nameValid();
  }
  showSpecialtiesError(): boolean {
    return this.submitted() && !this.specialtiesValid();
  }
  showSlotsError(): boolean {
    return this.submitted() && !this.slotsValid();
  }
  showRateError(): boolean {
    return this.submitted() && !this.rateValid();
  }
  showCurrencyError(): boolean {
    return this.submitted() && !this.currencyValid();
  }
  showZoneError(): boolean {
    return this.submitted() && !this.zoneValid();
  }
  showModalitiesError(): boolean {
    return this.submitted() && !this.modalitiesValid();
  }
  showCertInstitutionError(cert: CertRow): boolean {
    return this.submitted() && !this.certInstitutionValid(cert);
  }
  showCertYearError(cert: CertRow): boolean {
    return this.submitted() && !this.certYearValid(cert);
  }

  formValid(): boolean {
    return (
      this.nameValid() &&
      this.specialtiesValid() &&
      this.slotsValid() &&
      this.rateValid() &&
      this.currencyValid() &&
      this.zoneValid() &&
      this.modalitiesValid() &&
      this.certs().every((c) => this.certInstitutionValid(c) && this.certYearValid(c))
    );
  }

  // --- Guardar: solo lo que cambió, con step-up ---

  /** Patch del perfil/identidad: solo las claves cuyo valor difiere del original (set parcial). */
  private buildPatch(d: AdminCaregiverDetail): Omit<AdminUpdateCaregiverDto, 'operationId'> {
    const patch: Omit<AdminUpdateCaregiverDto, 'operationId'> = {};
    const name = this.displayName().trim();
    if (name !== d.displayName) {
      patch.displayName = name;
    }
    if ((this.photoUrl() ?? null) !== (d.photoUrl ?? null)) {
      patch.photoUrl = this.photoUrl();
    }
    const specialties = this.selectedSpecialties();
    if (!sameSet(specialties, d.specialties)) {
      patch.specialties = specialties;
    }
    const availability = sortSlots(
      this.slots.map((s) => ({ dayOfWeek: Number(s.dayOfWeek), from: s.from, to: s.to })),
    );
    if (!sameSlots(availability, sortSlots(d.availability))) {
      patch.availability = availability;
    }
    const rate = Number(this.ratePerHour);
    const currency = this.currency.trim();
    const description = this.rateDescription.trim();
    if (
      rate !== d.rates.ratePerHour ||
      currency !== d.rates.currency ||
      description !== (d.rates.description ?? '')
    ) {
      patch.rates = { ratePerHour: rate, currency, ...(description ? { description } : {}) };
    }
    const zone = this.zone.trim();
    if (zone !== d.zone) {
      patch.zone = zone;
    }
    const modalities = this.selectedModalities();
    if (!sameSet(modalities, d.modalities)) {
      patch.modalities = modalities;
    }
    return patch;
  }

  /** Correcciones por certificación: solo los campos que cambiaron de cada una (no quitada). */
  private buildCertPatches(): { certId: string; patch: AdminUpdateCertificationDto }[] {
    const out: { certId: string; patch: AdminUpdateCertificationDto }[] = [];
    for (const c of this.certs()) {
      if (c.removed) {
        continue;
      }
      const patch: AdminUpdateCertificationDto = {};
      if (c.catalogKey !== c.original.catalogKey) {
        patch.catalogKey = c.catalogKey as AdminUpdateCertificationDto['catalogKey'];
      }
      const institution = c.institution.trim();
      if (institution !== c.original.institution) {
        patch.institution = institution;
      }
      if (Number(c.year) !== c.original.year) {
        patch.year = Number(c.year);
      }
      if (Object.keys(patch).length > 0) {
        out.push({ certId: c.id, patch });
      }
    }
    return out;
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    const d = this.original();
    if (
      !d ||
      this.saving() ||
      this.refreshing() ||
      this.reloadRequired() ||
      this.photoUploading() ||
      !this.formValid()
    ) {
      return;
    }

    const patch = this.buildPatch(d);
    const certPatches = this.buildCertPatches();
    const removedIds = this.certs()
      .filter((c) => c.removed)
      .map((c) => c.id);

    if (Object.keys(patch).length === 0 && certPatches.length === 0 && removedIds.length === 0) {
      this.toasts.info('No había cambios para guardar.');
      void this.router.navigate(['/admin/caregivers', this.id]);
      return;
    }

    // NFR-33: mutación sobre datos de un tercero → step-up (cacheado ~5 min por StepUpStore).
    const token = await this.stepUp.require();
    if (!token) {
      return; // canceló la re-confirmación
    }

    const ops: Observable<AdminCaregiverDetail>[] = [];
    if (Object.keys(patch).length > 0) {
      ops.push(
        this.api
          .update(this.id, { operationId: this.operationId, ...patch }, token)
          // Resolvió: el próximo PATCH del perfil es otra operación (ver `operationId`).
          .pipe(tap(() => (this.operationId = newOperationId()))),
      );
    }
    for (const { certId, patch: certPatch } of certPatches) {
      ops.push(this.api.updateCertification(this.id, certId, certPatch, token));
    }
    for (const certId of removedIds) {
      ops.push(this.api.removeCertification(this.id, certId, token));
    }

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set([]);
    concat(...ops)
      .pipe(toArray())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toasts.success('Datos del cuidador actualizados.');
          void this.router.navigate(['/admin/caregivers', this.id]);
        },
        error: (err: ApiError) => {
          this.saving.set(false);
          if (err.code === 'STEP_UP_REQUIRED') {
            this.stepUp.clear(); // el token cacheado venció en vuelo: el próximo intento re-pide el password
          }
          this.error.set(err.message);
          this.fieldErrors.set(err.fields);
          // Algunas operaciones pueden haber persistido: refrescamos la base del diff (sin pisar lo
          // que el admin tiene en el formulario) para que el reintento mande solo lo que falta. Hasta
          // que resuelva, guardar queda bloqueado (`refreshing`); si falla, no hay base confiable y se
          // pide recargar en vez de habilitar un reintento a ciegas (`reloadRequired`).
          this.refreshing.set(true);
          this.api.getDetail(this.id).subscribe({
            next: (fresh) => {
              this.original.set(fresh);
              this.certs.update((list) =>
                list
                  .filter((c) => fresh.certifications.some((fc) => fc.id === c.id))
                  .map((c) => {
                    const fc = fresh.certifications.find((x) => x.id === c.id)!;
                    return { ...c, original: { catalogKey: fc.catalogKey, institution: fc.institution, year: fc.year } };
                  }),
              );
              this.refreshing.set(false);
            },
            error: (refreshErr: ApiError) => {
              this.refreshing.set(false);
              this.reloadRequired.set(true);
              this.error.set(
                `${err.message} Además no pudimos actualizar los datos del cuidador (${refreshErr.message}): recargá la página antes de volver a guardar.`,
              );
            },
          });
        },
      });
  }

  /** Sin base confiable para el diff (falló el refresco tras un error): se vuelve a cargar todo. */
  reload(): void {
    window.location.reload();
  }
}

/**
 * Igualdad slot a slot de dos listas YA ordenadas (`sortSlots`). No sirve stringificar: la API devuelve
 * el jsonb con las claves en el orden que normaliza Postgres (`{to, from, dayOfWeek}`), distinto del
 * que arma el formulario, y una disponibilidad sin cambios figuraría siempre como cambiada.
 */
function sameSlots(a: readonly DaySlot[], b: readonly DaySlot[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (s, i) => Number(s.dayOfWeek) === Number(b[i].dayOfWeek) && s.from === b[i].from && s.to === b[i].to,
    )
  );
}

/** Igualdad de conjuntos (el orden de los chips no importa). */
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(b);
  return a.every((x) => set.has(x));
}
