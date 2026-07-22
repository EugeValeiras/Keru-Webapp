# Plan de la webapp Angular de Keru — marketplace de cuidadores

Estética objetivo: **Airbnb con paleta violeta** — búsqueda con cards y filtros, fichas ricas, flujo de reserva, dashboards limpios. API: NestJS `/api/v1`, JWT stateless sin refresh, 37 rutas, contrato en `openapi.json` (C:\Users\eugen\workspace\Keru\Keru-API\openapi.json) / Swagger en `http://localhost:3000/api/docs`.

---

## 1. Personas / roles de la webapp

La app tiene **una sola SPA con tres experiencias ruteadas por el `role` del JWT** (el login devuelve `{ accessToken, accountId, email, role, displayName }` y la navegación se decide ahí):

### a) Familia / titular de cuenta (roles `family` y `patient` — misma experiencia)
Es el "guest" de Airbnb. Ve:
- **Marketplace**: búsqueda de cuidadores con filtros, fichas, favoritos, flujo de solicitud de contratación, "mis contrataciones".
- **Seguimiento del paciente**: dashboard de estado actual, historial clínico, gráficos de evolución, registro de vitales/medicación/novedades (los familiares también cargan datos).
- **Círculo**: mis pacientes (1..n perfiles, selector de "paciente activo" obligatorio — UC-22), invitaciones a otros familiares, cuidadores actuales e históricos del paciente, recontratación.
- **Campana de notificaciones** (alertas clínicas + novedades) con badge por polling.
- **Reputación**: califica al cuidador tras un servicio `finished`.

> Nota: `patient` y `family` son intercambiables a nivel API (los guards aceptan ambos). No vale la pena diseñar dos UX distintas: es una sola experiencia "lado demanda".

### b) Cuidador (rol `caregiver`)
Es el "host". Ve:
- **Onboarding profesional** (wizard multi-paso) y **estado de su perfil** (pending / approved / rejected con motivo / deactivated) con las 3 insignias.
- **Bandeja de solicitudes** recibidas con Aceptar/Rechazar, viendo la reputación del paciente antes de decidir.
- **Servicios activos** (derivados de sus requests aceptadas): desde ahí registra vitales, medicación y novedades de pacientes con asignación vigente.
- **Calificar al paciente** tras un servicio finalizado.
- La campana existe pero estará siempre vacía para él (los cuidadores no tienen vínculo → no reciben notificaciones): ocultarla para este rol.

### c) Administrador de plataforma (rol `admin`, no auto-registrable)
Back-office:
- **Cola FIFO de cuidadores pendientes**, listado general paginado con filtros y búsqueda, detalle con documentación.
- **Acciones**: aprobar, rechazar (motivo obligatorio), editar 3 badges independientes, desactivar/reactivar.
- **Ops**: disparo manual del barrido (`sweep`).
- Ojo: el admin **no** tiene acceso a datos clínicos (el PermissionEngine no le da lectura de pacientes) — no diseñar vistas clínicas admin.

### d) Visitante (sin sesión)
Solo login, signup y la **landing pública de invitación** `/invite/:token` (preview sin sesión, confirmación con sesión).

---

## 2. Inventario de pantallas

Formato: **Pantalla** — endpoints — *equivalente Airbnb*.

### 2.0 Público / Auth
| Pantalla | Endpoints | Equivalente Airbnb |
|---|---|---|
| **Login** | `POST /auth/login` | Modal/página de login. 401 genérico "Credenciales inválidas". |
| **Signup** (selector de rol patient/family/caregiver, nunca admin) | `POST /auth/signup` | Registro. 409 = email en uso. Devuelve token → auto-login y ruteo por rol. |
| **Landing invitación** `/invite/:token` | `GET /invitations/:token` (público), `POST /invitations/:token/confirm` (con sesión) | Página de "co-host invite". Countdown 30 min; si `valid=false` deshabilitar CTA; si no hay sesión → login/signup precargando `invitedEmail` + returnUrl; manejar 403 (sesión con otro email), 400 (expirada/usada). |

