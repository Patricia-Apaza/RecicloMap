// Sin conexión: se pueden leer las páginas y los datos que ya se vieron, con su fecha. Nunca se guardan escrituras para después:
// operaciones, ofertas, precios y todo lo que cambia un estado necesitan internet en el momento
const CACHE = 'reciclomap-v2';
const DATOS = 'reciclomap-datos-v1';
// Solo lecturas (GET) de estas rutas; nada de fotos, exportaciones ni escrituras
const LECTURAS =
  /^\/api\/v1\/(mapa|catalogos|ciudades|compradores|publicaciones|operaciones|precios|calculadora|yo|mi-negocio|negocio|favoritos|notificaciones|negocios|ofertas|estado)(\/|$)/;
const NO_GUARDAR = /^\/api\/v1\/(yo\/(exportacion|eliminacion|privacidad)|fotos|auth)/;
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
      .then((claves) =>
        Promise.all(claves.filter((clave) => clave !== CACHE && clave !== DATOS).map((clave) => caches.delete(clave))),
      )
      .then(() => self.clients.claim()),
  );
});

// Al cerrar la sesión se borran los datos guardados para que nadie los vea en este dispositivo
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'limpiar-datos') evento.waitUntil(caches.delete(DATOS));
});

async function leerConCopia(request) {
  const cache = await caches.open(DATOS);
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) {
      const cuerpo = await respuesta.clone().blob();
      const cabeceras = new Headers(respuesta.headers);
      cabeceras.set('X-RM-Guardado', new Date().toISOString());
      await cache.put(request.url, new Response(cuerpo, { status: respuesta.status, headers: cabeceras }));
    }
    return respuesta;
  } catch (error) {
    const guardada = await cache.match(request.url);
    if (!guardada) throw error;
    const cabeceras = new Headers(guardada.headers);
    cabeceras.set('X-RM-Desde-Cache', '1');
    return new Response(await guardada.blob(), { status: guardada.status, headers: cabeceras });
  }
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  // Nada que cambie un estado pasa por aquí: las escrituras siguen su camino y, sin internet, fallan con un aviso
  if (request.method !== 'GET') return;

  const destino = new URL(request.url);
  // Nada de otros sitios se guarda aquí: las imágenes del mapa (teselas) nunca se almacenan para usar sin conexión
  if (destino.origin !== self.location.origin) return;
  if (
    destino.origin === self.location.origin &&
    LECTURAS.test(destino.pathname) &&
    !NO_GUARDAR.test(destino.pathname)
  ) {
    evento.respondWith(leerConCopia(request));
    return;
  }

  // Las páginas ya visitadas se guardan (son el cascarón de la app, sin datos de nadie); sin conexión se abre la última copia
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          if (respuesta.ok && new URL(request.url).origin === self.location.origin) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(request.url, copia));
          }
          return respuesta;
        })
        .catch(() => caches.match(request.url).then((guardada) => guardada || caches.match(PAGINA_SIN_CONEXION))),
    );
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
