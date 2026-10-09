// Testes das regras com números inventados (os testes com dados reais ficam em privado/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diasNoMes, somarMeses, dataNoMes, somarDias, faturaDaCompra, fechamentoDaFatura,
  resumoCartao, reservadoFatura, corridasUber, valorItem, resumoMes, quantoPossoGastar,
  gastosDoDia, situacaoLimites, saldoCaixinha, efeitoNaConta, saldoEsperado, corDoLimite,
} from '../js/calc.js';

const base = () => ({
  config: { salario: 300000, dia_salario: 5, cartao_fecha_dia: 3, cartao_vence_dia: 10 },
  categorias: [{ id: 'c-mercado', nome: 'Mercado' }, { id: 'c-transporte', nome: 'Transporte' }, { id: 'c-lazer', nome: 'Lazer' }],
  itens_mes: [],
  lancamentos: [],
  caixinhas: [],
  saldos_conferidos: [],
  limites: [],
});

let n = 0;
const lanc = (campos) => ({
  id: `l${++n}`, tipo: 'gasto', meio: 'pix', item_mes_id: null, caixinha_id: null,
  regra_cartao: null, fatura_mes: null, antes_do_app: false, ...campos,
});

test('datas: dias no mês, somar meses e dias', () => {
  assert.equal(diasNoMes('2026-02'), 28);
  assert.equal(diasNoMes('2028-02'), 29);
  assert.equal(diasNoMes('2026-10'), 31);
  assert.equal(somarMeses('2026-12', 1), '2027-01');
  assert.equal(somarMeses('2027-01', -1), '2026-12');
  assert.equal(dataNoMes('2026-11', 31), '2026-11-30');
  assert.equal(somarDias('2026-10-30', 3), '2026-11-02');
});

test('fatura: fecha dia 03, vence dia 10', () => {
  assert.equal(faturaDaCompra('2026-11-03', 3, 10), '2026-11');
  assert.equal(faturaDaCompra('2026-11-04', 3, 10), '2026-12');
  assert.equal(faturaDaCompra('2026-11-05', 3, 10), '2026-12');
  assert.equal(faturaDaCompra('2026-12-20', 3, 10), '2027-01');
  assert.equal(fechamentoDaFatura('2026-12', 3, 10), '2026-12-03');
  // cartão que vence antes do fechamento: vence no mês seguinte
  assert.equal(faturaDaCompra('2026-11-10', 25, 5), '2026-12');
  assert.equal(faturaDaCompra('2026-11-26', 25, 5), '2027-01');
});

test('resumo do cartão separa uber, assinaturas e outras', () => {
  const r = resumoCartao([
    lanc({ meio: 'cartao', regra_cartao: 'uber', valor: 1000 }),
    lanc({ meio: 'cartao', regra_cartao: 'assinatura', valor: 2500 }),
    lanc({ meio: 'cartao', regra_cartao: 'outra', valor: 333 }),
    lanc({ meio: 'pix', valor: 9999 }),
  ]);
  assert.deepEqual(r, { uber: 1000, assinaturas: 2500, outras: 333, total: 3833 });
});