### 2.1 Familia / Paciente (lado demanda)
| Pantalla | Endpoints | Equivalente Airbnb |
|---|---|---|
| **Shell + selector de paciente activo** (header persistente) | `GET /patients`, `GET /notifications/unread-count` (polling 30-60s) | Header con switcher de perfil + campana. El `patientId` activo va en estado global y en cada URL por-paciente. |
| **Mis pacientes** | `GET /patients` (solo id/fullName/age) | "Perfiles" / dashboard de cuentas. Estado vacío → CTA "Registrar paciente". |
| **Alta de paciente** | `POST /patients` (con `operationId`) | Form de onboarding. Datepicker max=hoy; si la respuesta trae `duplicateCandidateId` → banner "puede existir un duplicado". |
| **Búsqueda de cuidadores** | `GET /marketplace/caregivers?careType&modality&zone&minRatePerHour&maxRatePerHour` | **Página de resultados con cards + panel de filtros** (el corazón del look Airbnb). Toggle favorito optimista (`isFavorite` viene resuelto). Sin paginación server: virtual scroll client-side. |
| **Ficha de cuidador** | `GET /marketplace/caregivers/:id` + `GET /caregivers/:id/reputation` | **Página de listing**: hero, badges, especialidades, certificaciones (con flag `verified`), disponibilidad, tarifa, reseñas + promedio, CTAs "Solicitar" y "Favorito" (derivar `isFavorite` de `GET /favorites`, no viene en este endpoint). 404 = "no disponible" amable. |
| **Favoritos** | `GET /favorites`, `POST/DELETE /favorites/:caregiverId` | Wishlist. Idempotentes: UI optimista segura. |
| **Wizard de solicitud (booking)** | `POST /hiring-requests` (con `operationId`), `GET /patients` (elegir paciente) | **Flujo de reserva**: paciente → modalidad → fechas → requisitos → contacto → resumen. Validar en UI: endDate > startDate, startDate futura, contactData mínimo, advertir si las fechas caen fuera de la disponibilidad publicada y si ya hay una pending para el mismo par (el server no lo bloquea). |
| **Mis contrataciones** | `GET /hiring-requests` | "Trips". Badges por estado (pending/accepted/in-progress/declined/expired/finished). Filtros client-side (no hay query params). Refetch al navegar. |
| **Detalle de contratación** | (item de la lista) + `POST /hiring-requests/:id/complete` | Detalle de reserva. `accepted`/`in-progress` → botón "Finalizar / marcar pagada" (solo el solicitante; deshabilitar tras éxito). `finished` → CTA "Calificar". Resolver nombre del cuidador vía ficha (el DTO solo trae ids, fechas, status, `ratePerHourSnapshot` **string**). |
| **Calificar cuidador** (modal) | `POST /hiring-requests/:id/review-caregiver` | Flujo de review post-estadía. Estrellas 1-5 + comentario ≤1000. Usar `revealed` de la respuesta para explicar el sellado (14 días / reveal simultáneo). 400 "Ya reseñaste" = estado "ya calificado", no error. |
| **Dashboard del paciente (estado actual)** | `GET /patients/:id/state` (polling suave) | Dashboard host limpio: tarjetas por métrica con último valor, color según `defaultRange`, sello "datos al {asOf}". Unidades/labels del catálogo client-side. |
| **Historial clínico (timeline)** | `GET /patients/:id/history` | Feed cronológico mixto (vitals/medication/note) con badge de `authorRole`. Sin paginación server → virtual scroll + filtros client-side. |
| **Gráficos de evolución** | `GET /patients/:id/metrics/:metricKey/series` (x6) | Tab "Evolución": línea por métrica, bandas de rango normal, sistólica+diastólica juntas (2 requests, mismo eje). Selector de período client-side. |
| **Registrar vitales / medicación / novedad** | `POST /patients/:id/vitals` \| `/medications` \| `/notes` (todos con `operationId`), `GET /catalogs` | Forms de carga rápida desde la ficha. Vitales dinámico desde `catalogs.metrics`: validar plausibilidad (espejo del 422) y warning "este valor generará una alerta" si sale de `defaultRange` (la respuesta no devuelve alertas). Tras éxito, invalidar state/history/series. |
| **Cuidadores del paciente** | `GET /patients/:id/caregivers` | Tabs Vigentes/Históricos con períodos; link a ficha + CTA "Recontratar" (reingresa al wizard; deshabilitado si la ficha da 404 = ya no aprobado). |
| **Invitar familiar** (modal en ficha del paciente) | `POST /patients/:id/invitations` | "Invitar co-host": email + rol manager/viewer (default viewer), link con copiar/compartir + countdown 30 min. El backend NO envía el mail. No reintentar automático (no idempotente). |
| **Centro de notificaciones** | `GET /notifications`, `POST /notifications/:id/read` | Panel de campana: 'alert' (roja, crítica) vs 'note' (informativa), read optimista, filtros client-side, resolver nombre de paciente contra `GET /patients`. Click → deep link a la ficha del paciente. "Marcar todas" = iterar POSTs. |

