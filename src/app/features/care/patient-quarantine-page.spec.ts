import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PatientQuarantinePage } from './patient-quarantine-page';
import { QuarantinedRecord } from '../../core/api/api.types';
import { errorInterceptor } from '../../core/auth/error.interceptor';

/**
 * UC-12 A3 · Cuarentena (NFR-30): el círculo ve los items pendientes y los resuelve.
 * La API es la autoridad (consent-holder/manager); acá se prueba el flujo de la página.
 */

const item = (over: Partial<QuarantinedRecord> = {}): QuarantinedRecord => ({
  id: 'q-1',
  patientId: 'pat-1',
  type: 'note',
  measuredAt: '2026-07-20T22:30:00Z',
  receivedAt: '2026-07-22T10:00:00Z',
  authorAccountId: 'acc-cg',
  authorRole: 'caregiver',
  reason: 'no-authority-at-measurement',
  status: 'pending',
  data: { text: 'Registro que llegó tarde' },
  ...over,
});

describe('PatientQuarantinePage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientQuarantinePage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['patientId', 'pat-1']]) } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function create() {
    const fixture = TestBed.createComponent(PatientQuarantinePage);
    fixture.detectChanges();
    http.expectOne('/api/v1/catalogs').flush({ metrics: [] });
    return fixture;
  }

  it('lista los items pendientes en cuarentena del paciente', async () => {
    const fixture = create();
    http.expectOne('/api/v1/patients/pat-1/quarantine').flush([item(), item({ id: 'q-2', status: 'discarded' })]);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Registro que llegó tarde');
    expect(text).toContain('Pendientes (1)');
    expect(text).toContain('Resueltos (1)');
  });

  it('aprobar llama al endpoint y el item pasa a resuelto', async () => {
    const fixture = create();
    http.expectOne('/api/v1/patients/pat-1/quarantine').flush([item()]);
    await fixture.whenStable();

    const approveBtn = (fixture.nativeElement as HTMLElement).querySelector('ol button') as HTMLButtonElement;
    expect(approveBtn.textContent).toContain('Aprobar');
    approveBtn.click();

    const req = http.expectOne('/api/v1/patients/pat-1/quarantine/q-1/approve');
    expect(req.request.method).toBe('POST');
    req.flush(item({ status: 'approved', approvedRecordId: 'rec-1', resolvedAt: '2026-07-22T12:00:00Z' }));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Pendientes (0)');
    expect(text).toContain('Resueltos (1)');
    expect(text).toContain('Registro aprobado');
  });

  it('un 403 muestra el estado sin acceso (la cuarentena es del círculo)', async () => {
    const fixture = create();
    http
      .expectOne('/api/v1/patients/pat-1/quarantine')
      .flush({ statusCode: 403, message: 'No estás vinculado' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Sin acceso a este paciente');
  });
});
