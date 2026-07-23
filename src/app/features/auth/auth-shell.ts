import { Component, input } from '@angular/core';

/**
 * Layout compartido de las pantallas públicas (login, signup, /invite/:token):
 * split-screen con panel de marca a la izquierda (desktop) y el formulario
 * sobre canvas a la derecha. En mobile el panel se colapsa a un header con el
 * wordmark. Las páginas proyectan su card; la clase kr-auth-enter le da la
 * entrada sutil (solo sin prefers-reduced-motion).
 */
@Component({
  selector: 'kr-auth-shell',
  template: `
    <div class="min-h-screen lg:grid lg:grid-cols-[2fr_3fr]">
      <aside
        class="hidden lg:flex flex-col justify-between p-12 bg-linear-to-br from-primary-800 to-primary-900"
      >
        <img src="/keru-logo-blanco.svg" alt="Keru" class="h-10 w-auto self-start select-none" />

        <div class="max-w-sm">
          <p class="font-display font-semibold text-[2.5rem] leading-[1.1] text-white">
            {{ tagline() }}
          </p>
          <p class="mt-5 text-primary-100 leading-relaxed">{{ subline() }}</p>
        </div>

        <!-- El abrazo: dos arcos que sostienen y el punto terracota —la persona
             cuidada— siempre arriba, como en la "k" del logo. Solo decorativo. -->
        <svg viewBox="0 0 200 120" aria-hidden="true" class="w-44 self-end opacity-90">
          <g fill="none" stroke-linecap="round">
            <path
              d="M30 108a72 72 0 0 1 140 0"
              stroke="rgb(255 255 255 / 0.14)"
              stroke-width="9"
            />
            <path
              d="M56 108a45 45 0 0 1 88 0"
              stroke="rgb(255 255 255 / 0.26)"
              stroke-width="9"
            />
            <circle cx="100" cy="26" r="10" fill="#EDA57F" class="kr-auth-dot" />
          </g>
        </svg>
      </aside>

      <main class="flex items-center justify-center px-4 py-10">
        <div class="w-full max-w-md">
          <div class="text-center mb-8 lg:hidden">
            <img src="/keru-logo.svg" alt="Keru" class="h-9 w-auto mx-auto select-none" />
            <p class="text-ink-500 mt-3 text-sm">{{ subline() }}</p>
          </div>
          <div class="kr-auth-enter">
            <ng-content />
          </div>
        </div>
      </main>
    </div>
  `,
})
export class AuthShell {
  /** Frase display del panel de marca (Fraunces, la voz de Keru). */
  readonly tagline = input('La calma de saber que alguien que sabe está cuidando a quien querés.');
  /** Acompañamiento en tono conversación (Figtree). */
  readonly subline = input('Cuidado de confianza para los tuyos.');
}
