// Servidor local pra testar no computador, igual ao GitHub Pages (app em /pila/).
// Rode: node tools/servidor.mjs   e abra http://localhost:5173/pila/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = Number(process.env.PORT) || 5173;
const BASE = '/pila/';
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const BLOQUEADOS = ['privado', '.git', 'dados-iniciais.json'];

createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!caminho.startsWith(BASE)) {
    res.writeHead(302, { Location: BASE }).end();
    return;
  }
  let rel = normalize(caminho.slice(BASE.length)).replace(/^([/\\])+/, '');
  if (rel === '' || rel === '.' || rel.endsWith('/') || rel.endsWith('\\')) rel = join(rel, 'index.html');
  if (rel.startsWith('..') || BLOQUEADOS.some((b) => rel.split(/[/\\]/)[0] === b)) {
    res.writeHead(404).end('não encontrado');
    return;
  }
  try {
    const dados = await readFile(join(RAIZ, rel));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(dados);
  } catch {
    res.writeHead(404).end('não encontrado');
  }
}).listen(PORTA, () => console.log(`Pila rodando em http://localhost:${PORTA}${BASE}`));
