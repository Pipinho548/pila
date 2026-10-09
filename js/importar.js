// Transforma o dados-iniciais.json em linhas prontas pras tabelas do Supabase.
// Puro: não fala com o banco. Os testes usam a mesma função.
//
// No arquivo, valores em reais como texto ("1.234,56") e referências por nome:
//   categoria: "Moradia"   caixinha: "reserva"   conta_fixa: "aluguel"   parcela: "emprestimo#3"

import { lerValor } from './format.js';
import { faturaDaCompra } from './calc.js';

const novoId = () => crypto.randomUUID();

function reais(valor, onde) {
  if (valor == null || valor === '') return null;
  const centavos = lerValor(valor);
  if (centavos == null) throw new Error(`Valor inválido em ${onde}: "${valor}"`);
  return centavos;
}

function buscar(mapa, chave, onde) {
  if (chave == null) return null;
  const id = mapa.get(chave);
  if (!id) throw new Error(`Não achei "${chave}" (${onde})`);
  return id;
}

export function montarDados(json) {
  if (json?.versao !== 1) throw new Error('Arquivo de dados iniciais inválido.');
  const d = {};

  d.config = {
    salario: reais(json.config.salario, 'config'),
    dia_salario: json.config.dia_salario,
    cartao_fecha_dia: json.config.cartao_fecha_dia,
    cartao_vence_dia: json.config.cartao_vence_dia,
    inicio_controle: json.config.inicio_controle,
  };
  const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = d.config;

  const categorias = new Map();
  d.categorias = json.categorias.map((c, i) => {
    const id = novoId();
    categorias.set(c.nome, id);
    return { id, nome: c.nome, icone: c.icone ?? null, cor: c.cor ?? null, ordem: i };
  });
  const cat = (nome, onde) => buscar(categorias, nome, onde);

  const caixinhas = new Map();
  d.caixinhas = (json.caixinhas ?? []).map((c, i) => {
    const id = novoId();
    caixinhas.set(c.ref, id);
    return {
      id, nome: c.nome, saldo_inicial: reais(c.saldo_inicial, c.nome) ?? 0,
      data_inicio: c.data_inicio, meta: reais(c.meta, c.nome), observacao: c.observacao ?? null, ordem: i,
    };
  });

  const contas = new Map();
  d.contas_fixas = (json.contas_fixas ?? []).map((c, i) => {
    const id = novoId();
    contas.set(c.ref, id);
    return {
      id, nome: c.nome, tipo: c.tipo ?? 'conta', valor_previsto: reais(c.valor_previsto, c.nome),
      dia: c.dia ?? null, categoria_id: cat(c.categoria, c.nome), meio: c.meio ?? null, quem: c.quem ?? null,
      caixinha_id: buscar(caixinhas, c.caixinha, c.nome), ativa: c.ativa ?? true,
      observacao: c.observacao ?? null, ordem: i,
    };
  });

  const parcelas = new Map();
  d.dividas = [];
  d.parcelas = [];
  d.passos_divida = [];
  (json.dividas ?? []).forEach((dv, i) => {
    const id = novoId();
    d.dividas.push({
      id, nome: dv.nome, credor: dv.credor ?? null, tipo: dv.tipo, status: dv.status,
      valor_original: reais(dv.valor_original, dv.nome), valor_negociado: reais(dv.valor_negociado, dv.nome),
      total_parcelas: dv.total_parcelas ?? null, pagas_antes: dv.pagas_antes ?? 0, prazo: dv.prazo ?? null,
      quitada_em: dv.quitada_em ?? null, observacoes: dv.observacoes ?? null, link: dv.link ?? null, ordem: i,
    });
    for (const p of dv.parcelas ?? []) {
      const pid = novoId();
      parcelas.set(`${dv.ref}#${p.numero}`, pid);
      d.parcelas.push({
        id: pid, divida_id: id, numero: p.numero, valor: reais(p.valor, dv.nome),
        vencimento: p.vencimento, paga: p.paga ?? false, paga_em: p.paga_em ?? null,
      });
    }
    (dv.passos ?? []).forEach((p, j) => {
      d.passos_divida.push({
        id: novoId(), divida_id: id, data: p.data ?? null, descricao: p.descricao, feito: p.feito ?? false, ordem: j,
      });
    });
  });

  d.itens_mes = (json.itens_mes ?? []).map((it, i) => ({
    id: novoId(), mes: it.mes, nome: it.nome, tipo: it.tipo,
    valor_previsto: reais(it.valor_previsto, it.nome), valor_real: reais(it.valor_real, it.nome),
    vencimento: it.vencimento ?? null, categoria_id: cat(it.categoria, it.nome),
    conta_fixa_id: buscar(contas, it.conta_fixa, it.nome), parcela_id: buscar(parcelas, it.parcela, it.nome),
    caixinha_id: buscar(caixinhas, it.caixinha, it.nome), fatura_mes: it.fatura_mes ?? null,
    pago: it.pago ?? false, pago_em: it.pago_em ?? null, observacao: it.observacao ?? null, ordem: i,
  }));

  d.lancamentos = (json.lancamentos ?? []).map((l) => {
    const cartao = l.meio === 'cartao';
    return {
      id: novoId(), data: l.data, valor: reais(l.valor, l.descricao), descricao: l.descricao ?? null,
      categoria_id: cat(l.categoria, l.descricao), meio: l.meio ?? null, tipo: l.tipo ?? 'gasto',
      item_mes_id: null, caixinha_id: buscar(caixinhas, l.caixinha, l.descricao),
      fatura_mes: cartao ? faturaDaCompra(l.data, fecha, vence) : null,
      regra_cartao: cartao ? (l.regra_cartao ?? 'outra') : null,
      antes_do_app: l.antes_do_app ?? false, observacao: l.observacao ?? null, cliente_id: novoId(),
    };
  });

  d.limites = (json.limites ?? []).map((l) => ({
    id: novoId(), mes: l.mes, nome: l.nome, valor: reais(l.valor, l.nome),
    categorias: l.categorias.map((nome) => cat(nome, l.nome)),
  }));

  d.desejos = (json.desejos ?? []).map((x) => ({
    id: novoId(), nome: x.nome, preco: reais(x.preco, x.nome), pra_quem: x.pra_quem ?? null, link: x.link ?? null,
    prioridade: x.prioridade ?? 2, plano: x.plano ?? null, parcelado: x.parcelado ?? false,
    observacao: x.observacao ?? null,
  }));

  d.a_receber = (json.a_receber ?? []).map((x) => ({
    id: novoId(), quem: x.quem, telefone: x.telefone ?? null, valor: reais(x.valor, x.quem),
    motivo: x.motivo ?? null, data: x.data ?? null,
  }));

  d.saldos_conferidos = (json.saldos_conferidos ?? []).map((s) => ({
    id: novoId(), data: s.data, saldo: reais(s.saldo, 'saldo conferido'), observacao: s.observacao ?? null,
  }));

  return d;
}

// Ordem de gravação no banco (quem é referenciado vem antes).
export const ORDEM_IMPORTACAO = [
  'categorias', 'caixinhas', 'contas_fixas', 'dividas', 'parcelas', 'passos_divida',
  'itens_mes', 'lancamentos', 'limites', 'desejos', 'a_receber', 'saldos_conferidos',
];
