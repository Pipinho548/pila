// Gera os ícones PNG do app (sem dependências). Rode: node tools/gerar-icones.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const COR_FUNDO = [0x1f, 0x8a, 0x5b];
const COR_LETRA = [0xff, 0xff, 0xff];

// Letra "P" em coordenadas de 0 a 1. escala < 1 encolhe pro centro (área segura do maskable).
function dentroDoP(u, v, escala) {
  u = (u - 0.5) / escala + 0.5;
  v = (v - 0.5) / escala + 0.5;
  const dx = 0.01; // centraliza visualmente
  u -= dx;
  const cx = 0.5, cy = 0.405;
  const d = Math.hypot(u - cx, v - cy);
  const haste = u >= 0.33 && u <= 0.45 && v >= 0.25 && v <= 0.75;
  const externo = (u >= 0.33 && u <= cx && v >= 0.25 && v <= 0.56) || (u >= cx && d <= 0.155);
  const furo = (u >= 0.45 && u <= cx && v >= 0.355 && v <= 0.455) || (u >= cx && d <= 0.05);
  return haste || (externo && !furo);
}

function desenhar(tamanho, escala) {
  const AA = 4; // supersampling pra borda lisa
  const linhas = [];
  for (let y = 0; y < tamanho; y++) {
    const linha = Buffer.alloc(1 + tamanho * 3);
    for (let x = 0; x < tamanho; x++) {
      let cobertura = 0;
      for (let sy = 0; sy < AA; sy++) {
        for (let sx = 0; sx < AA; sx++) {
          if (dentroDoP((x + (sx + 0.5) / AA) / tamanho, (y + (sy + 0.5) / AA) / tamanho, escala)) cobertura++;
        }
      }
      const t = cobertura / (AA * AA);
      for (let c = 0; c < 3; c++) {
        linha[1 + x * 3 + c] = Math.round(COR_FUNDO[c] * (1 - t) + COR_LETRA[c] * t);
      }
    }
    linhas.push(linha);
  }
  return png(tamanho, tamanho, Buffer.concat(linhas));
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo, dados) {
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([tam, td, crc]);
}
function png(w, h, cru) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(cru)),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

const pasta = new URL('../icons/', import.meta.url);
mkdirSync(pasta, { recursive: true });
const icones = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78],
];
for (const [nome, tamanho, escala] of icones) {
  writeFileSync(new URL(nome, pasta), desenhar(tamanho, escala));
  console.log('ok', nome);
}