test('Livre = entradas que caíram - plano - gastos do dia a dia - depósitos + ajustes', () => {
  const d = base();
  d.itens_mes.push({ id: 'i1', mes: '2026-11', nome: 'Aluguel', tipo: 'conta_fixa', valor_previsto: 100000, valor_real: null, pago: false });
  d.itens_mes.push({ id: 'i2', mes: '2026-11', nome: 'Luz', tipo: 'conta_fixa', valor_previsto: 10000, valor_real: 8000, pago: true });
  d.lancamentos.push(
    lanc({ data: '2026-11-05', tipo: 'entrada', valor: 300000, descricao: 'Salário' }),
    lanc({ data: '2026-11-20', tipo: 'entrada', valor: 50000 }),                      // ainda não caiu
    lanc({ data: '2026-11-06', valor: 8000, item_mes_id: 'i2' }),                     // conta paga: conta pelo item
    lanc({ data: '2026-11-07', valor: 4550, categoria_id: 'c-mercado' }),
    lanc({ data: '2026-11-07', valor: 2000, meio: 'cartao', regra_cartao: 'uber' }),  // vai pra fatura
    lanc({ data: '2026-11-08', valor: 1000, meio: 'cartao', regra_cartao: 'outra' }), // sai do Livre na hora
    lanc({ data: '2026-11-01', valor: 5000, antes_do_app: true, meio: 'cartao', regra_cartao: 'outra' }),
    lanc({ data: '2026-11-09', tipo: 'deposito_caixinha', valor: 20000, meio: null }),
    lanc({ data: '2026-11-09', tipo: 'ajuste', valor: -150 }),
  );
  const m = resumoMes(d, '2026-11', '2026-11-10');
  assert.equal(m.entradas, 300000);
  assert.equal(m.plano, 108000);
  assert.equal(m.gastos, 5550);
  assert.equal(m.depositos, 20000);
  assert.equal(m.livre, 300000 - 108000 - 5550 - 20000 - 150);
  assert.equal(m.faltaPagar, 100000);
  assert.equal(m.proxima.nome, 'Aluguel');
  assert.equal(m.salarioCaiu, true);
});

test('fatura do Uber no plano: maior entre previsto e usado; quando fecha, vale o real', () => {
  const d = base();
  const item = { mes: '2026-12', tipo: 'fatura_uber', valor_previsto: 30000, valor_real: null, fatura_mes: '2026-12' };
  d.lancamentos.push(lanc({ data: '2026-11-10', valor: 1200, meio: 'cartao', regra_cartao: 'uber', fatura_mes: '2026-12' }));
  assert.equal(corridasUber(d.lancamentos, '2026-12'), 1200);
  assert.equal(valorItem(item, d, '2026-11-20'), 30000);
  assert.equal(valorItem(item, d, '2026-12-04'), 1200);
  d.lancamentos.push(lanc({ data: '2026-11-25', valor: 40000, meio: 'cartao', regra_cartao: 'uber', fatura_mes: '2026-12' }));
  assert.equal(valorItem(item, d, '2026-11-26'), 41200);
});

test('reservado pra fatura: só compras fora da regra de faturas não pagas', () => {
  const lancs = [
    lanc({ meio: 'cartao', regra_cartao: 'outra', valor: 1000, fatura_mes: '2026-11' }),
    lanc({ meio: 'cartao', regra_cartao: 'outra', valor: 500, fatura_mes: '2026-12' }),
    lanc({ meio: 'cartao', regra_cartao: 'uber', valor: 700, fatura_mes: '2026-12' }),
    lanc({ meio: 'cartao', regra_cartao: 'outra', valor: 900, fatura_mes: '2026-11', antes_do_app: true }),
  ];
  assert.equal(reservadoFatura(lancs), 1500);
  lancs.push(lanc({ tipo: 'pagamento_fatura', valor: 1000, fatura_mes: '2026-11', meio: null }));
  assert.equal(reservadoFatura(lancs), 500);
});

test('quanto posso gastar: por dia arredondado pra baixo, ainda dá hoje pode ficar negativo', () => {
  // dia 10 de um mês de 30 dias, Livre 1.000,00, nada gasto hoje
  let q = quantoPossoGastar(100000, 0, '2026-11-10');
  assert.equal(q.diasDepoisDeHoje, 20);
  assert.equal(q.porDia, 5000);
  assert.equal(q.orcamentoHoje, Math.floor(100000 / 21));
  // gastou 100,00 hoje
  q = quantoPossoGastar(90000, 10000, '2026-11-10');
  assert.equal(q.orcamentoHoje, 4761);
  assert.equal(q.aindaDaHoje, 4761 - 10000);
  assert.equal(q.porDia, 4500);
  // 3333 / 2 = 1666,5 -> 1666
  assert.equal(quantoPossoGastar(3333, 0, '2026-11-28').porDia, 1666);
  // último dia do mês: mostra o Livre inteiro
  assert.equal(quantoPossoGastar(12345, 0, '2026-11-30').porDia, 12345);
});

