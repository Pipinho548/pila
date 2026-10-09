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

const utc = (data) => { const [a, m, d] = data.split('-').map(Number); return Date.UTC(a, m - 1, d); };

// Dias de uma data até outra: diasEntre('2026-10-09', '2026-10-12') = 3
export function diasEntre(de, ate) {
  return Math.round((utc(ate) - utc(de)) / 86400000);
}

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

const TIPOS_DA_FATURA = ['fatura_antiga', 'fatura_uber', 'assinatura'];

// Tudo de uma fatura (mês de vencimento): compras, de onde sai o dinheiro e se já foi paga.
export function detalheFatura(dados, faturaMes, hoje) {
  const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = dados.config;
  const compras = dados.lancamentos
    .filter((l) => l.meio === 'cartao' && l.tipo === 'gasto' && l.fatura_mes === faturaMes)
    .sort((a, b) => a.data.localeCompare(b.data));
  const novas = compras.filter((l) => !l.antes_do_app);
  // Assinaturas (Claude, Google) cobram sozinhas: entram pela conta do plano, não por lançamento
  const itensAssinatura = dados.itens_mes.filter((i) => i.tipo === 'assinatura' && i.fatura_mes === faturaMes);
  const valorAssinaturas = soma(itensAssinatura, (i) => i.valor_real ?? i.valor_previsto);

  const porRegra = resumoCartao(compras);
  porRegra.assinaturas += valorAssinaturas;
  porRegra.total += valorAssinaturas;

  // De onde sai: o que já está no plano do mês e o que está "Reservado pra fatura"
  const antigas = soma(compras.filter((l) => l.antes_do_app));
  const uber = soma(novas.filter((l) => l.regra_cartao === 'uber'));
  const assinaturas = soma(novas.filter((l) => l.regra_cartao === 'assinatura')) + valorAssinaturas;
  const reservado = soma(novas.filter((l) => l.regra_cartao === 'outra'));
  const dataFecha = fechamentoDaFatura(faturaMes, fecha, vence);

  return {
    mes: faturaMes,
    fecha: dataFecha,
    vence: vencimentoDaFatura(faturaMes, vence),
    fechada: hoje > dataFecha,
    compras,
    itensAssinatura,
    ...porRegra,
    origem: { antigas, uber, assinaturas, reservado },
    pagamento: dados.lancamentos.find((l) => l.tipo === 'pagamento_fatura' && l.fatura_mes === faturaMes) ?? null,
  };
}

// Fatura que está recebendo as compras de hoje.
export function faturaAberta(dados, hoje) {
  const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = dados.config;
  return detalheFatura(dados, faturaDaCompra(hoje, fecha, vence), hoje);
}

// Faturas que já fecharam e ainda não foram pagas.
export function faturasParaPagar(dados, hoje) {
  const aberta = faturaAberta(dados, hoje).mes;
  const meses = new Set();
  for (const l of dados.lancamentos) if (l.meio === 'cartao' && l.fatura_mes && l.fatura_mes < aberta) meses.add(l.fatura_mes);
  for (const i of dados.itens_mes) if (TIPOS_DA_FATURA.includes(i.tipo) && i.fatura_mes && i.fatura_mes < aberta) meses.add(i.fatura_mes);
  return [...meses].sort()
    .map((mes) => detalheFatura(dados, mes, hoje))
    .filter((f) => !f.pagamento && f.total > 0);
}

