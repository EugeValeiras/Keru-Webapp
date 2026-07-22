import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { formatDateTime } from '../utils/dates';

Chart.register(...registerables);

export interface ChartLine {
  label: string;
  points: { x: string; y: number }[];
  color: string;
}

/** Etiqueta interna de los datasets de banda: se filtran de leyenda y tooltip. */
const BAND_LABEL = '__band__';

/**
 * Wrapper de chart.js v4. Sin adaptadores de fecha: los timestamps ISO de todos
 * los datasets se unifican ordenados como labels (formatDateTime) y cada serie
 * alinea sus valores por índice (null + spanGaps donde falte).
 */
@Component({
  selector: 'kr-line-chart',
  template: `
    <div class="relative h-72">
      <canvas #canvas></canvas>
    </div>
  `,
})
export class KrLineChart {
  readonly datasets = input.required<ChartLine[]>();
  readonly band = input<{ min: number; max: number } | null>(null);
  readonly unit = input('');

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly ready = signal(false);
  private chart: Chart | null = null;

  constructor() {
    afterNextRender(() => this.ready.set(true));

    effect(() => {
      const datasets = this.datasets();
      const band = this.band();
      const unit = this.unit();
      if (!this.ready()) {
        return;
      }
      this.render(this.canvasRef().nativeElement, datasets, band, unit);
    });

    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  private render(
    canvas: HTMLCanvasElement,
    lines: ChartLine[],
    band: { min: number; max: number } | null,
    unit: string,
  ): void {
    this.chart?.destroy();

    const timestamps = [...new Set(lines.flatMap((l) => l.points.map((p) => p.x)))].sort();
    const labels = timestamps.map(formatDateTime);

    const lineDatasets = lines.map((l) => {
      const byX = new Map(l.points.map((p) => [p.x, p.y]));
      return {
        label: l.label,
        data: timestamps.map((t) => byX.get(t) ?? null),
        borderColor: l.color,
        backgroundColor: l.color,
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true,
      };
    });

    const bandDatasets = band
      ? [
          {
            label: BAND_LABEL,
            data: timestamps.map(() => band.max),
            borderWidth: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
          },
          {
            label: BAND_LABEL,
            data: timestamps.map(() => band.min),
            borderWidth: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: '-1',
            backgroundColor: 'rgba(5,150,105,0.08)',
          },
        ]
      : [];

    this.chart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: [...lineDatasets, ...bandDatasets] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { filter: (item) => item.text !== BAND_LABEL },
          },
          tooltip: {
            filter: (item) => item.dataset.label !== BAND_LABEL,
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${ctx.parsed.y}${unit ? ' ' + unit : ''}`,
            },
          },
        },
      },
    });
  }
}