test('gastos do dia: só o que conta no Livre', () => {
  const d = base();
  d.lancamentos.push(
    lanc({ data: '2026-11-10', valor: 1000 }),
    lanc({ data: '2026-11-10', valor: 2000, meio: 'cartao', regra_cartao: 'uber' }),
    lanc({ data: '2026-11-10', valor: 3000, item_mes_id: 'x' }),
    lanc({ data: '2026-11-09', valor: 4000 }),
  );
  assert.equal(gastosDoDia(d, '2026-11-10'), 1000);
});

test('limites: soma várias categorias e muda de cor em 80% e 100%', () => {
  const d = base();
  d.limites.push({ mes: '2026-11', nome: 'Lazer + Mercado', valor: 10000, categorias: ['c-lazer', 'c-mercado'] });
  d.lancamentos.push(
    lanc({ data: '2026-11-02', valor: 5000, categoria_id: 'c-lazer' }),
    lanc({ data: '2026-11-03', valor: 3500, categoria_id: 'c-mercado' }),
    lanc({ data: '2026-11-03', valor: 9999, categoria_id: 'c-transporte' }),
  );
  const [l] = situacaoLimites(d, '2026-11');
  assert.equal(l.usado, 8500);
  assert.equal(l.cor, 'laranja');
  assert.equal(corDoLimite(7999, 10000), 'verde');
  assert.equal(corDoLimite(10001, 10000), 'vermelho');
});

test('caixinha: saldo inicial + depósitos - resgates', () => {
  const cx = { id: 'cx', saldo_inicial: 10000 };
  const lancs = [
    lanc({ tipo: 'deposito_caixinha', valor: 5000, caixinha_id: 'cx' }),
    lanc({ tipo: 'resgate_caixinha', valor: 2000, caixinha_id: 'cx' }),
    lanc({ tipo: 'deposito_caixinha', valor: 9999, caixinha_id: 'outra' }),
  ];
  assert.equal(saldoCaixinha(cx, lancs), 13000);
});

test('conferir saldo: cartão e dinheiro vivo não mexem na conta', () => {
  assert.equal(efeitoNaConta(lanc({ valor: 100, meio: 'pix' })), -100);
  assert.equal(efeitoNaConta(lanc({ valor: 100, meio: 'cartao' })), 0);
  assert.equal(efeitoNaConta(lanc({ valor: 100, meio: 'dinheiro' })), 0);
  assert.equal(efeitoNaConta(lanc({ valor: 100, tipo: 'deposito_caixinha', meio: null })), -100);
  assert.equal(efeitoNaConta(lanc({ valor: 100, tipo: 'resgate_caixinha', meio: null })), 100);
  assert.equal(efeitoNaConta(lanc({ valor: 100, tipo: 'ajuste', meio: null })), 0);

  const d = base();
  d.saldos_conferidos.push({ data: '2026-11-10', saldo: 50000, created_at: '2026-11-10T15:00:00Z' });
  d.lancamentos.push(
    lanc({ data: '2026-11-10', valor: 1000, created_at: '2026-11-10T14:00:00Z' }), // antes da conferência
    lanc({ data: '2026-11-10', valor: 2000, created_at: '2026-11-10T16:00:00Z' }), // depois
    lanc({ data: '2026-11-11', valor: 1500, meio: 'cartao', regra_cartao: 'uber' }),
    lanc({ data: '2026-11-11', tipo: 'entrada', valor: 10000 }),
  );
  assert.equal(saldoEsperado(d).esperado, 50000 - 2000 + 10000);
});
