// Cáscara mínima: sin conexión, las páginas muestran el aviso de "Sin conexión"
const CACHE = 'reciclomap-v1';
const PAGINA_SIN_CONEXION = '/sin-conexion';
const PRECARGA = [PAGINA_SIN_CONEXION, '/iconos.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECARGA))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    evento.respondWith(fetch(request).catch(() => caches.match(PAGINA_SIN_CONEXION)));
    return;
  }

  const url = new URL(request.url);
  // Solo recursos estáticos del propio sitio; los datos de la API nunca se guardan aquí
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') || url.pathname === '/iconos.svg')
  ) {
    evento.respondWith(
      caches.match(request).then(
        (guardada) =>
          guardada ||
          fetch(request).then((respuesta) => {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copia));
            return respuesta;
          }),
      ),
    );
  }
});

// Web Push: avisos con la app cerrada; al tocarlos se abre la pantalla que corresponde
self.addEventListener('push', (evento) => {
  let datos = { titulo: 'RecicloMap', mensaje: '', enlace: '/notificaciones' };
  try {
    datos = { ...datos, ...evento.data.json() };
  } catch {
    // Aviso sin contenido: se muestra el genérico
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.mensaje,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { enlace: datos.enlace || '/notificaciones' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.enlace || '/notificaciones', self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((ventana) => ventana.url.startsWith(self.location.origin));
      if (abierta) return abierta.focus().then(() => abierta.navigate(destino));
      return self.clients.openWindow(destino);
    }),
  );
});
