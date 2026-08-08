/* BELKS POS · Service Worker
   ---------------------------------------------------------------
   Diese Datei liegt neben index.html. Updates laufen weiter allein
   ueber index.html.

   WARUM ES DIESE FASSUNG GIBT (08.08.2026):
   Die erste Fassung speicherte JEDE GET-Anfrage, die keine Seite war -
   also auch die Datenbank-Abrufe:
       GET /rest/v1/pos_state?key=eq.test-cafe_tableOrders&...
   Diese Adresse ist bei jedem Abruf identisch. Nach dem ERSTEN Mal kam
   die Antwort fuer immer aus dem Speicher, das Geraet fragte die Cloud
   nie wieder. Folge: offene Tische eines Geraets erschienen auf keinem
   anderen mehr, obwohl die App "Cloud gelesen: ja" meldete - gelesen
   wurde der Speicher.
   Das fiel erst jetzt auf, weil der Service Worker vorher ueber eine
   blob:-Adresse registriert war und darum NIE lief.

   REGEL AB JETZT:
   - Datenbank und Anmeldung (Supabase) werden NIEMALS gespeichert.
   - Gespeichert werden nur echte Bausteine: Skripte, Stile, Schriften,
     Bilder. Genau die braucht die Kasse, um ohne Internet zu starten.
   - Die Seite selbst kommt zuerst aus dem Netz, damit neue Versionen
     sofort ankommen; ohne Netz die zuletzt gespeicherte Fassung.
*/

var CACHE = 'belks-pos-v2';   // v2: loescht die alten, mitgespeicherten Datenbank-Antworten

/* Der Ordner, in dem diese Datei liegt. Auf GitHub Pages ist das
   /eatdesi-pos/ - deshalb NICHT '/' fest verdrahten. */
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
      /* ALLE alten Speicher loeschen - auch 'belks-pos-v1'. Dort liegen
         die faelschlich gespeicherten Datenbank-Antworten. */
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    })
  );
  self.clients.claim();
});

/* Gehoert diese Adresse zur Datenbank oder Anmeldung?
   Solche Antworten duerfen NIE aus dem Speicher kommen. */
function istDaten(url) {
  try {
    if (url.hostname.indexOf('supabase.co') >= 0) return true;
    if (url.pathname.indexOf('/rest/v1/') === 0) return true;
    if (url.pathname.indexOf('/auth/v1/') === 0) return true;
    if (url.pathname.indexOf('/storage/v1/') === 0) return true;
    if (url.pathname.indexOf('/functions/v1/') === 0) return true;
  } catch (e) {}
  return false;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* 1) Datenbank/Anmeldung: gar nicht anfassen - immer direkt ans Netz. */
  if (istDaten(url)) return;

  /* 2) Die Seite selbst: zuerst Netz (neue Version sofort da),
        sonst die gespeicherte Fassung (Kasse laeuft offline weiter). */
  var istSeite = (req.mode === 'navigate') || (req.destination === 'document');
  if (istSeite) {
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

  /* 3) NUR echte Bausteine speichern: Skripte, Stile, Schriften, Bilder.
        Alles andere (auch Aufrufe ohne erkennbaren Zweck, wie fetch() an
        fremde Server) laeuft unangetastet ans Netz. Das ist die Lehre aus
        dem Tisch-Fehler: lieber zu wenig speichern als falsche Daten
        ausliefern. */
  var d = req.destination;
  if (d !== 'script' && d !== 'style' && d !== 'font' && d !== 'image') return;

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