// Contas do plano que são pagas junto com a fatura
export function itensDaFatura(dados, faturaMes) {
  return dados.itens_mes.filter((i) => TIPOS_DA_FATURA.includes(i.tipo) && i.fatura_mes === faturaMes);
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

// O que entrou numa ou mais categorias no mês: os gastos do dia a dia e as contas do plano.
export function gastosDaCategoria(dados, mes, ids, hoje) {
  const nas = (id) => ids.includes(id);
  const lancamentos = dados.lancamentos
    .filter((l) => mesDe(l.data) === mes && contaNoLivre(l) && nas(l.categoria_id))
    .sort((a, b) => b.data.localeCompare(a.data) || (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  const itens = dados.itens_mes.filter((i) => i.mes === mes && nas(i.categoria_id)).sort(porVencimento);
  return {
    lancamentos,
    itens,
    diaADia: soma(lancamentos),
    plano: soma(itens, (i) => valorItem(i, dados, hoje)),
  };
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

// ---------- Dívidas ----------

export function resumoDivida(divida, parcelas) {
  const minhas = parcelas.filter((p) => p.divida_id === divida.id).sort((a, b) => a.numero - b.numero);
  const pendentes = minhas.filter((p) => !p.paga);
  const pagas = divida.pagas_antes + minhas.filter((p) => p.paga).length;
  let falta;
  if (divida.status === 'quitada') falta = 0;
  else if (pendentes.length) falta = soma(pendentes);
  else falta = divida.valor_negociado ?? divida.valor_original ?? 0;
  return {
    pagas,
    total: divida.total_parcelas,
    falta,
    pendentes,
    proxima: pendentes[0] ?? null,
    ultima: pendentes.at(-1) ?? null,
  };
}

export function totalDevo(dados) {
  let parcelado = 0;
  let semData = 0;
  for (const d of dados.dividas) {
    if (d.status === 'quitada') continue;
    const r = resumoDivida(d, dados.parcelas);
    if (r.pendentes.length) parcelado += r.falta; else semData += r.falta;
  }
  return { parcelado, semData, total: parcelado + semData };
}

// Quando o dinheiro libera: no mês seguinte à última parcela, a parcela vira sobra.
export function linhaDoTempo(dados) {
  const porMes = new Map();
  for (const d of dados.dividas) {
    if (d.status === 'quitada') continue;
    const { ultima } = resumoDivida(d, dados.parcelas);
    if (!ultima) continue;
    const mes = somarMeses(mesDe(ultima.vencimento), 1);
    const passo = porMes.get(mes) ?? { mes, valor: 0, dividas: [] };
    passo.valor += ultima.valor;
    passo.dividas.push(d.nome);
    porMes.set(mes, passo);
  }
  let acumulado = 0;
  return [...porMes.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((p) => ({ ...p, acumulado: (acumulado += p.valor) }));
}

// ---------- Projeção ----------

// O mês já foi montado (pela virada ou pela importação) quando tem conta vinda de conta fixa ou parcela.
// Conta avulsa sozinha não conta: dá pra adicionar a carne de dezembro antes de dezembro começar.
const montado = (dados, mes) => dados.itens_mes.some((i) => i.mes === mes && (i.conta_fixa_id || i.parcela_id));

// Plano de um mês: o de verdade, se já foi montado; senão, o projetado (contas fixas ativas e
// parcelas que vencem no mês) junto com as avulsas que já existirem.
export function planoDoMes(dados, mes) {
  const reais = dados.itens_mes.filter((i) => i.mes === mes);
  if (montado(dados, mes)) return { itens: reais, projetado: false };
  return { itens: [...planoProjetado(dados, mes), ...reais].sort(porVencimento), projetado: true };
}

function planoProjetado(dados, mes) {
  const venceCartao = dados.config?.cartao_vence_dia;
  const categoriaParcelas = dados.categorias.find((c) => c.nome === 'Parcelas e dívidas')?.id ?? null;
  const comQuem = (nome, quem) => (quem && !nome.includes('(') ? `${nome} (${quem})` : nome);

  const itens = [];
  for (const c of dados.contas_fixas) {
    if (!c.ativa) continue;
    const doCartao = c.tipo === 'assinatura' || c.tipo === 'fatura_uber';
    // Conta do cartão vence junto com a fatura
    const dia = doCartao ? venceCartao : c.dia;
    itens.push({
      id: `projetado-${c.id}`, mes, nome: comQuem(c.nome, c.quem), tipo: c.tipo === 'conta' ? 'conta_fixa' : c.tipo,
      valor_previsto: c.valor_previsto, valor_real: null,
      vencimento: dia ? dataNoMes(mes, dia) : null, categoria_id: c.categoria_id,
      conta_fixa_id: c.id, parcela_id: null, caixinha_id: c.caixinha_id ?? null,
      fatura_mes: doCartao ? mes : null, pago: false, ordem: c.ordem ?? 0, projetado: true,
    });
  }
  for (const p of dados.parcelas) {
    if (p.paga || mesDe(p.vencimento) !== mes) continue;
    const d = dados.dividas.find((x) => x.id === p.divida_id);
    if (!d || d.status === 'quitada') continue;
    // Categoria: a mesma que essa dívida usou no último plano; se não tiver, "Parcelas e dívidas"
    const anterior = dados.itens_mes
      .filter((i) => i.parcela_id && dados.parcelas.find((x) => x.id === i.parcela_id)?.divida_id === d.id)
      .sort((a, b) => b.mes.localeCompare(a.mes))[0];
    const nome = d.total_parcelas ? `${d.nome} ${p.numero}/${d.total_parcelas}` : d.nome;
    itens.push({
      id: `projetado-${p.id}`, mes, nome: comQuem(nome, d.credor), tipo: 'parcela',
      valor_previsto: p.valor, valor_real: null, vencimento: p.vencimento,
      categoria_id: anterior?.categoria_id ?? categoriaParcelas,
      conta_fixa_id: null, parcela_id: p.id, caixinha_id: null, fatura_mes: null,
      pago: false, ordem: 0, projetado: true,
    });
  }
  return itens;
}

export function projecao(dados, mesInicial, meses, hoje) {
  return Array.from({ length: meses }, (_, i) => {
    const mes = somarMeses(mesInicial, i);
    const { itens, projetado } = planoDoMes(dados, mes);
    const total = soma(itens, (item) => valorItem(item, dados, hoje));
    return { mes, total, sobra: dados.config.salario - total, projetado };
  });
}

// ---------- Virada e fechamento do mês ----------

// Mês que precisa ter o plano montado: o atual, se ainda não foi montado.
// O mês em que o controle começou fica de fora (ele foi importado do histórico).
export function mesSemPlano(dados, hoje) {
  const mes = mesDe(hoje);
  if (!dados.config || mes <= mesDe(dados.config.inicio_controle)) return null;
  return montado(dados, mes) ? null : mes;
}

// Linhas pra gravar o plano do mês (contas fixas ativas, parcelas, assinaturas, Uber e CDB).
// As avulsas que já existirem no mês ficam como estão.
export function itensDaVirada(dados, mes) {
  if (montado(dados, mes)) return [];
  return planoProjetado(dados, mes).sort(porVencimento).map((i, ordem) => ({
    mes, nome: i.nome, tipo: i.tipo, valor_previsto: i.valor_previsto, vencimento: i.vencimento,
    categoria_id: i.categoria_id ?? null, conta_fixa_id: i.conta_fixa_id, parcela_id: i.parcela_id,
    caixinha_id: i.caixinha_id, fatura_mes: i.fatura_mes, ordem,
  }));
}

// Limites do mês novo: copia os do último mês que tinha limite.
export function limitesDaVirada(dados, mes) {
  if (dados.limites.some((l) => l.mes === mes)) return [];
  const ultimo = dados.limites.map((l) => l.mes).filter((m) => m < mes).sort().at(-1);
  if (!ultimo) return [];
  return dados.limites
    .filter((l) => l.mes === ultimo)
    .map((l) => ({ mes, nome: l.nome, valor: l.valor, categorias: l.categorias }));
}

// Mês anterior que ainda não foi fechado (pra perguntar o que fazer com a sobra).
export function mesParaFechar(dados, hoje) {
  if (!dados.config) return null;
  const mes = somarMeses(mesDe(hoje), -1);
  if (mes < mesDe(dados.config.inicio_controle)) return null;
  if (dados.meses.some((m) => m.mes === mes && m.fechado_em)) return null;
  const ultimoDia = dataNoMes(mes, 31);
  return { mes, ultimoDia, sobra: resumoMes(dados, mes, ultimoDia).livre };
}

// ---------- Comprar ----------

export const ESFRIAR_HORAS = 48;

// Situação de um desejo: ainda esfriando? cabe no Livre agora? senão, em que mês cabe?
export function situacaoDesejo(desejo, dados, hoje, agora = Date.now()) {
  const liberaEm = Date.parse(desejo.created_at) + ESFRIAR_HORAS * 3600000;
  const mes = resumoMes(dados, mesDe(hoje), hoje);
  const gastosHoje = gastosDoDia(dados, hoje);
  const antes = quantoPossoGastar(mes.livre, gastosHoje, hoje).porDia;
  const preco = desejo.preco;
  const cabeAgora = preco != null && preco <= mes.livre;
  const depois = preco != null ? quantoPossoGastar(mes.livre - preco, gastosHoje, hoje).porDia : null;
  let quandoCabe = null;
  if (preco != null && !cabeAgora) {
    quandoCabe = projecao(dados, somarMeses(mesDe(hoje), 1), 12, hoje).find((p) => p.sobra >= preco) ?? null;
  }
  return { esfriando: agora < liberaEm, liberaEm, livre: mes.livre, cabeAgora, porDiaAntes: antes, porDiaDepois: depois, quandoCabe };
}

// ---------- Alertas da tela Hoje ----------

export function alertas(dados, hoje) {
  const lista = [];
  const mes = resumoMes(dados, mesDe(hoje), hoje);
  for (const item of mes.pendentes) {
    // Contas pagas junto com a fatura já aparecem no aviso da fatura
    if (!item.vencimento || TIPOS_DA_FATURA.includes(item.tipo)) continue;
    if (item.vencimento < hoje) lista.push({ tipo: 'atrasada', item });
    else if (item.vencimento <= somarDias(hoje, 3)) lista.push({ tipo: 'vence', item });
  }
  for (const limite of situacaoLimites(dados, mesDe(hoje))) {
    if (limite.cor !== 'verde') lista.push({ tipo: 'limite', limite });
  }
  // Compras no cartão fora do Uber não geram alerta: tem coisa que só dá pra pagar no cartão,
  // e elas já saem do Livre na hora (aparecem na fatura como "Outras").
  for (const f of faturasParaPagar(dados, hoje)) {
    if (f.vence <= somarDias(hoje, 3)) lista.push({ tipo: 'fatura', fatura: f });
  }
  for (const d of dados.dividas) {
    if (d.status !== 'quitada' && d.prazo && d.prazo >= hoje && d.prazo <= somarDias(hoje, 30)) {
      lista.push({ tipo: 'prazo', divida: d });
    }
  }
  return lista;
}
