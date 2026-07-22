/**
 * Service worker de Keru (UC-18): recibe Web Push y muestra la notificación del navegador.
 * El push es adicional a la campana in-app — si este canal falla, la campana ya tiene todo
 * (constitution §2.7). El payload es el JSON que arma la API: { type, patientId, title, body }.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* payload no-JSON: se muestra genérica */
  }
  const title = data.title || 'Keru';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { patientId: data.patientId || null, type: data.type || 'alert' },
    }),
  );
});

/** Abrir la notificación aterriza en la vista del paciente (UC-18 flujo 6 → UC-14). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const page = data.type === 'quarantine' ? 'quarantine' : 'dashboard';
  const url = data.patientId ? `/app/patients/${data.patientId}/${page}` : '/app/patients';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