### 2.2 Cuidador
| Pantalla | Endpoints | Equivalente Airbnb |
|---|---|---|
| **Onboarding profesional** (wizard) | `GET /caregivers/me` (404 = "sin perfil" → wizard, no error), `POST /caregivers` (con `operationId`) | "Become a host": pasos datos → especialidades (enum x8, min 1) → certificaciones (lista dinámica, institution+year obligatorios) → disponibilidad (día 0-6 + HH:mm) → tarifas → zona/modalidades. |
| **Estado de mi perfil** | `GET /caregivers/me` (refresh manual/polling) | Dashboard de host con banner por status: pending "en revisión", approved "visible en el marketplace", rejected con `rejectionReason` (sin re-envío por API), deactivated "oculto". 3 insignias. |
| **Bandeja de solicitudes** | `GET /caregiver/requests` (filtrar pending client-side), `POST .../:id/accept`, `POST .../:id/decline`, `GET /patients/:id/reputation` (en el detalle) | "Reservation requests" del host: detalle con fechas, modalidad, tarifa pinneada y reputación del paciente; Aceptar (manejar 400 "Ya existe una asignación activa con este paciente" y 400 "ya está en estado X" como razones de negocio) / Rechazar con confirmación (sin undo, sin motivo). Ojo: el DTO **no incluye** contactData ni specialRequirements. |
| **Mis servicios / registro clínico** | derivado de requests `accepted`; `POST /patients/:id/vitals|medications|notes` | "Today" del host: lista de servicios activos con acceso a los forms de registro (mismos componentes que familia). Tolerar 403 si el `measuredAt` cae fuera de la asignación. También lectura: `GET /patients/:id/state|history` (autorizado por asignación vigente). |
| **Calificar paciente** (modal) | `POST /hiring-requests/:id/review-patient` | Review del host al guest, mismo componente de estrellas. |

### 2.3 Admin (back-office)
| Pantalla | Endpoints | Equivalente Airbnb |
|---|---|---|
| **Cola de pendientes** | `GET /admin/caregivers/pending` (FIFO, sin paginación) | Cola de moderación. |
| **Listado de cuidadores** | `GET /admin/caregivers?status&q&page&pageSize` | Tabla admin: 4 chips de estado, búsqueda por nombre/zona, paginador server-side con los valores efectivos devueltos. |
| **Detalle de cuidador** | `GET /admin/caregivers/:id`, `POST .../approve`, `POST .../reject` (reason 1-400), `PUT .../badges` (parcial, 3 toggles), `POST .../deactivate` (reason opcional), `POST .../reactivate` | Página de revisión: certificaciones con `verified`, disponibilidad, tarifas, provenance (reviewedBy/At). Acciones habilitadas según estado; avisar que desactivar tiene efectos asincrónicos en contrataciones. |
| **Ops** | `POST /admin/ops/sweep` | Botón "Ejecutar barrido ahora" con resultado `{assignmentsClosed, requestsExpired, revealed}`. |

