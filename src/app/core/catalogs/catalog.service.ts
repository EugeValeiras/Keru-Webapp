import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { CatalogMetric, Catalogs, MetricKey } from '../api/api.types';

/** Catálogos estáticos por deploy (métricas con unidad/rangos, enums): cache por sesión. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  readonly catalogs$: Observable<Catalogs> = this.http
    .get<Catalogs>('/api/v1/catalogs')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  metricFor(catalogs: Catalogs, key: MetricKey): CatalogMetric | undefined {
    return catalogs.metrics.find((m) => m.key === key);
  }
}
