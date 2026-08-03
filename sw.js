/* BELKS POS · Service Worker
   ---------------------------------------------------------------
   Diese Datei wird EINMAL neben index.html abgelegt und danach nicht
   mehr angefasst. Updates laufen weiter allein ueber index.html.

   Warum eine eigene Datei:
   Vorher wurde der Service Worker im HTML zusammengebaut und ueber eine
   blob:-Adresse registriert. Browser lassen das nicht zu - die
   Registrierung schlug immer fehl, der Fehler wurde verschluckt. Ergebnis:
   ohne Internet startete die Kasse gar nicht ("Webseite nicht verfuegbar").
   Ein Service Worker muss von derselben Herkunft und aus einer echten
   Datei kommen.

   Was er tut:
   - Die Seite selbst wird bei jedem Start frisch geholt (damit neue
     Versionen sofort ankommen) und dabei mitgespeichert.
   - Ist kein Netz da, kommt die zuletzt gespeicherte Fassung.
   - Alles andere (React, Babel, Schriften, Bilder) wird beim ersten
     erfolgreichen Laden mitgespeichert und danach aus dem Speicher
     bedient. Genau das fehlte bisher: die Bibliotheken kamen von
     fremden Servern und waren ohne Netz nicht da - die App blieb leer.
*/

var CACHE = 'belks-pos-v1';

/* Der Ordner, in dem diese Datei liegt. Auf GitHub Pages ist das
   /eatdesi-pos/ - deshalb NICHT '/' fest verdrahten, sonst landet man
   im Wurzelverzeichnis und speichert die falsche Seite. */
var BASIS = new URL('./', self.location).pathname;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.add(new Request(BASIS, { cache: 'reload' })).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // Reste der alten, blob-basierten Fassung entfernen
        if (k !== CACHE && k.indexOf('eatdesi-') === 0) return caches.delete(k);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var istSeite = (req.mode === 'navigate') || (req.destination === 'document');

  if (istSeite) {
    /* Seite: zuerst aus dem Netz, damit eine neue Version sofort da ist.
       Klappt das nicht, kommt die gespeicherte Fassung - die Kasse
       laeuft dann ohne Internet weiter. */
    e.respondWith(
      fetch(req).then(function (r) {
        try {
          var kopie = r.clone();
          caches.open(CACHE).then(function (c) { c.put(BASIS, kopie); });
        } catch (err) {}
        return r;
      }).catch(function () {
        return caches.match(BASIS).then(function (x) {
          return x || new Response(
            '<meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">'
            + '<h2>Kasse noch nicht gespeichert</h2>'
            + '<p>Bitte einmal <b>mit Internet</b> oeffnen. Danach laeuft sie auch offline.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        });
      })
    );
    return;
  }

  /* Alles andere: erst im Speicher nachsehen, sonst laden UND mitspeichern.
     Ohne das Mitspeichern fehlten React und Babel offline komplett. */
  e.respondWith(
    caches.match(req).then(function (treffer) {
      if (treffer) return treffer;
      return fetch(req).then(function (r) {
        try {
          if (r && (r.status === 200 || r.type === 'opaque')) {
            var kopie = r.clone();
            caches.open(CACHE).then(function (c) { c.put(req, kopie); });
          }
        } catch (err) {}
        return r;
      });
    }).catch(function () {
      return caches.match(req);
    })
  );
});
