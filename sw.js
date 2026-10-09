// Service worker: guarda o "esqueleto" do app pra abrir sem internet.
// Caminhos relativos porque no GitHub Pages o app roda em /pila/.
// Mudou algum arquivo do app? Aumente a VERSAO.

const VERSAO = 'pila-v12';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/format.js',
  './js/config.js',
  './js/calc.js',
  './js/importar.js',
  './js/telas.js',
  './js/telas-rotina.js',
  './js/acoes-rotina.js',
  './js/links.js',
  './js/exportar.js',
  './js/fila.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './img/logo.png',
  './img/logo-escuro.png',
];

self.addEventListener('install', (e) => {
  const pedidos = SHELL.map((url) => new Request(url, { cache: 'no-cache' }));
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(pedidos)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Biblioteca do Supabase no CDN: versão fixa, então cache primeiro.
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(req).then((achou) => achou || fetch(req).then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return resp;
      })),
    );
    return;
  }

  // Só arquivos do próprio app. API do Supabase passa direto.
  if (url.origin !== self.location.origin) return;

  // Rede primeiro (pega atualização na hora), cache se estiver sem internet.
  // cache: 'no-cache' pergunta ao servidor se mudou, em vez de usar a cópia de 10 min do GitHub Pages.
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((achou) => achou || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