---

## 3. Arquitectura Angular propuesta

### Versión y fundamentos
- **Angular 20+ (LTS actual), 100% standalone components, signals, zoneless change detection** (`provideZonelessChangeDetection`), control flow nuevo (`@if/@for`), `input()`/`output()`, lazy loading por rutas con `loadChildren` de rutas standalone.
- SSR **no** necesario (app autenticada; la única página pública indexable sería la invitación, que es efímera). CSR + prerender de login si se quiere.

### Estructura de carpetas (feature-slices espejando los 5 dominios de la API)
```
src/app/
├── core/                      # singleton, sin UI
│   ├── auth/                  # AuthStore (signal), authInterceptor (Bearer),
│   │   │                      # errorInterceptor (envelope + 401→logout), guards
│   ├── api/                   # cliente HTTP tipado por dominio (ver abajo)
│   ├── patient-context/       # ActivePatientStore (UC-22)
│   ├── notifications/         # NotificationStore + polling del badge
│   ├── idempotency/           # helper newOperationId() + retención por form
│   └── catalogs/              # CatalogService (GET /catalogs, cache por sesión)
├── features/
│   ├── auth/                  # login, signup, /invite/:token
│   ├── patients/              # membership demanda: mis pacientes, alta, invitar
│   ├── marketplace/           # hiring demanda: búsqueda, ficha, favoritos,
│   │   │                      # wizard solicitud, mis contrataciones
│   ├── care/                  # care-record + care-consult: dashboard, historial,
│   │   │                      # gráficos, forms de registro, campana
│   ├── reputation/            # modal de review + componente ReputationPanel
│   ├── caregiver/             # onboarding, estado de perfil, bandeja, servicios
│   └── admin/                 # back-office completo (lazy, solo rol admin)
├── shared/
│   ├── ui/                    # design system: kr-card, kr-badge, kr-rating,
│   │   │                      # kr-avatar, kr-filter-bar, kr-empty-state, kr-modal
│   └── pipes|utils/           # fechas ISO→local, "hace X" (asOf), money
└── styles/                    # tokens.css + tema
```
Las rutas top-level por rol: `/(auth)`, `/app/**` (familia), `/caregiver/**`, `/admin/**`, `/invite/:token`.

### Manejo de estado: signals, sin NgRx
El dominio no lo justifica (sin tiempo real, sin colaboración compleja). **Signal stores livianos por feature** (servicios `providedIn: 'root'` o provistos en la ruta) + el `resource()` / `httpResource` de Angular para fetching con estados loading/error/refresh:
- `AuthStore`: `{accessToken, accountId, email, role, displayName}` persistido en `localStorage`; `logout()` limpia y navega a login (invocado por el interceptor ante cualquier 401 — no hay refresh token).
- `ActivePatientStore`: carga `GET /patients` al entrar, `activePatientId` como signal persistido en `localStorage` por cuenta; todas las rutas por-paciente lo llevan en la URL (`/app/patients/:patientId/...`) — la URL es la fuente de verdad, el store el default al navegar.
- `NotificationStore`: `unreadCount` signal alimentado por `interval(45_000)` + refetch al recuperar foco (`visibilitychange`); lista bajo demanda al abrir el panel; markRead optimista.
- Datos de servidor: cache por `resource` con invalidación explícita tras mutaciones (p.ej. tras `POST vitals` → `reload()` de state/history/series).

