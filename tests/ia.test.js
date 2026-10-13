// Lançar por frase ou print (números e nomes inventados)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pedidoParaIA, propostasDaIA, lancamentoDaIA } from '../js/ia.js';

const dados = () => ({
  config: { cartao_fecha_dia: 3, cartao_vence_dia: 10 },
  categorias: [{ id: 'c-merc', nome: 'Mercado' }, { id: 'c-trans', nome: 'Transporte' }, { id: 'c-com', nome: 'Comida fora' }],
  lancamentos: [
    { id: 'l1', data: '2026-11-07', valor: 1500, tipo: 'gasto', meio: 'cartao' },
    { id: 'l2', data: '2026-11-08', valor: 3200, tipo: 'gasto', meio: 'pix' },
  ],
});

test('pedido: frase limpa, nomes das categorias e o dia de hoje', () => {
  const p = pedidoParaIA({ texto: '  gastei 32 no mercado  ', hoje: '2026-11-08', categorias: dados().categorias });
  assert.deepEqual(p, { texto: 'gastei 32 no mercado', imagem: null, hoje: '2026-11-08', categorias: ['Mercado', 'Transporte', 'Comida fora'] });
});

test('propostas: categoria pelo nome, meio conferido, valor estranho fica de fora, já no app vem desmarcado', () => {
  const r = propostasDaIA({
    aviso: '',
    lancamentos: [
      { data: '2026-11-08', valor_centavos: 3200, descricao: 'Mercado', categoria: 'Mercado', meio: 'pix', tipo: 'gasto' },   // já no app (l2)
      { data: '2026-11-08', valor_centavos: 3200, descricao: 'Padaria', categoria: 'Mercado', meio: 'pix', tipo: 'gasto' },   // segundo igual: novo
      { data: '2026-11-06', valor_centavos: 1500, descricao: 'Uber', categoria: 'Transporte', meio: 'cartao', tipo: 'gasto' }, // já no app (l1)
      { data: 'ontem', valor_centavos: 990, descricao: 'Lanche', categoria: 'Inventada', meio: 'cheque', tipo: 'gasto' },
      { data: '2026-11-08', valor_centavos: -5, descricao: 'Errado', categoria: 'Mercado', meio: 'pix', tipo: 'gasto' },
      { data: '2026-11-08', valor_centavos: 10000, descricao: 'Fulano me pagou', categoria: '', meio: 'cartao', tipo: 'entrada' },
    ],
  }, dados(), '2026-11-08');
  assert.equal(r.descartadas, 1);
  const [mercado, padaria, uber, lanche, entrada] = r.propostas;
  assert.equal(mercado.noApp.id, 'l2');
  assert.equal(mercado.marcada, false);
  assert.equal(padaria.noApp, null);
  assert.equal(padaria.marcada, true);
  assert.equal(uber.noApp.id, 'l1');
  assert.deepEqual([lanche.data, lanche.meio, lanche.categoria_id], ['2026-11-08', 'pix', null]);
  assert.deepEqual([entrada.tipo, entrada.meio, entrada.categoria_id], ['entrada', 'pix', null]);
});

test('lançamento: cartão vai pra fatura; Transporte no cartão conta como Uber', () => {
  const d = dados();
  const uber = lancamentoDaIA({ data: '2026-11-04', valor: 1800, tipo: 'gasto', meio: 'cartao', descricao: 'Uber' }, 'c-trans', d);
  assert.equal(uber.fatura_mes, '2026-12');
  assert.equal(uber.regra_cartao, 'uber');
  const loja = lancamentoDaIA({ data: '2026-11-02', valor: 5000, tipo: 'gasto', meio: 'cartao', descricao: 'Loja' }, 'c-merc', d);
  assert.deepEqual([loja.fatura_mes, loja.regra_cartao], ['2026-11', 'outra']);
  const pix = lancamentoDaIA({ data: '2026-11-02', valor: 5000, tipo: 'gasto', meio: 'pix', descricao: 'Feira' }, 'c-merc', d);
  assert.deepEqual([pix.fatura_mes, pix.regra_cartao, pix.categoria_id], [null, null, 'c-merc']);
  assert.match(pix.cliente_id, /^[0-9a-f-]{36}$/);
});
