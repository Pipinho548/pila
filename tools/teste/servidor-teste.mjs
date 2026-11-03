// Servidor de teste: o app de verdade, com o banco de mentira (db-falso.js) e um relógio que dá pra adiantar.
// Rode: node tools/teste/servidor-teste.mjs   e abra http://localhost:5176/pila/?reset=1
//   ?reset=1                  começa com o banco vazio
//   ?agora=2026-12-01T09:00:00-03:00   finge que é esse dia e hora (fica guardado até mudar)
// Os dados de exemplo saem de privado/dados-iniciais.json (só no seu computador) em /seed.json.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJETO = fileURLToPath(new URL('../..', import.meta.url));
const PORTA = Number(process.env.PORT) || 5176;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

// Relógio falso: ?agora=... fica guardado até mudar
const RELOGIO = `
(() => {
  const p = new URLSearchParams(location.search).get('agora');
  if (p) localStorage.setItem('agora-falso', p);
  const alvo = localStorage.getItem('agora-falso');
  if (!alvo) return;
  const desloc = Date.parse(alvo) - Date.now();
  const D = Date;
  class Relogio extends D {
    constructor(...a) { if (a.length === 0) super(D.now() + desloc); else super(...a); }
    static now() { return D.now() + desloc; }
  }
  window.Date = Relogio;
})();`;

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (caminho === '/__relogio.js') { res.writeHead(200, { 'Content-Type': TIPOS['.js'] }); res.end(RELOGIO); return; }
    if (caminho === '/seed.json') {
      res.writeHead(200, { 'Content-Type': TIPOS['.json'] });
      res.end(await readFile(join(PROJETO, 'privado/dados-iniciais.json')));
      return;
    }
    if (caminho === '/pila/sw.js') { res.writeHead(404).end(); return; } // sem service worker no teste
    if (caminho === '/pila/js/db.js') {
      res.writeHead(200, { 'Content-Type': TIPOS['.js'], 'Cache-Control': 'no-store' });
      res.end(await readFile(new URL('db-falso.js', import.meta.url)));
      return;
    }
    if (!caminho.startsWith('/pila/')) { res.writeHead(302, { Location: '/pila/' }).end(); return; }
    let rel = normalize(caminho.slice('/pila/'.length)) || 'index.html';
    if (rel === '.' || rel.endsWith('\\') || rel.endsWith('/')) rel = 'index.html';
    if (rel.startsWith('..') || rel.split(/[/\\]/)[0] === 'privado') { res.writeHead(404).end(); return; }
    let dados = await readFile(join(PROJETO, rel));
    if (rel === 'index.html') dados = Buffer.from(String(dados).replace('<head>', '<head><script src="/__relogio.js"></script>'));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(rel)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORTA, '127.0.0.1', () => console.log(`teste em http://localhost:${PORTA}/pila/`));
