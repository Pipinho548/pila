// Virada de mês, fechar mês, Comprar, links e exportar (números inventados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesSemPlano, itensDaVirada, limitesDaVirada, mesParaFechar, situacaoDesejo } from '../js/calc.js';
import { lojaDoLink, nomeDoLink, mensagemCobranca, linkWhatsApp } from '../js/links.js';
import { csvDoMes, backupJSON } from '../js/exportar.js';

const base = () => ({
  config: { salario: 300000, dia_salario: 5, cartao_fecha_dia: 3, cartao_vence_dia: 10, inicio_controle: '2026-10-08' },
  categorias: [{ id: 'c-casa', nome: 'Casa' }, { id: 'c-parc', nome: 'Parcelas e dívidas' }, { id: 'c-lazer', nome: 'Lazer' }],
  contas_fixas: [
    { id: 'f1', nome: 'Aluguel', tipo: 'conta', valor_previsto: 100000, dia: 6, categoria_id: 'c-casa', quem: 'Ana', ativa: true, ordem: 0 },
    { id: 'f2', nome: 'Streaming', tipo: 'assinatura', valor_previsto: 4000, dia: 5, ativa: true, ordem: 1 },
    { id: 'f3', nome: 'Guardar', tipo: 'deposito', valor_previsto: 20000, dia: 5, caixinha_id: 'cx', ativa: true, ordem: 2 },
    { id: 'f4', nome: 'Velha', tipo: 'conta', valor_previsto: 999, ativa: false, ordem: 3 },
  ],
  dividas: [{ id: 'd1', nome: 'Moto', credor: 'Bia', status: 'ativa', pagas_antes: 0, total_parcelas: 3 }],
  parcelas: [
    { id: 'p1', divida_id: 'd1', numero: 1, valor: 15000, vencimento: '2026-11-05', paga: true },
    { id: 'p2', divida_id: 'd1', numero: 2, valor: 15000, vencimento: '2026-12-05', paga: false },
  ],
  itens_mes: [{ id: 'i1', mes: '2026-11', nome: 'Moto 1/3', tipo: 'parcela', valor_previsto: 15000, parcela_id: 'p1', categoria_id: 'c-lazer', pago: true }],
  lancamentos: [],
  limites: [
    { mes: '2026-10', nome: 'Velho', valor: 1, categorias: [] },
    { mes: '2026-11', nome: 'Lazer', valor: 30000, categorias: ['c-lazer'] },
  ],
  meses: [],
  caixinhas: [],
  saldos_conferidos: [],
});

test('virada: só monta mês sem plano e depois do mês de início', () => {
  const d = base();
  assert.equal(mesSemPlano(d, '2026-10-20'), null); // mês de início
  assert.equal(mesSemPlano(d, '2026-11-01'), null); // já tem plano
  assert.equal(mesSemPlano(d, '2026-12-01'), '2026-12');
});

test('virada: contas fixas ativas, assinatura na data da fatura, parcela com a categoria de antes', () => {
  const d = base();
  const itens = itensDaVirada(d, '2026-12');
  // por vencimento: dia 05, 05, 06 e a assinatura no dia 10 (vencimento da fatura)
  assert.deepEqual(itens.map((i) => i.nome), ['Moto 2/3 (Bia)', 'Guardar', 'Aluguel (Ana)', 'Streaming']);
  const porNome = Object.fromEntries(itens.map((i) => [i.nome, i]));
  assert.equal(porNome.Streaming.vencimento, '2026-12-10');
  assert.equal(porNome.Streaming.fatura_mes, '2026-12');
  assert.equal(porNome.Guardar.caixinha_id, 'cx');
  assert.equal(porNome['Moto 2/3 (Bia)'].parcela_id, 'p2');
  assert.equal(porNome['Moto 2/3 (Bia)'].categoria_id, 'c-lazer');
  assert.equal(porNome['Aluguel (Ana)'].conta_fixa_id, 'f1');
  assert.deepEqual(itensDaVirada(d, '2026-11'), []); // novembro já tem plano
});

test('virada: limites copiados do último mês que tinha', () => {
  const d = base();
  assert.deepEqual(limitesDaVirada(d, '2027-01'), [{ mes: '2027-01', nome: 'Lazer', valor: 30000, categorias: ['c-lazer'] }]);
  assert.deepEqual(limitesDaVirada(d, '2026-11'), []);
});

test('fechar mês: pergunta do mês anterior até ser fechado', () => {
  const d = base();
  d.lancamentos.push({ data: '2026-10-05', tipo: 'entrada', valor: 300000, descricao: 'Salário' });
  d.lancamentos.push({ data: '2026-10-06', tipo: 'gasto', valor: 100000, meio: 'pix' });
  assert.equal(mesParaFechar(d, '2026-10-20'), null); // mês anterior é antes do início
  assert.deepEqual(mesParaFechar(d, '2026-11-02'), { mes: '2026-10', ultimoDia: '2026-10-31', sobra: 200000 });
  d.meses.push({ mes: '2026-10', fechado_em: '2026-11-02T10:00:00Z' });
  assert.equal(mesParaFechar(d, '2026-11-02'), null);
});

