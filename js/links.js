// Links de loja e WhatsApp. Puro: sem DOM e sem Supabase.
import { moeda } from './format.js';

function url(texto) {
  try { return new URL(String(texto ?? '').trim()); } catch { return null; }
}

// 'https://www.amazon.com.br/...' -> 'Amazon'
export function lojaDoLink(link) {
  const u = url(link);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, '');
  if (/(^|\.)amazon\./.test(host) || host === 'amzn.to' || host === 'a.co') return 'Amazon';
  if (/mercadoli(vre|bre)\./.test(host) || host === 'mercado.li') return 'Mercado Livre';
  if (/(^|\.)shopee\./.test(host) || host === 'shope.ee') return 'Shopee';
  return host;
}

const limpar = (texto) => {
  let t = texto;
  try { t = decodeURIComponent(t); } catch { /* fica como está */ }
  t = t.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? (t[0].toUpperCase() + t.slice(1)).slice(0, 90) : null;
};

// Tenta tirar o nome do produto do próprio link (as lojas colocam no endereço).
// Link curto (amzn.to, shope.ee) não tem nome: devolve null.
export function nomeDoLink(link) {
  const u = url(link);
  if (!u) return null;
  const partes = u.pathname.split('/').filter(Boolean);
  const loja = lojaDoLink(link);
  if (loja === 'Amazon') {
    const i = partes.findIndex((p) => p === 'dp' || p === 'gp');
    return i > 0 ? limpar(partes[i - 1]) : null;
  }
  if (loja === 'Mercado Livre') {
    const i = partes.indexOf('p');
    if (i > 0) return limpar(partes[i - 1]);
    const mlb = partes.find((p) => /^ML[A-Z]-?\d+/.test(p));
    return mlb ? limpar(mlb.replace(/^ML[A-Z]-?\d+-?/, '').replace(/-?_JM.*$/, '')) : null;
  }
  if (loja === 'Shopee') {
    const produto = partes.find((p) => /-i\.\d+\.\d+$/.test(p));
    return produto ? limpar(produto.replace(/-i\.\d+\.\d+$/, '')) : null;
  }
  return null;
}

// Mensagem educada pra cobrar (a pessoa pode editar antes de mandar)
export function mensagemCobranca(receber) {
  const nome = String(receber.quem ?? '').trim().split(/\s+/)[0];
  const motivo = receber.motivo ? ` (${receber.motivo})` : '';
  return `Oi${nome ? `, ${nome}` : ''}! Tudo bem? Passando só pra lembrar daqueles ${moeda(receber.valor)}${motivo}. `
    + 'Quando der, pode me mandar no Pix. Valeu!';
}

// Link do WhatsApp com a mensagem pronta. Sem telefone, o WhatsApp deixa escolher o contato.
export function linkWhatsApp(telefone, mensagem) {
  let numero = String(telefone ?? '').replace(/\D/g, '');
  if (numero && numero.length <= 11) numero = `55${numero}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
