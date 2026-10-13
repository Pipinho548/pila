// Lançar por frase ou print: o que vai pra IA e o que volta dela. Puro: sem DOM e sem Supabase.
// A IA só sugere. Nada entra no app sem você conferir e tocar em Lançar.

import { faturaDaCompra, somarDias } from './calc.js';

const MEIOS = ['pix', 'debito', 'cartao', 'dinheiro', 'boleto'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// O que o app manda pra função: a frase, o print (se tiver), o dia de hoje e os nomes das categorias
export function pedidoParaIA({ texto, imagem, hoje, categorias }) {
  return {
    texto: String(texto ?? '').trim().slice(0, 2000),
    imagem: imagem ?? null,
    hoje,
    categorias: categorias.map((c) => c.nome),
  };
}

function distancia(a, b) {
  const [x, y] = [a, b].sort();
  let d = 0;
  for (let dia = x; dia < y && d < 99; dia = somarDias(dia, 1)) d++;
  return d;
}

// Já tem no app um lançamento com o mesmo valor, do mesmo jeito (cartão ou conta), até 3 dias de diferença?
function parecidoNoApp(p, lancamentos, usados) {
  const cartao = p.meio === 'cartao';
  const candidato = lancamentos
    .filter((l) => !usados.has(l.id) && l.tipo === p.tipo && l.valor === p.valor
      && (l.meio === 'cartao') === cartao && distancia(l.data, p.data) <= 3)
    .sort((a, b) => distancia(a.data, p.data) - distancia(b.data, p.data))[0];
  if (candidato) usados.add(candidato.id);
  return candidato ?? null;
}

// O que a IA respondeu vira a lista pra conferir. Linha com valor ou data estranhos fica de fora.
export function propostasDaIA(resposta, dados, hoje) {
  const usados = new Set();
  const propostas = [];
  let descartadas = 0;
  for (const [i, item] of (resposta?.lancamentos ?? []).entries()) {
    const valor = Number(item.valor_centavos);
    const data = DATA.test(item.data ?? '') ? item.data : hoje;
    const tipo = item.tipo === 'entrada' ? 'entrada' : 'gasto';
    if (!Number.isInteger(valor) || valor <= 0 || valor > 100_000_000) { descartadas++; continue; }
    const p = {
      id: `ia-${i}`,
      data,
      valor,
      tipo,
      meio: MEIOS.includes(item.meio) ? item.meio : 'pix',
      descricao: String(item.descricao ?? '').trim().slice(0, 80) || (tipo === 'entrada' ? 'Entrada' : 'Gasto'),
      categoria_id: tipo === 'gasto' ? (dados.categorias.find((c) => c.nome === item.categoria)?.id ?? null) : null,
    };
    if (tipo === 'entrada' && p.meio !== 'dinheiro') p.meio = 'pix';
    p.noApp = parecidoNoApp(p, dados.lancamentos, usados);
    p.marcada = !p.noApp;
    propostas.push(p);
  }
  return { propostas, aviso: String(resposta?.aviso ?? '').trim(), descartadas };
}

// Como cada proposta marcada entra no banco de dados (cartão vai pra fatura, igual ao Lançar)
export function lancamentoDaIA(p, categoria_id, dados) {
  const base = { cliente_id: crypto.randomUUID(), data: p.data, valor: p.valor, descricao: p.descricao };
  if (p.tipo === 'entrada') return { ...base, tipo: 'entrada', meio: p.meio, categoria_id: null };
  const cartao = p.meio === 'cartao';
  const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = dados.config;
  const transporte = dados.categorias.find((c) => c.id === categoria_id)?.nome === 'Transporte';
  return {
    ...base,
    tipo: 'gasto',
    meio: p.meio,
    categoria_id,
    fatura_mes: cartao ? faturaDaCompra(p.data, fecha, vence) : null,
    regra_cartao: cartao ? (transporte ? 'uber' : 'outra') : null,
  };
}