### Cliente API: híbrido "tipos generados, servicios manuales"
El `openapi.json` **no declara varios schemas de respuesta** (unread-count, history, markRead) y tiene gotchas (`ratePerHourSnapshot` string, `isFavorite` ausente en el perfil, 404-como-estado en `/caregivers/me`). Recomendación:
1. Generar **solo los tipos** con `openapi-typescript` desde `openapi.json` (regenerable con `npm run openapi`), corrigiendo a mano los DTOs no declarados en un `api-overrides.d.ts`.
2. **Servicios Angular escritos a mano por dominio** (`MembershipApi`, `HiringApi`, `CareRecordApi`, `CareConsultApi`, `ReputationApi`, `AdminApi`), finos, que encapsulan las rarezas: mapping del envelope de error, `operationId` en creaciones, parseo de `ratePerHourSnapshot`, 404 de `/caregivers/me` → `null`.
3. **Interceptores**: (a) `authInterceptor` agrega `Authorization: Bearer`; (b) `errorInterceptor` normaliza `{statusCode, code, message, details}` a un `ApiError` tipado — los `message` ya vienen en español y son mostrables; `details.fields` se mapea a errores por campo en formularios; 401 → limpiar sesión y redirigir.

### Idempotencia (patrón transversal)
Helper `useOperationId()`: genera un UUID v4 **al montar cada formulario de creación** (paciente, cuidador, solicitud, vitales, medicación, nota), lo **reutiliza en todos los retries** de ese submit (timeout/red/doble click) y lo regenera solo al iniciar un alta nueva. Botón deshabilitado durante el request como segunda barrera.

### Guards
- `authGuard`: hay token → pasa; si no, redirect a login con returnUrl.
- `roleGuard(roles)`: por data de ruta (`/admin` solo admin, `/caregiver` solo caregiver, `/app` family|patient). Un 403 de rol en runtime = "app equivocada" → redirect al home del rol.
- **El vínculo/asignación NO es verificable a priori** (no hay endpoint "¿puedo?"): no hacer guard de vínculo; inferir del contexto (mis pacientes, mis servicios) y manejar el 403 con una pantalla dedicada "Sin acceso a este paciente" (no error genérico). No cachear autorización: un cuidador puede perder acceso entre visitas.

### Alertas / campana: polling (única opción)
La API no ofrece SSE/WS/push. Estrategia:
- Badge: `GET /notifications/unread-count` cada 45s (pausar con pestaña oculta, refetch en `focus`).
- Panel: `GET /notifications` al abrir, filtros client-side (no leídas / tipo / paciente), virtual scroll (CDK).
- Vistas "en vivo" (dashboard de estado): polling de `GET /state` cada 30-60s + sello `asOf` ("actualizado hace X") + refresh manual.
- Dejar la capa de notificaciones detrás de una interfaz (`NotificationTransport`) para enchufar push/SSE si la API lo suma.

### Theming violeta (design tokens)
CSS custom properties en `styles/tokens.css`, estilo Airbnb (mucho blanco, cards con sombra suave, radios generosos, un solo color de marca fuerte):
```css
:root {
  --kr-primary-600:#7C3AED; --kr-primary-500:#8B5CF6; --kr-primary-100:#EDE9FE;
  --kr-ink-900:#1F2937; --kr-ink-500:#6B7280; --kr-surface:#FFFFFF; --kr-bg:#FAFAFB;
  --kr-danger:#DC2626; --kr-success:#059669; --kr-warning:#D97706; /* alertas clínicas */
  --kr-radius-card:16px; --kr-radius-pill:9999px;
  --kr-shadow-card:0 1px 2px rgb(0 0 0/.06),0 8px 24px rgb(0 0 0/.08);
  --kr-font:'Inter var',system-ui,sans-serif;
}
```
El primario violeta reemplaza al coral de Airbnb en CTAs, corazón de favoritos, badge de campana y estados activos de filtros; los estados clínicos (fuera de rango) usan semánticos, nunca el violeta. La elección de librería UI (Material tematizado vs Tailwind + componentes propios) está en preguntas abiertas; la recomendación es **Tailwind v4 + design system propio en `shared/ui`**, porque el look Airbnb pelea contra la fisonomía de Material.

