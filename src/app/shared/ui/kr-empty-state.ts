import { Component, input } from '@angular/core';
import { IllustrationScene, KrIllustration } from './kr-illustration';

@Component({
  selector: 'kr-empty-state',
  imports: [KrIllustration],
  template: `
    <div class="bg-sand-100 rounded-card p-12 text-center">
      @if (scene(); as s) {
        <kr-illustration [scene]="s" class="mb-4" />
      } @else {
        <p class="text-4xl mb-3">{{ icon() }}</p>
      }
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
  /** Escena ilustrada de marca; si está, reemplaza al emoji de icon. */
  readonly scene = input<IllustrationScene | null>(null);
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
