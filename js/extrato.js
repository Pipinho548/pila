// Importar o extrato do C6 (PDF ou OFX). Puro: sem DOM e sem Supabase.
//
// PDF: traz o nome de quem recebeu cada Pix e o saldo de cada dia. É o melhor.
// OFX: traz um número de referência do banco (REFNUM), mas o Pix enviado vem sem nome.
// Os dois viram a mesma lista: { ref, data, valor (centavos, negativo = saiu), memo, tipoBanco }.

import { lerValor, mesDe } from './format.js';
import { efeitoNaConta, saldoEsperado, somarDias } from './calc.js';

// ---------- Ler o OFX ----------

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const decodificar = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m]);

// No OFX o valor vem com ponto: '-237.5', '71.0', '1229.70'
function centavosOFX(texto) {
  const m = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(texto ?? '').trim());
  if (!m) return null;
  const v = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -v : v;
}

export function lerOFX(texto) {
  const transacoes = [];
  for (const bloco of String(texto).matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi)) {
    const campo = (nome) => {
      const m = bloco[1].match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
      return m ? decodificar(m[1].trim()) : null;
    };
    const data = campo('DTPOSTED');
    const valor = centavosOFX(campo('TRNAMT'));
    if (!data || !valor) continue;
    const memo = campo('MEMO') ?? campo('NAME');
    transacoes.push({
      ref: `ofx:${campo('REFNUM') || campo('FITID')}`,
      data: `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}`,
      valor,
      memo: memo && memo !== 'undefined' ? memo : null,
      tipoBanco: null,
    });
  }
  return { origem: 'ofx', titular: null, saldo: null, saldos: {}, transacoes: ordenar(transacoes) };
}

const ordenar = (lista) => lista.sort((a, b) => a.data.localeCompare(b.data));

// ---------- Ler o PDF ----------

// Tira o texto do PDF em linhas, cada linha com as células da esquerda pra direita.
// Recebe a biblioteca pdf.js (no navegador vem da CDN; nos testes, do npm).
export async function linhasDoPDF(pdfjs, bytes, senha) {
  const doc = await pdfjs.getDocument({ data: bytes, password: senha, isEvalSupported: false }).promise;
  const linhas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const { items } = await pagina.getTextContent();
    const pedacos = items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ x: i.transform[4], y: i.transform[5], texto: i.str.trim() }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let atual = null;
    for (const p of pedacos) {
      if (!atual || Math.abs(atual.y - p.y) > 2) { atual = { y: p.y, celulas: [] }; linhas.push(atual); }
      atual.celulas.push(p);
    }
  }
  return linhas.map((l) => l.celulas.sort((a, b) => a.x - b.x));
}

const DIA_MES = /^(\d{2})\/(\d{2})$/;
const VALOR_PDF = /^(-?)R\$\s*([\d.]+,\d{2})$/;
const CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;

const valorPDF = (texto) => {
  const m = VALOR_PDF.exec(texto);
  if (!m) return null;
  const v = lerValor(m[2]);
  return m[1] ? -v : v;
};

