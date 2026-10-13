// Conta nova: começar do zero e regras de ouro (valores inventados)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comecoDoZero, regrasDeOuro, CATEGORIAS_PADRAO } from '../js/importar.js';

test('começo do zero: config, categorias padrão e a Reserva', () => {
  const c = comecoDoZero({ salario: 250000, diaSalario: 5, fecha: 3, vence: 10, banco: ' Banco X ' }, '2026-11-01');
  assert.deepEqual(c.config, {
    salario: 250000, dia_salario: 5, cartao_fecha_dia: 3, cartao_vence_dia: 10, inicio_controle: '2026-11-01', banco: 'Banco X',
  });
  assert.equal(c.categorias.length, CATEGORIAS_PADRAO.length);
  assert.deepEqual(c.categorias[0], { nome: 'Moradia', icone: '🏠', ordem: 0 });
  assert.deepEqual(c.caixinhas, [{ nome: 'Reserva', saldo_inicial: 0, data_inicio: '2026-11-01', ordem: 0 }]);
  assert.equal(comecoDoZero({ salario: 0, diaSalario: 1, fecha: 1, vence: 1, banco: '' }, '2026-11-01').config.banco, 'C6');
});

test('começo do zero: tentativa que parou no meio não repete categoria nem Reserva', () => {
  const c = comecoDoZero({ salario: 1, diaSalario: 5, fecha: 3, vence: 10 }, '2026-11-01', {
    categorias: [{ nome: 'Moradia' }, { nome: 'Mercado' }], caixinhas: [{ nome: 'Reserva' }],
  });
  assert.equal(c.categorias.length, CATEGORIAS_PADRAO.length - 2);
  assert.ok(!c.categorias.some((x) => x.nome === 'Moradia'));
  assert.deepEqual(c.caixinhas, []);
});

test('começo do zero: dia fora de 1 a 31 e salário estranho não passam', () => {
  assert.throws(() => comecoDoZero({ salario: 1, diaSalario: 32, fecha: 3, vence: 10 }, '2026-11-01'), /Dia do salário/);
  assert.throws(() => comecoDoZero({ salario: -1, diaSalario: 5, fecha: 3, vence: 10 }, '2026-11-01'), /Salário/);
});

test('regras de ouro: uma por linha, sem linha vazia', () => {
  assert.deepEqual(regrasDeOuro({ regras_de_ouro: ' Primeiro as contas\n\nNada de parcelado novo \n' }), ['Primeiro as contas', 'Nada de parcelado novo']);
  assert.deepEqual(regrasDeOuro({}), []);
  assert.deepEqual(regrasDeOuro(null), []);
});
