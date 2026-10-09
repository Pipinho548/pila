// Moeda e datas. Dinheiro é sempre inteiro em centavos.
// Datas são strings 'AAAA-MM-DD' no fuso de São Paulo.

export const FUSO = 'America/Sao_Paulo';

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// 123456 -> 'R$ 1.234,56' (dividir por 100 aqui é só para exibir, nunca para somar)
export function moeda(centavos) {
  return fmtMoeda.format(centavos / 100);
}

// Texto digitado -> centavos (inteiro). Aceita '12', '12,5', '12,50', '1.234,56', '12.50'.
// Devolve null se não for um valor válido.
export function lerValor(texto) {
  let s = String(texto ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  let negativo = false;
  if (s.startsWith('-')) { negativo = true; s = s.slice(1); }

  let inteiro, fracao = '';
  if (s.includes(',')) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal
    const partes = s.split(',');
    if (partes.length !== 2) return null;
    inteiro = partes[0].replace(/\./g, '');
    fracao = partes[1];
  } else {
    const partes = s.split('.');
    if (partes.length === 2 && partes[1].length <= 2) {
      inteiro = partes[0];
      fracao = partes[1];
    } else {
      inteiro = partes.join('');
    }
  }
  if (!/^\d*$/.test(inteiro) || !/^\d{0,2}$/.test(fracao)) return null;
  if (!inteiro && !fracao) return null;
  const centavos = Number(inteiro || '0') * 100 + Number(fracao.padEnd(2, '0') || '0');
  return negativo ? -centavos : centavos;
}

// Partes da data/hora em São Paulo, sem depender do fuso do aparelho.
function partesSP(agora) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(agora)) p[type] = value;
  return p;
}

// Hoje em São Paulo: 'AAAA-MM-DD'. Nunca usar toISOString() para isso.
export function hoje(agora = new Date()) {
  const p = partesSP(agora);
  return `${p.year}-${p.month}-${p.day}`;
}

// '2026-10-31' -> '2026-10'
export function mesDe(data) {
  return data.slice(0, 7);
}

// '2026-10-31' -> '31/10/2026'
export function dataBR(data) {
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

// '2026-10-31' -> '31/10'
export function dataCurta(data) {
  const [, m, d] = data.split('-');
  return `${d}/${m}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// '2026-11' -> 'novembro/26'
export function nomeMes(mes) {
  const [a, m] = mes.split('-');
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
}
