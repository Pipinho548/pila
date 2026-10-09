// Extrato do C6 em PDF e OFX (números e nomes inventados)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerOFX, lerExtratoC6, limparDescricao, cidadesDoExtrato, meioDaTransacao, sugerirCategoria,
  aprenderCategorias, idDaTransacao, compararComApp, analisarExtrato, lancamentoDaTransacao,
} from '../js/extrato.js';

const OFX = `OFXHEADER: 100
DATA: OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20261102133809[-3:BRT]</DTPOSTED>
<TRNAMT>-129.78</TRNAMT>
<FITID>X1</FITID>
<REFNUM>1111</REFNUM>
<MEMO>TRANSF ENVIADA PIX</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20261101224612[-3:BRT]</DTPOSTED>
<TRNAMT>71.0</TRNAMT>
<FITID>X2</FITID>
<REFNUM>2222</REFNUM>
<MEMO>Pix recebido de Fulano de Tal</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20261103100000[-3:BRT]</DTPOSTED>
<TRNAMT>-18.46</TRNAMT>
<FITID>X3</FITID>
<REFNUM>3333</REFNUM>
<MEMO>SUPERMERCADO BOM PRECO  CIDADE NOVA   BRA</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20261103110000[-3:BRT]</DTPOSTED>
<TRNAMT>-500.0</TRNAMT>
<FITID>X4</FITID>
<REFNUM>4444</REFNUM>
<MEMO>undefined</MEMO>
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

// Linhas como o pdf.js tira do PDF do C6 (células da esquerda pra direita)
const celulas = (...textos) => textos.map((texto, i) => ({ x: [36, 95, 154, 235, 529][i] ?? 529, texto }));
const PDF = [
  celulas('Extrato exportado no dia 3 de dezembro de 2026 às 10:00'),
  [{ x: 45, texto: 'FULANO DE TAL' }, { x: 148, texto: '• 111.222.333-44' }],
  [{ x: 36, texto: 'Novembro 2026' }, { x: 98, texto: '( 01/11/2026 - 30/11/2026 )' }, { x: 421, texto: 'Entradas:' }],
  celulas('Data', 'Data', 'Tipo', 'Descrição', 'Valor'),
  celulas('lançamento', 'contábil'),
  celulas('01/11', '01/11', 'Entrada PIX', 'Pix recebido de FULANO DE TAL', 'R$ 1.000,00'),
  celulas('02/11', '03/11', 'Saída PIX', 'Pix enviado para PADARIA PAO BOM LTDA.', '-R$ 12,50'),
  celulas('02/11', '03/11', 'Débito de Cartão', 'MERCADO AZUL CIDADE NOVA BRA', '-R$ 40,00'),
  celulas('03/11', '03/11', 'Débito de Cartão', 'LOJA VERDE CIDADE NOVA BRA', '-R$ 25,00'),
  [{ x: 36, texto: 'Saldo do dia 03/11/26' }, { x: 529, texto: 'R$ 922,50' }],
  celulas('04/11', '04/11', 'Saída PIX', 'Pix enviado para MOTO TAXI RAPIDO S.A.', '-R$ 9,90'),
  celulas('04/11', '04/11', 'Devolução PIX', 'Devol recebida pix de MOTO TAXI RAPIDO S.A.', 'R$ 9,90'),
  celulas('04/11', '04/11', 'Saída PIX', 'Pix enviado para Fulano de Tal', '-R$ 50,00'),
  celulas('05/11', '05/11', 'Pagamento', 'PGTO FAT CARTAO C6', '-R$ 80,00'),
  celulas('05/11', '05/11', 'Saída PIX', 'Pix enviado para CICLANO BELTRANO', '-R$ 300,00'),
  celulas('05/11', '05/11', 'Saída PIX', 'Pix enviado para CICLANO BELTRANO', '-R$ 300,00'),
  celulas('06/11', '06/11', 'Saída PIX', 'Pix enviado para EMPRESA COM NOME MUITO GRANDE DE'),
  [{ x: 235, texto: 'SERVICOS GERAIS' }],
  [{ x: 36, texto: 'Saldo do dia 06/11/26' }, { x: 529, texto: 'R$ 182,60' }],
];
PDF.at(-3).push({ x: 529, texto: '-R$ 1,00' });

const categorias = [
  { id: 'c-merc', nome: 'Mercado' }, { id: 'c-com', nome: 'Comida fora' }, { id: 'c-trans', nome: 'Transporte' },
  { id: 'c-cont', nome: 'Contas e assinaturas' }, { id: 'c-casa', nome: 'Casa' }, { id: 'c-mor', nome: 'Moradia' },
];

const comIds = async (extrato) => {
  for (const t of extrato.transacoes) t.id = await idDaTransacao(t.ref);
  return extrato;
};

test('lê o OFX: data, valor em centavos, descrição e referência', () => {
  const { transacoes, origem } = lerOFX(OFX);
  assert.equal(origem, 'ofx');
  assert.equal(transacoes.length, 4);
  assert.deepEqual(transacoes[0], { ref: 'ofx:2222', data: '2026-11-01', valor: 7100, memo: 'Pix recebido de Fulano de Tal', tipoBanco: null });
  assert.equal(transacoes.find((t) => t.ref === 'ofx:1111').valor, -12978);
  assert.equal(transacoes.find((t) => t.ref === 'ofx:4444').valor, -50000);
  assert.equal(transacoes.find((t) => t.ref === 'ofx:4444').memo, null); // 'undefined' vira sem descrição
});

test('lê o PDF: ano do cabeçalho do mês, titular, saldo, descrição quebrada em duas linhas', () => {
  const e = lerExtratoC6(PDF);
  assert.equal(e.origem, 'pdf');
  assert.equal(e.titular, 'FULANO DE TAL');
  assert.deepEqual(e.saldo, { data: '2026-11-06', valor: 18260 });
  assert.deepEqual(e.saldos, { '2026-11-03': 92250, '2026-11-06': 18260 });
  assert.equal(e.transacoes.length, 11);
  assert.deepEqual(e.transacoes[1], {
    data: '2026-11-02', valor: -1250, tipoBanco: 'Saída PIX', memo: 'Pix enviado para PADARIA PAO BOM LTDA.',
    ref: 'pdf:2026-11-02|-1250|pix enviado para padaria pao bom ltda.|1',
  });
  assert.equal(e.transacoes.at(-1).memo, 'Pix enviado para EMPRESA COM NOME MUITO GRANDE DE SERVICOS GERAIS');
  // Dois Pix iguais no mesmo dia: referências diferentes
  const iguais = e.transacoes.filter((t) => t.valor === -30000);
  assert.notEqual(iguais[0].ref, iguais[1].ref);
});

test('descrição legível e meio de pagamento', () => {
  const { transacoes } = lerExtratoC6(PDF);
  const cidades = cidadesDoExtrato(transacoes);
  const desc = (memo, tipoBanco = null) => limparDescricao({ memo, tipoBanco }, cidades);
  assert.equal(desc('Pix enviado para PADARIA PAO BOM LTDA.'), 'Padaria Pao Bom');
  assert.equal(desc('Devol recebida pix de MOTO TAXI RAPIDO S.A.'), 'Moto Taxi Rapido');
  assert.equal(desc('MERCADO AZUL CIDADE NOVA BRA', 'Débito de Cartão'), 'Mercado Azul');     // cidade repetida em lojas diferentes
  assert.equal(desc('LOJA LONGE OUTRA CIDADE BRA', 'Débito de Cartão'), 'Loja Longe Outra Cidade'); // cidade que não se repete fica
  assert.equal(desc('SUPERMERCADO BOM PRECO  CIDADE NOVA   BRA'), 'Supermercado Bom Preco');  // OFX tem espaços
  assert.equal(desc('90000001Fulana          CIDADE       BRA'), 'Fulana');
  assert.equal(desc('VMT*LOJA X             CIDADE BRA'), 'Loja X');
  assert.equal(desc('Pix enviado para Ciclano Beltrano'), 'Ciclano Beltrano');
  assert.equal(desc('BOLETO FACIL PAGAMENTOS S A'), 'Boleto Facil Pagamentos');
  assert.equal(desc(null), 'Sem descrição');
  assert.equal(meioDaTransacao({ memo: 'TRANSF ENVIADA PIX' }), 'pix');
  assert.equal(meioDaTransacao({ memo: 'SUPERMERCADO BOM PRECO  CIDADE NOVA   BRA' }), 'debito');
  assert.equal(meioDaTransacao({ memo: 'MERCADO AZUL CIDADE NOVA BRA', tipoBanco: 'Débito de Cartão' }), 'debito');
  assert.equal(meioDaTransacao({ memo: 'BOLETO FACIL PAGAMENTOS S A', tipoBanco: 'Pagamento' }), 'boleto');
});

test('categoria: pelas palavras e pelo que já foi importado antes', () => {
  assert.equal(sugerirCategoria('SUPERMERCADO BOM PRECO  CIDADE', categorias), 'c-merc');
  assert.equal(sugerirCategoria('HAMBURGUERIA DO ZE', categorias), 'c-com');
  assert.equal(sugerirCategoria('Pix enviado para UBER DO BRASIL TECNOLOGIA LTDA.', categorias), 'c-trans');
  assert.equal(sugerirCategoria('Pix enviado para MERCADO LIVRE', categorias), 'c-casa'); // não é mercado
  assert.equal(sugerirCategoria('TRANSF ENVIADA PIX', categorias), null);
  const aprendido = aprenderCategorias([
    { observacao: 'C6: Pix enviado para CICLANO BELTRANO', categoria_id: 'c-casa' },
    { observacao: 'C6: Pix enviado para CICLANO BELTRANO', categoria_id: 'c-mor' }, // a mais recente vale
    { observacao: 'C6: TRANSF ENVIADA PIX', categoria_id: 'c-com' },                // genérica: não ensina
  ]);
  assert.equal(sugerirCategoria('Pix enviado para  Ciclano Beltrano', categorias, aprendido), 'c-mor');
  assert.equal(sugerirCategoria('TRANSF ENVIADA PIX', categorias, aprendido), null);
});

test('id fixo pela referência do banco', async () => {
  const a = await idDaTransacao('ofx:1111');
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a, await idDaTransacao('ofx:1111'));
  assert.notEqual(a, await idDaTransacao('ofx:2222'));
});

test('compara com o app: já importado, já lançado (com folga de dias), Pix lançado em duas partes, novo', async () => {
  const { transacoes } = await comIds(lerOFX(OFX));
  const lancamentos = [
    { id: 'a', data: '2026-11-04', valor: 1846, tipo: 'gasto', meio: 'debito' },          // 1 dia depois: bate
    { id: 'b', data: '2026-11-03', valor: 30000, tipo: 'deposito_caixinha', meio: null }, // 300 + 200 = 500 no mesmo dia
    { id: 'c', data: '2026-11-03', valor: 20000, tipo: 'gasto', meio: 'pix' },
    { id: 'd', data: '2026-11-02', valor: 12978, tipo: 'gasto', meio: 'cartao' },         // cartão não sai da conta: não bate
    { id: 'e', data: '2026-11-01', valor: 7100, tipo: 'entrada', cliente_id: transacoes.find((t) => t.ref === 'ofx:2222').id },
  ];
  const por = Object.fromEntries(compararComApp(transacoes, lancamentos).map((r) => [r.ref, r]));
  assert.equal(por['ofx:2222'].situacao, 'importada');
  assert.equal(por['ofx:3333'].situacao, 'no-app');
  assert.equal(por['ofx:4444'].situacao, 'no-app');
  assert.deepEqual(por['ofx:4444'].comQue.map((l) => l.id).sort(), ['b', 'c']);
  assert.equal(por['ofx:1111'].situacao, 'nova');
});

function dadosDeTeste() {
  return {
    categorias,
    lancamentos: [
      { id: 'x', data: '2026-11-02', valor: 4000, tipo: 'gasto', meio: 'debito', created_at: '2026-11-02T20:00:00Z' },
      { id: 'y', data: '2026-11-04', valor: 4000, tipo: 'gasto', meio: 'pix', observacao: 'C6: Pix enviado para EMPRESA COM NOME MUITO GRANDE DE SERVICOS GERAIS', categoria_id: 'c-cont', created_at: '2026-10-01T10:00:00Z' },
    ],
    itens_mes: [
      { id: 'i1', mes: '2026-11', nome: 'Aluguel', tipo: 'conta_fixa', valor_previsto: 30000, valor_real: null, pago: false, vencimento: '2026-11-05' },
      { id: 'i2', mes: '2026-11', nome: 'Luz', tipo: 'conta_fixa', valor_previsto: 1250, valor_real: null, pago: true, vencimento: '2026-11-02' },
    ],
    saldos_conferidos: [{ data: '2026-11-02', saldo: 100000, created_at: '2026-11-02T08:00:00Z' }],
  };
}

test('analisa o extrato: antigas, de fora, contas do plano, gastos com categoria e saldo', async () => {
  const dados = dadosDeTeste();
  const a = analisarExtrato(await comIds(lerExtratoC6(PDF)), dados);
  const por = (memo) => a.linhas.filter((r) => r.memo === memo);
  assert.equal(a.desde, '2026-11-02');
  assert.equal(a.de, '2026-11-01');
  assert.equal(a.ate, '2026-11-06');
  // Antes do saldo conferido
  assert.equal(por('Pix recebido de FULANO DE TAL')[0].situacao, 'antiga');
  // Já lançado
  assert.equal(por('MERCADO AZUL CIDADE NOVA BRA')[0].situacao, 'no-app');
  // Gasto novo com categoria e meio
  const loja = por('LOJA VERDE CIDADE NOVA BRA')[0];
  assert.equal(loja.situacao, 'nova');
  assert.equal(loja.descricao, 'Loja Verde');
  assert.deepEqual(loja.proposta, { tipo: 'gasto', marcada: true, categoria_id: null, meio: 'debito' });
  // A Padaria de 12,50 no dia 02 é do dia do saldo conferido: entra (pode ter sido depois da conferência)
  assert.equal(por('Pix enviado para PADARIA PAO BOM LTDA.')[0].situacao, 'nova');
  // Pix que voltou, transferência pra você mesmo, fatura: de fora
  assert.deepEqual(por('Pix enviado para MOTO TAXI RAPIDO S.A.').map((r) => r.motivo), ['Pix que voltou']);
  assert.deepEqual(por('Devol recebida pix de MOTO TAXI RAPIDO S.A.').map((r) => r.motivo), ['Pix que voltou']);
  assert.equal(por('Pix enviado para Fulano de Tal')[0].motivo, 'Transferência entre contas suas');
  assert.equal(por('PGTO FAT CARTAO C6')[0].situacao, 'fora');
  // Dois Pix de 300: o primeiro paga a conta do plano, o segundo vira gasto
  const [p1, p2] = por('Pix enviado para CICLANO BELTRANO');
  assert.deepEqual(p1.proposta, { tipo: 'conta', item_id: 'i1', nome: 'Aluguel', marcada: true, meio: 'pix' });
  assert.equal(p2.proposta.tipo, 'gasto');
  // Categoria aprendida de importação anterior
  const grande = por('Pix enviado para EMPRESA COM NOME MUITO GRANDE DE SERVICOS GERAIS')[0];
  assert.equal(grande.proposta.categoria_id, 'c-cont');
  // Saldo do banco no fim x o que o app espera (1000 - 40 do mercado já lançado; o lançamento 'y' é de dia 04)
  assert.deepEqual(a.saldo, { data: '2026-11-06', valor: 18260, esperado: 100000 - 4000 - 4000 });
});

test('saldo conferido igual ao saldo do fim do dia no banco: o dia todo já está nele', async () => {
  const dados = dadosDeTeste();
  dados.saldos_conferidos = [{ data: '2026-11-03', saldo: 92250, created_at: '2026-11-03T08:00:00Z' }];
  const a = analisarExtrato(await comIds(lerExtratoC6(PDF)), dados);
  assert.equal(a.diaFechado, true);
  assert.equal(a.linhas.find((r) => r.memo === 'LOJA VERDE CIDADE NOVA BRA').situacao, 'antiga');
  // Saldo diferente do banco: o dia fica aberto
  dados.saldos_conferidos[0].saldo = 90000;
  const b = analisarExtrato(await comIds(lerExtratoC6(PDF)), dados);
  assert.equal(b.linhas.find((r) => r.memo === 'LOJA VERDE CIDADE NOVA BRA').situacao, 'nova');
});

test('o que vai pro banco de dados', async () => {
  const a = analisarExtrato(await comIds(lerExtratoC6(PDF)), dadosDeTeste());
  const loja = a.linhas.find((r) => r.memo === 'LOJA VERDE CIDADE NOVA BRA');
  assert.deepEqual(lancamentoDaTransacao(loja, 'c-merc'), {
    cliente_id: loja.id, data: '2026-11-03', valor: 2500, descricao: 'Loja Verde',
    observacao: 'C6: LOJA VERDE CIDADE NOVA BRA', tipo: 'gasto', meio: 'debito', categoria_id: 'c-merc',
  });
  const entrou = { id: 'z', data: '2026-11-07', valor: 5000, memo: 'Pix recebido de ALGUEM', descricao: 'Alguem', proposta: { tipo: 'entrada', meio: 'pix' } };
  assert.equal(lancamentoDaTransacao(entrou, 'c-merc').tipo, 'entrada');
  assert.equal(lancamentoDaTransacao(entrou, 'c-merc').categoria_id, null);
});
