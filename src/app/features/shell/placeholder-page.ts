import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Página provisoria mientras se construyen las features de la Fase 1. */
@Component({
  selector: 'kr-placeholder-page',
  template: `
    <div class="bg-surface rounded-card shadow-card p-12 text-center">
      <h1 class="text-2xl font-semibold mb-2">{{ title }}</h1>
      <p class="text-ink-500">Esta sección está en construcción.</p>
    </div>
  `,
})
export class PlaceholderPage {
  protected readonly title: string =
    inject(ActivatedRoute).snapshot.data['title'] ?? 'Próximamente';
}
