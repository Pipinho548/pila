// Cálculos puros: sem DOM e sem Supabase.
// Dinheiro sempre em centavos (inteiro). Datas 'AAAA-MM-DD', meses 'AAAA-MM'.
//
// "dados" tem o formato das tabelas do Supabase:
//   { config, categorias, itens_mes, lancamentos, caixinhas, saldos_conferidos, limites, ... }

import { mesDe } from './format.js';

const pad = (n) => String(n).padStart(2, '0');

export const soma = (lista, valor = (x) => x.valor) => lista.reduce((total, x) => total + valor(x), 0);

// ---------- Datas ----------

export function diasNoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

// Dia do mês, sem passar do último dia (dia 31 em novembro vira 30).
export function dataNoMes(mes, dia) {
  return `${mes}-${pad(Math.min(dia, diasNoMes(mes)))}`;
}

export function somarDias(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

const diaDe = (data) => Number(data.slice(8, 10));

// ---------- Cartão ----------

// Em qual fatura (mês do vencimento) cai uma compra no cartão.
// Fecha dia 03 e vence dia 10: compras de 04/10 a 03/11 vencem em 10/11.
export function faturaDaCompra(data, fechaDia, venceDia) {
  const mesFechamento = diaDe(data) <= fechaDia ? mesDe(data) : somarMeses(mesDe(data), 1);
  return venceDia > fechaDia ? mesFechamento : somarMeses(mesFechamento, 1);
}

export function fechamentoDaFatura(faturaMes, fechaDia, venceDia) {
  const mesFechamento = venceDia > fechaDia ? faturaMes : somarMeses(faturaMes, -1);
  return dataNoMes(mesFechamento, fechaDia);
}

export function vencimentoDaFatura(faturaMes, venceDia) {
  return dataNoMes(faturaMes, venceDia);
}

// Compras no cartão separadas pela regra: uber, assinaturas e outras.
export function resumoCartao(lancamentos) {
  const cartao = lancamentos.filter((l) => l.meio === 'cartao' && l.tipo === 'gasto');
  const uber = soma(cartao.filter((l) => l.regra_cartao === 'uber'));
  const assinaturas = soma(cartao.filter((l) => l.regra_cartao === 'assinatura'));
  const outras = soma(cartao) - uber - assinaturas;
  return { uber, assinaturas, outras, total: uber + assinaturas + outras };
}

export function corridasUber(lancamentos, faturaMes) {
  return soma(lancamentos.filter((l) =>
    l.regra_cartao === 'uber' && !l.antes_do_app && l.fatura_mes === faturaMes));
}

const faturaPaga = (lancamentos, faturaMes) =>
  lancamentos.some((l) => l.tipo === 'pagamento_fatura' && l.fatura_mes === faturaMes);

// "Reservado pra fatura": compras no cartão fora da regra (nem Uber, nem assinatura)
// de faturas ainda não pagas. O dinheiro continua na conta, mas já tem dono.
export function reservadoFatura(lancamentos) {
  return soma(lancamentos.filter((l) =>
    l.meio === 'cartao' && l.regra_cartao === 'outra' && !l.antes_do_app
    && !faturaPaga(lancamentos, l.fatura_mes)));
}

// Fatura que está recebendo as compras de hoje.
export function faturaAberta(dados, hoje) {
  const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = dados.config;
  const mes = faturaDaCompra(hoje, fecha, vence);
  const compras = dados.lancamentos.filter((l) => l.meio === 'cartao' && l.fatura_mes === mes);
  return {
    mes,
    fecha: fechamentoDaFatura(mes, fecha, vence),
    vence: vencimentoDaFatura(mes, vence),
    ...resumoCartao(compras),
  };
}

// ---------- Plano do mês e Livre ----------

// Gasto do dia a dia que desconta do Livre.
// Fora: contas do plano (já contam pelo item), Uber e assinatura no cartão
// (entram no plano do mês da fatura) e compras de antes do app.
export function contaNoLivre(l) {
  return l.tipo === 'gasto' && !l.item_mes_id && !l.antes_do_app
    && l.regra_cartao !== 'uber' && l.regra_cartao !== 'assinatura';
}

// Quanto um item do plano vale agora.
export function valorItem(item, dados, hoje) {
  if (item.valor_real != null) return item.valor_real;
  if (item.tipo === 'fatura_uber' && item.fatura_mes && dados.config) {
    const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = dados.config;
    const usado = corridasUber(dados.lancamentos, item.fatura_mes);
    // Fatura aberta: vale o maior entre o previsto e o já usado. Fechou: vale o real.
    const fechou = hoje > fechamentoDaFatura(item.fatura_mes, fecha, vence);
    return fechou ? usado : Math.max(item.valor_previsto, usado);
  }
  return item.valor_previsto;
}

const porVencimento = (a, b) =>
  (a.vencimento ?? '9999').localeCompare(b.vencimento ?? '9999') || (a.ordem ?? 0) - (b.ordem ?? 0);

export function resumoMes(dados, mes, hoje) {
  const doMes = dados.lancamentos.filter((l) => mesDe(l.data) === mes);
  const itens = dados.itens_mes.filter((i) => i.mes === mes).sort(porVencimento);
  const valor = (i) => valorItem(i, dados, hoje);

  // Dinheiro que ainda não caiu não existe: só entradas até hoje.
  const entradas = soma(doMes.filter((l) => l.tipo === 'entrada' && l.data <= hoje));
  // Resgate de caixinha pra usar no mês (não o que foi pra pagar fatura)
  const resgates = soma(doMes.filter((l) => l.tipo === 'resgate_caixinha' && !l.fatura_mes && l.data <= hoje));
  const plano = soma(itens, valor);
  const gastos = soma(doMes.filter(contaNoLivre));
  const depositos = soma(doMes.filter((l) => l.tipo === 'deposito_caixinha' && !l.item_mes_id));
  const ajustes = soma(doMes.filter((l) => l.tipo === 'ajuste'));
  const livre = entradas + resgates - plano - gastos - depositos + ajustes;

  const pendentes = itens.filter((i) => !i.pago);
  return {
    mes,
    itens,
    entradas,
    resgates,
    plano,
    gastos,
    depositos,
    ajustes,
    livre,
    faltaPagar: soma(pendentes, valor),
    pendentes,
    proxima: pendentes[0] ?? null,
    salarioCaiu: doMes.some((l) => l.tipo === 'entrada' && l.descricao === 'Salário'),
  };
}

// Total previsto do plano e o que sobra do salário.
export function resumoPlano(itens, salario, dados, hoje) {
  const total = soma(itens, (i) => valorItem(i, dados, hoje));
  return { total, sobra: salario - total };
}

// ---------- Quanto posso gastar ----------

// livre: Livre agora. gastosHoje: gastos do dia a dia de hoje (já descontados do Livre).
export function quantoPossoGastar(livre, gastosHoje, hoje) {
  const mes = mesDe(hoje);
  const total = diasNoMes(mes);
  const dia = diaDe(hoje);
  const diasDepoisDeHoje = total - dia;
  const livreNoComecoDoDia = livre + gastosHoje;
  // "Por dia" sempre arredondado pra baixo, no centavo.
  const orcamentoHoje = Math.floor(livreNoComecoDoDia / (diasDepoisDeHoje + 1));
  const porDia = diasDepoisDeHoje > 0 ? Math.floor(livre / diasDepoisDeHoje) : livre;
  return {
    orcamentoHoje,
    aindaDaHoje: orcamentoHoje - gastosHoje,
    porDia,
    ultimoDia: dataNoMes(mes, total),
    diasDepoisDeHoje,
  };
}

export function gastosDoDia(dados, data) {
  return soma(dados.lancamentos.filter((l) => l.data === data && contaNoLivre(l)));
}

// ---------- Categorias e limites ----------

export function gastosPorCategoria(dados, mes) {
  const total = new Map();
  for (const l of dados.lancamentos) {
    if (mesDe(l.data) !== mes || !contaNoLivre(l)) continue;
    total.set(l.categoria_id, (total.get(l.categoria_id) ?? 0) + l.valor);
  }
  return total;
}

export function corDoLimite(usado, limite) {
  const pct = usado * 100 / limite;
  if (pct > 100) return 'vermelho';
  if (pct >= 80) return 'laranja';
  return 'verde';
}

export function situacaoLimites(dados, mes) {
  const porCategoria = gastosPorCategoria(dados, mes);
  return dados.limites
    .filter((l) => l.mes === mes)
    .map((l) => {
      const usado = soma(l.categorias, (id) => porCategoria.get(id) ?? 0);
      return { ...l, usado, cor: corDoLimite(usado, l.valor), pct: Math.round(usado * 100 / l.valor) };
    });
}

// ---------- Caixinhas ----------

export function saldoCaixinha(caixinha, lancamentos) {
  let saldo = caixinha.saldo_inicial;
  for (const l of lancamentos) {
    if (l.caixinha_id !== caixinha.id) continue;
    if (l.tipo === 'deposito_caixinha') saldo += l.valor;
    else if (l.tipo === 'resgate_caixinha' || l.tipo === 'gasto') saldo -= l.valor;
  }
  return saldo;
}

// ---------- Conferir com o banco ----------

// Quanto um lançamento mexe no saldo da conta C6.
// Cartão e dinheiro vivo não mexem (o cartão só sai quando a fatura é paga).
export function efeitoNaConta(l) {
  const naConta = l.meio !== 'cartao' && l.meio !== 'dinheiro';
  switch (l.tipo) {
    case 'entrada': return naConta ? l.valor : 0;
    case 'gasto': return naConta ? -l.valor : 0;
    case 'deposito_caixinha': return -l.valor;
    case 'pagamento_fatura': return -l.valor;
    case 'resgate_caixinha': return l.valor;
    default: return 0; // ajuste só corrige o Livre, não o banco
  }
}

const instante = (x) => (x.created_at ? Date.parse(x.created_at) : 0);

function depoisDe(l, base) {
  if (l.data !== base.data) return l.data > base.data;
  return instante(l) > instante(base);
}

export function ultimoConferido(saldos) {
  return [...saldos].sort((a, b) => a.data.localeCompare(b.data) || instante(a) - instante(b)).at(-1) ?? null;
}

export function saldoEsperado(dados) {
  const base = ultimoConferido(dados.saldos_conferidos);
  if (!base) return null;
  const movimentos = dados.lancamentos.filter((l) => depoisDe(l, base) && efeitoNaConta(l) !== 0);
  return { base, movimentos, esperado: base.saldo + soma(movimentos, efeitoNaConta) };
}

// ---------- Alertas da tela Hoje ----------

export function alertas(dados, hoje) {
  const lista = [];
  const mes = resumoMes(dados, mesDe(hoje), hoje);
  for (const item of mes.pendentes) {
    if (!item.vencimento) continue;
    if (item.vencimento < hoje) lista.push({ tipo: 'atrasada', item });
    else if (item.vencimento <= somarDias(hoje, 3)) lista.push({ tipo: 'vence', item });
  }
  for (const limite of situacaoLimites(dados, mesDe(hoje))) {
    if (limite.cor !== 'verde') lista.push({ tipo: 'limite', limite });
  }
  const foraDaRegra = dados.lancamentos.filter((l) =>
    l.regra_cartao === 'outra' && !l.antes_do_app && mesDe(l.data) === mesDe(hoje));
  if (foraDaRegra.length) lista.push({ tipo: 'cartao', total: soma(foraDaRegra), quantas: foraDaRegra.length });
  return lista;
}