// Lê as linhas do extrato em PDF do C6:
//   'Janeiro 2026' '( 01/01/2026 - 31/01/2026 )'           -> ano
//   '02/01' '02/01' 'Saída PIX' 'Pix enviado para X' '-R$ 129,78'
//   'Saldo do dia 02/01/26' 'R$ 0,00'
export function lerExtratoC6(linhas) {
  let ano = null;
  let titular = null;
  let saldo = null;
  const saldos = {};
  const transacoes = [];
  let ultima = null;
  for (const celulas of linhas) {
    const textos = celulas.map((c) => c.texto ?? c);
    const tudo = textos.join(' ');
    if (!titular && textos.length >= 2 && CPF.test(textos[1])) { titular = textos[0]; continue; }
    const periodo = /\(\s*\d{2}\/\d{2}\/(\d{4})\s*-/.exec(tudo);
    if (periodo) { ano = Number(periodo[1]); ultima = null; continue; }
    const s = /^Saldo do dia (\d{2})\/(\d{2})\/(\d{2})$/.exec(textos[0]);
    if (s) {
      const v = valorPDF(textos.at(-1));
      if (v != null) {
        saldo = { data: `20${s[3]}-${s[2]}-${s[1]}`, valor: v };
        saldos[saldo.data] = v;
      }
      ultima = null;
      continue;
    }
    const dia = DIA_MES.exec(textos[0]);
    const valor = valorPDF(textos.at(-1));
    if (dia && DIA_MES.test(textos[1] ?? '') && valor && ano && textos.length >= 4) {
      ultima = {
        data: `${ano}-${dia[2]}-${dia[1]}`,
        valor,
        tipoBanco: textos[2],
        memo: textos.slice(3, -1).join(' ') || null,
      };
      transacoes.push(ultima);
    } else if (ultima && textos.length === 1 && (celulas[0].x ?? 999) > 150 && !/^Data|^lançamento|^contábil/.test(textos[0])) {
      // Descrição comprida que quebrou em duas linhas
      ultima.memo = `${ultima.memo ?? ''} ${textos[0]}`.trim();
    } else {
      ultima = null;
    }
  }
  // Sem número do banco: a referência é dia + valor + descrição + quantas iguais vieram antes
  const vistas = new Map();
  for (const t of transacoes) {
    const chave = `${t.data}|${t.valor}|${normalizar(t.memo)}`;
    const n = (vistas.get(chave) ?? 0) + 1;
    vistas.set(chave, n);
    t.ref = `pdf:${chave}|${n}`;
  }
  return { origem: 'pdf', titular, saldo, saldos, transacoes: ordenar(transacoes) };
}

// ---------- Deixar a descrição legível ----------

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const SIGLAS = /\s(ltda|s\.?\s?\/?\s?a|me|epp|eireli)\.?$/i; // ' LTDA.', ' S.A.', ' S A', ' S/A'

function capitalizar(s) {
  return s.toLowerCase().split(' ')
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const ehCartao = (t) => /d[ée]bito de cart/i.test(t.tipoBanco ?? '') || /\s{2,}.*\s[A-Z]{3}$/.test(t.memo ?? '');

// Compra no débito vem como 'LOJA (22 letras) CIDADE (13) PAÍS'. No OFX tem espaços
// separando; no PDF não, então a cidade sai só se aparecer em outras compras do extrato.
function nomeDaLoja(memo, cidades) {
  const separado = /^(.*?)\s{2,}.*\s[A-Za-z]{3}$/.exec(memo);
  if (separado) return separado[1];
  const palavras = memo.replace(/\s[A-Za-z]{3}$/, '').split(' ');
  for (let i = 1; i < palavras.length; i++) {
    const cidade = palavras.slice(i).join(' ');
    if (cidade.length <= 13 && (cidades.get(cidade.toLowerCase())?.size ?? 0) >= 2) return palavras.slice(0, i).join(' ');
  }
  return palavras.join(' ');
}

// Possíveis cidades no fim das compras no débito deste extrato, com as lojas que vieram antes delas.
// Cidade de verdade aparece depois de lojas diferentes.
export function cidadesDoExtrato(transacoes) {
  const lojas = new Map();
  for (const t of transacoes) {
    if (!ehCartao(t) || !t.memo) continue;
    const palavras = t.memo.replace(/\s+/g, ' ').replace(/\s[A-Za-z]{3}$/, '').split(' ');
    for (let i = 1; i < palavras.length; i++) {
      const cidade = palavras.slice(i).join(' ').toLowerCase();
      if (cidade.length > 13) continue;
      if (!lojas.has(cidade)) lojas.set(cidade, new Set());
      lojas.get(cidade).add(palavras.slice(0, i).join(' ').toLowerCase());
    }
  }
  return lojas;
}

// 'Pix enviado para PADARIA BOM PAO LTDA' -> 'Padaria Bom Pao'
// 'SUPERMERCADO X    CIDADE BRA'          -> 'Supermercado X'
export function limparDescricao(t, cidades = new Map()) {
  const memo = t.memo;
  if (!memo) return 'Sem descrição';
  let s = memo.trim();
  if (ehCartao(t)) s = nomeDaLoja(s, cidades);
  s = s
    .replace(/^pix (autom[áa]tico )?enviado para /i, '')
    .replace(/^(pix recebido de|devol recebida pix de) /i, '')
    .replace(/^[A-Z]{1,4}\s?\*\s?/, '')   // prefixos tipo 'VMT*' e 'DL *'
    .replace(/^\d{6,}-?/, '')             // código no começo
    .replace(/\s+/g, ' ')
    .trim();
  while (SIGLAS.test(s)) s = s.replace(SIGLAS, '');
  s = s.replace(/[.,]$/, '');
  if (!s) return 'Sem descrição';
  return s === s.toUpperCase() ? capitalizar(s) : s;
}

// Jeito de pagar
export function meioDaTransacao(t) {
  const tipo = t.tipoBanco ?? '';
  const memo = t.memo ?? '';
  if (/pix/i.test(tipo) || /pix/i.test(memo)) return 'pix';
  if (ehCartao(t)) return 'debito';
  if (/pagamento|boleto/i.test(tipo) || /boleto|pagamento/i.test(memo)) return 'boleto';
  return 'pix';
}

// ---------- Sugerir categoria ----------

// Palavras na descrição -> nome da categoria do app. A primeira que bater vale.
const REGRAS = [
  [/mercado ?livre|amazon|shopee|shpp|magalu|magazine luiza|casas bahia|leroy/i, 'Casa'],
  [/uber|99 ?tecnologia|99app|cabify|posto|combust|estaciona|detran/i, 'Transporte'],
  [/supermerc|mercado|atacad|hortifruti|a[çc]ougue|padaria/i, 'Mercado'],
  [/restaura|ristorante|hamburg|burger|burguer|lanche|pizza|sorvet|espetinho|ifood|cafe|café|cozinha|mc ?donald|churrasc/i, 'Comida fora'],
  [/psn|playstation|steam|nintendo|xbox|jogos|games|entretenimento|interactive|ingresso|cinema/i, 'Lazer e games'],
  [/telefonica|vivo|claro|internet|google|netflix|spotify|disney|prime video|anthropic|claude/i, 'Contas e assinaturas'],
  [/barbearia|cabelo|sal[ãa]o|est[ée]tica|perfum/i, 'Cuidados pessoais'],
  [/academia|farm[áa]cia|drogaria|cl[íi]nica|m[ée]dic/i, 'Saúde e academia'],
  [/aluguel|condom[íi]nio|energia|\bluz\b|\b[áa]gua\b|\bg[áa]s\b/i, 'Moradia'],
];

const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Descrições que não dizem pra quem foi: não dá pra aprender nada com elas
const GENERICA = /^(transf enviada pix|transf recebida pix|pix recebido|pix recusado|pix estornado)?$/;

// O que já foi importado ensina: mesma descrição do banco, mesma categoria (vale a mais recente)
export function aprenderCategorias(lancamentos) {
  const mapa = new Map();
  for (const l of lancamentos) {
    const m = /^C6: (.*)$/.exec(l.observacao ?? '');
    const chave = m && normalizar(m[1]);
    if (chave && !GENERICA.test(chave) && l.categoria_id) mapa.set(chave, l.categoria_id);
  }
  return mapa;
}

export function sugerirCategoria(memo, categorias, aprendido = new Map()) {
  const lembrada = aprendido.get(normalizar(memo));
  if (lembrada && categorias.some((c) => c.id === lembrada)) return lembrada;
  for (const [regra, nome] of REGRAS) {
    if (regra.test(memo ?? '')) {
      const cat = categorias.find((c) => c.nome === nome);
      if (cat) return cat.id;
    }
  }
  return null;
}

// ---------- Comparar com o que já está no app ----------

// Id fixo a partir da referência: importar o mesmo extrato de novo não duplica
export async function idDaTransacao(ref) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`c6:${ref}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function distancia(a, b) {
  const [x, y] = [a, b].sort();
  let d = 0;
  for (let dia = x; dia < y && d < 99; dia = somarDias(dia, 1)) d++;
  return d;
}

// Marca cada transação: 'importada' (veio de outro extrato), 'no-app' (você já lançou) ou 'nova'.
// Bate por valor e sentido, com até 'folga' dias de diferença (o banco às vezes registra depois).
// transacoes precisam ter .id (de idDaTransacao).
export function compararComApp(transacoes, lancamentos, { folga = 3 } = {}) {
  const naConta = lancamentos.filter((l) => efeitoNaConta(l) !== 0).map((l) => ({ l, efeito: efeitoNaConta(l) }));
  const porId = new Map(naConta.filter((c) => c.l.cliente_id).map((c) => [c.l.cliente_id, c]));
  const usados = new Set();
  const resultado = transacoes.map((t) => ({ ...t }));

  for (const r of resultado) {
    const mesma = porId.get(r.id);
    if (mesma) { usados.add(mesma); r.situacao = 'importada'; r.comQue = [mesma.l]; }
  }
  for (const r of resultado) {
    if (r.situacao) continue;
    let melhor = null;
    for (const c of naConta) {
      if (usados.has(c) || c.efeito !== r.valor) continue;
      const d = distancia(c.l.data, r.data);
      if (d <= folga && (!melhor || d < melhor.d)) melhor = { c, d };
    }
    if (melhor) { usados.add(melhor.c); r.situacao = 'no-app'; r.comQue = [melhor.c.l]; }
  }
  // Um Pix só que você lançou em duas partes no mesmo dia (ex.: aluguel + mercado pra mesma pessoa)
  for (const r of resultado) {
    if (r.situacao) continue;
    const doDia = naConta.filter((c) => !usados.has(c) && c.l.data === r.data && Math.sign(c.efeito) === Math.sign(r.valor));
    achou: for (let i = 0; i < doDia.length; i++) {
      for (let j = i + 1; j < doDia.length; j++) {
        if (doDia[i].efeito + doDia[j].efeito === r.valor) {
          usados.add(doDia[i]);
          usados.add(doDia[j]);
          r.situacao = 'no-app';
          r.comQue = [doDia[i].l, doDia[j].l];
          break achou;
        }
      }
    }
  }
  for (const r of resultado) r.situacao ??= 'nova';
  return resultado;
}

const somenteLetras = (s) => normalizar(s).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// Pix que voltou (recusado e estornado, ou devolvido no mesmo dia): os dois ficam de fora
function juntarDevolucoes(linhas) {
  const abertas = linhas.filter((r) => r.situacao === 'nova');
  for (const volta of abertas) {
    if (volta.valor <= 0 || !/devol|estorn/i.test(volta.memo ?? '') || volta.situacao !== 'nova') continue;
    const de = somenteLetras((volta.memo ?? '').replace(/^devol recebida pix de /i, ''));
    const ida = abertas.find((r) => r.situacao === 'nova' && r.valor === -volta.valor
      && (r.data === volta.data || r.data === somarDias(volta.data, -1))
      && (/recusad/i.test(r.memo ?? '') || !de || somenteLetras(r.memo).includes(de)));
    if (ida) {
      ida.situacao = 'fora'; ida.motivo = 'Pix que voltou';
      volta.situacao = 'fora'; volta.motivo = 'Pix que voltou';
    }
  }
}

// Conta do plano que ainda não foi marcada como paga, com o mesmo valor, no mês da transação
const TIPOS_QUE_SE_PAGAM = new Set(['conta_fixa', 'parcela', 'avulsa', 'deposito']);
function contaDoPlano(t, itens, jaUsados) {
  const valor = -t.valor;
  return itens
    .filter((i) => !i.pago && !jaUsados.has(i.id) && TIPOS_QUE_SE_PAGAM.has(i.tipo) && i.mes === mesDe(t.data)
      && (i.valor_real ?? i.valor_previsto) === valor)
    .sort((a, b) => (a.vencimento ?? '9').localeCompare(b.vencimento ?? '9'))[0] ?? null;
}

// O extrato inteiro, pronto pra mostrar: o que já está no app, o que fica de fora e o que dá pra lançar.
// extrato: de lerOFX ou lerExtratoC6, com .id em cada transação.
export function analisarExtrato(extrato, dados) {
  const base = saldoEsperado(dados)?.base ?? null;
  const desde = base?.data ?? null;
  // O saldo que você conferiu é o do fim do dia no banco? Então o dia todo já está nele.
  const diaFechado = Boolean(desde) && extrato.saldos?.[desde] === base.saldo;
  const linhas = compararComApp(extrato.transacoes, dados.lancamentos);
  const cidades = cidadesDoExtrato(extrato.transacoes);
  const aprendido = aprenderCategorias(dados.lancamentos);
  const titular = extrato.titular ? somenteLetras(extrato.titular) : null;
  const itensUsados = new Set();

  for (const r of linhas) {
    r.descricao = limparDescricao(r, cidades);
    if (r.situacao !== 'nova') continue;
    const memo = r.memo ?? '';
    // Antes do saldo conferido: já está fechado com o banco
    if (desde && (r.data < desde || (diaFechado && r.data === desde))) { r.situacao = 'antiga'; continue; }
    if (/fatura de cart|pgto fat/i.test(memo)) { r.situacao = 'fora'; r.motivo = 'Fatura do cartão: registra na tela Fatura'; continue; }
    if (titular && somenteLetras(memo.replace(/^pix (autom[áa]tico )?enviado para |^pix recebido de /i, '')) === titular) {
      r.situacao = 'fora'; r.motivo = 'Transferência entre contas suas'; continue;
    }
    if (r.valor < 0) {
      const item = contaDoPlano(r, dados.itens_mes, itensUsados);
      if (item) { itensUsados.add(item.id); r.proposta = { tipo: 'conta', item_id: item.id, nome: item.nome, marcada: true, meio: meioDaTransacao(r) }; continue; }
    }
    if (/\bcdb\b|lim\.? ?garant/i.test(memo)) { r.situacao = 'fora'; r.motivo = 'CDB: registra em Caixinhas'; continue; }
  }
  juntarDevolucoes(linhas);
  for (const r of linhas) {
    if (r.situacao !== 'nova' || r.proposta) continue;
    r.proposta = r.valor < 0
      ? { tipo: 'gasto', marcada: true, categoria_id: sugerirCategoria(r.memo, dados.categorias, aprendido), meio: meioDaTransacao(r) }
      : { tipo: 'entrada', marcada: false, meio: meioDaTransacao(r) };
  }

  // Saldo do banco no fim do extrato x o que o app espera pra esse dia
  let saldo = null;
  if (extrato.saldo && base && extrato.saldo.data >= desde) {
    const ate = extrato.saldo.data;
    const esperado = base.saldo + saldoEsperado(dados).movimentos
      .filter((l) => l.data <= ate)
      .reduce((total, l) => total + efeitoNaConta(l), 0);
    saldo = { ...extrato.saldo, esperado };
  }

  const datas = extrato.transacoes.map((t) => t.data);
  return {
    origem: extrato.origem,
    de: datas[0] ?? null,
    ate: datas.at(-1) ?? null,
    desde,
    diaFechado,
    saldo,
    linhas,
  };
}

// O que vai pro banco de dados pra cada transação marcada (contas do plano vão pelo "pagar conta")
export function lancamentoDaTransacao(r, categoria_id) {
  const base = {
    cliente_id: r.id,
    data: r.data,
    valor: Math.abs(r.valor),
    descricao: r.descricao,
    observacao: r.memo ? `C6: ${r.memo}` : null,
  };
  if (r.valor > 0) return { ...base, tipo: 'entrada', meio: r.proposta?.meio ?? 'pix', categoria_id: null };
  return { ...base, tipo: 'gasto', meio: r.proposta?.meio ?? 'pix', categoria_id };
}