test('comprar: esfria 2 dias, cabe agora ou diz em que mês cabe', () => {
  const d = base();
  d.lancamentos.push({ data: '2026-11-05', tipo: 'entrada', valor: 300000, descricao: 'Salário' });
  d.lancamentos.push({ data: '2026-11-06', tipo: 'gasto', valor: 200000, meio: 'pix' });
  // Livre de novembro: 3.000 - 150 (moto) - 2.000 = 850,00
  // Sobra prevista: dezembro 1.610,00 (ainda tem moto); janeiro 1.760,00
  const agora = Date.parse('2026-11-10T12:00:00Z');
  const barato = situacaoDesejo({ preco: 10000, created_at: '2026-11-09T12:00:00Z' }, d, '2026-11-10', agora);
  assert.equal(barato.esfriando, true);
  assert.equal(barato.cabeAgora, true);
  assert.ok(barato.porDiaDepois < barato.porDiaAntes);
  const pronto = situacaoDesejo({ preco: 10000, created_at: '2026-11-08T11:00:00Z' }, d, '2026-11-10', agora);
  assert.equal(pronto.esfriando, false);
  const caro = situacaoDesejo({ preco: 900000, created_at: '2026-11-01T00:00:00Z' }, d, '2026-11-10', agora);
  assert.equal(caro.cabeAgora, false);
  assert.equal(caro.quandoCabe, null); // nem a sobra de 12 meses de um mês só chega lá
  const medio = situacaoDesejo({ preco: 170000, created_at: '2026-11-01T00:00:00Z' }, d, '2026-11-10', agora);
  assert.equal(medio.cabeAgora, false);
  assert.equal(medio.quandoCabe.mes, '2027-01'); // dezembro ainda tem parcela da moto
});

test('links: loja e nome do produto', () => {
  assert.equal(lojaDoLink('https://www.amazon.com.br/Chaleira-El%C3%A9trica-Inox/dp/B0ABC'), 'Amazon');
  assert.equal(nomeDoLink('https://www.amazon.com.br/Chaleira-El%C3%A9trica-Inox/dp/B0ABC?ref=x'), 'Chaleira Elétrica Inox');
  assert.equal(nomeDoLink('https://amzn.to/3abc'), null);
  assert.equal(lojaDoLink('https://produto.mercadolivre.com.br/MLB-123456-tenis-corrida-azul-_JM'), 'Mercado Livre');
  assert.equal(nomeDoLink('https://produto.mercadolivre.com.br/MLB-123456-tenis-corrida-azul-_JM'), 'Tenis corrida azul');
  assert.equal(nomeDoLink('https://www.mercadolivre.com.br/tenis-corrida-azul/p/MLB999'), 'Tenis corrida azul');
  assert.equal(lojaDoLink('https://shopee.com.br/Camiseta-Dry-Fit-i.111.222'), 'Shopee');
  assert.equal(nomeDoLink('https://shopee.com.br/Camiseta-Dry-Fit-i.111.222'), 'Camiseta Dry Fit');
  assert.equal(lojaDoLink('não é link'), null);
});

test('whatsapp: mensagem educada e link com DDI', () => {
  const msg = mensagemCobranca({ quem: 'Carlos Souza', valor: 3700, motivo: 'almoço' });
  assert.match(msg, /^Oi, Carlos!/);
  assert.match(msg, /R\$\s37,00 \(almoço\)/);
  assert.equal(linkWhatsApp('(54) 99999-1234', 'oi'), 'https://wa.me/5554999991234?text=oi');
  assert.equal(linkWhatsApp('', 'oi tudo'), 'https://wa.me/?text=oi%20tudo');
});

test('exportar: CSV do mês com ; e vírgula; backup com todas as tabelas', () => {
  const d = base();
  d.lancamentos.push(
    { data: '2026-11-07', tipo: 'gasto', valor: 1250, meio: 'pix', categoria_id: 'c-casa', descricao: 'Vassoura; pá' },
    { data: '2026-12-01', tipo: 'gasto', valor: 1, meio: 'pix' },
  );
  const csv = csvDoMes(d, '2026-11');
  const linhas = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(linhas.length, 2);
  assert.equal(linhas[1], '07/11/2026;"Vassoura; pá";Casa;Pix;Gasto;12,50;');
  const json = JSON.parse(backupJSON(d, new Date('2026-11-10T00:00:00Z')));
  assert.equal(json.app, 'pila');
  assert.equal(json.tabelas.lancamentos.length, 2);
});

test('virada: conta avulsa adicionada antes do mês começar não impede a virada', () => {
  const d = base();
  d.itens_mes.push({ id: 'av', mes: '2026-12', nome: 'Carne', tipo: 'avulsa', valor_previsto: 25000, pago: false });
  assert.equal(mesSemPlano(d, '2026-12-01'), '2026-12');
  const itens = itensDaVirada(d, '2026-12');
  assert.equal(itens.length, 4);
  assert.ok(!itens.some((i) => i.nome === 'Carne')); // a avulsa já existe, não duplica
  d.itens_mes.push(...itens.map((i, n) => ({ ...i, id: `v${n}`, pago: false })));
  assert.equal(mesSemPlano(d, '2026-12-01'), null);
  assert.deepEqual(itensDaVirada(d, '2026-12'), []);
});