### Charts
Una sola dependencia liviana para las series (recomendado **ngx-echarts o chart.js**): líneas con bandas de rango (`defaultRange` del catálogo), datos ya ordenados ASC desde la API.

---

## 4. Roadmap por fases

Objetivo de la Fase 1: cerrar el **circuito punta a punta del MVP** con el seed (`familiar@test.com` / `cuidador@test.com` / `admin@test.com`, paciente "Rosa Díaz"; recordar que el cuidador seedeado nace `pending` → hay que aprobarlo como admin).

### Fase 0 — Fundaciones (1 sprint)
Workspace Angular 20+, tokens violeta + `shared/ui` mínimo (card, badge, botón, empty-state, modal), `AuthStore` + interceptores (Bearer, envelope de error, 401→login), login/signup con ruteo por rol, shell por rol con lazy routes, helper `operationId`, `CatalogService`.

### Fase 1 — Circuito E2E mínimo (el "happy path" completo)
> registrarse → aprobar → buscar → contratar → registrar dato → consultar → alerta → calificar
1. **Familia**: mis pacientes + alta de paciente + selector de paciente activo.
2. **Cuidador**: onboarding wizard + pantalla de estado de perfil.
3. **Admin (versión mínima)**: cola de pendientes + detalle + aprobar/rechazar (sin listado paginado todavía) — es prerequisito de todo el marketplace.
4. **Marketplace**: búsqueda con filtros + ficha de cuidador + wizard de solicitud + mis contrataciones.
5. **Cuidador**: bandeja con aceptar/rechazar.
6. **Registro clínico**: form de vitales (dinámico desde catálogo, con plausibilidad y warning de rango) + novedad.
7. **Consulta**: dashboard de estado (con `asOf`) + historial timeline.
8. **Campana**: badge por polling + panel + markRead.
9. **Cierre**: botón "Finalizar/marcar pagada" + modal de reseña bidireccional (componente compartido) + `ReputationPanel` en la ficha del cuidador.

### Fase 2 — Profundidad del lado demanda
Gráficos de evolución (6 métricas, BP combinada), form de medicación, cuidadores del paciente (vigentes/históricos + recontratar), favoritos completos, invitaciones (emisión con link/countdown + landing pública `/invite/:token` con el flujo login/signup encadenado), pantalla "Sin acceso" para 403, manejo fino de todos los errores de negocio (carreras de estado, "cuidador no disponible", conflicto de asignación).

### Fase 3 — Cuidador y admin completos
"Mis servicios" del cuidador (derivado de requests aceptadas) con acceso al registro clínico y a la lectura del paciente, reputación del paciente en el detalle de solicitud, calificar paciente; admin: listado paginado con chips/búsqueda, badges (3 toggles PUT parcial), desactivar/reactivar con avisos de asincronía, botón de sweep.

### Fase 4 — Pulido y escala
Virtual scroll en historial/notificaciones/búsqueda (nada pagina server-side), polling adaptativo (pausa en background), accesibilidad (WCAG AA sobre los tokens), estados vacíos ilustrados, PWA opcional (ojo: sin push real), tests E2E (Playwright) del circuito de Fase 1 contra la API dockerizada (`npm run app:up` + `npm run seed`).

---

## Riesgos de contrato a tener presentes (resumen)
- `ratePerHourSnapshot` es **string** y **sin moneda** (currencySnapshot no se expone): mostrar la moneda del card/perfil al momento de solicitar.
- `RequestResponseDto` no trae nombres ni contactData/specialRequirements/createdAt: el detalle se diseña solo con lo disponible y los nombres se resuelven aparte (con cache).
- `GET /caregivers/me` 404 = estado "sin perfil"; `markRead` nunca da 404; series con metricKey inválido devuelven `[]` (validar contra catálogo antes de llamar).
- Estados cambian por barridos del sistema (expiración, cierre por período, desactivación): **refetch al navegar** siempre.