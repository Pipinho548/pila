import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moeda, lerValor, hoje, mesDe, dataBR, dataCurta, nomeMes } from '../js/format.js';

// Intl usa espaço não separável depois do R$
const limpa = (s) => s.replace(/ /g, ' ');

test('moeda em reais', () => {
  assert.equal(limpa(moeda(123456)), 'R$ 1.234,56');
  assert.equal(limpa(moeda(0)), 'R$ 0,00');
  assert.equal(limpa(moeda(-3608)), '-R$ 36,08');
});

test('lerValor devolve centavos inteiros', () => {
  assert.equal(lerValor('12'), 1200);
  assert.equal(lerValor('12,5'), 1250);
  assert.equal(lerValor('53,50'), 5350);
  assert.equal(lerValor('1.234,56'), 123456);
  assert.equal(lerValor('R$ 99,90'), 9990);
  assert.equal(lerValor('12.50'), 1250);
  assert.equal(lerValor('0,01'), 1);
  assert.equal(lerValor(''), null);
  assert.equal(lerValor('abc'), null);
  assert.equal(lerValor('1,234'), null);
});

// Teste 10 da especificação
test('23h30 de 31/10/2026 em Brasília continua sendo 31/10, mês de outubro', () => {
  const agora = new Date('2026-11-01T02:30:00Z'); // = 31/10 23:30 em São Paulo
  assert.equal(hoje(agora), '2026-10-31');
  assert.equal(mesDe(hoje(agora)), '2026-10');
});

test('datas na tela', () => {
  assert.equal(dataBR('2026-10-08'), '08/10/2026');
  assert.equal(dataCurta('2026-10-08'), '08/10');
  assert.equal(nomeMes('2026-11'), 'novembro/26');
});
