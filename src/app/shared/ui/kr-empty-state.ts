import { Component, input } from '@angular/core';

@Component({
  selector: 'kr-empty-state',
  template: `
    <div class="bg-sand-100 rounded-card p-12 text-center">
      <p class="text-4xl mb-3">{{ icon() }}</p>
      <h2 class="text-lg font-semibold mb-1">{{ title() }}</h2>
      @if (subtitle()) {
        <p class="text-ink-500 text-sm mb-4">{{ subtitle() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class KrEmptyState {
  readonly icon = input('🕊️');
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
