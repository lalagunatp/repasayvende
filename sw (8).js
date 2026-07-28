/* Repasa y Vende — service worker
   Al actualizar la app hay que SUBIR index.html Y sw.js juntos,
   subiendo el número de CACHE (v1 → v2 → v3…) para que los
   celulares que ya la tienen instalada reciban la versión nueva. */

var CACHE = 'tp-repasa-v6';
var ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-mask.png'
];

/* Guardar uno por uno: si falta un archivo no se cae la instalación entera */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(ARCHIVOS.map(function (a) {
        return c.add(a)['catch'](function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (llaves) {
      return Promise.all(llaves.map(function (k) {
        return k === CACHE ? null : caches['delete'](k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  /* La hoja de Google y el buzón siempre van a la red, nunca a caché */
  if (url.hostname.indexOf('google.com') >= 0) return;

  /* Navegación: primero la copia local, y si no hay, la red.
     Nunca devolver vacío a respondWith. */
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(function (guardado) {
        if (guardado) return guardado;
        return fetch(req)['catch'](function () {
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
            '<body style="font-family:system-ui;padding:32px;background:#0C2431;color:#fff">' +
            '<h1>Sin conexión</h1><p>Conéctate a internet y vuelve a abrir la app.</p></body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (guardado) {
      if (guardado) return guardado;
      return fetch(req).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var copia = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copia); });
        }
        return resp;
      })['catch'](function () {
        return new Response('', { status: 504, statusText: 'Sin conexión' });
      });
    })
  );
});
