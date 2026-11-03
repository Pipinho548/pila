// Banco de mentira pra testar o app sem Supabase (usado pelo tools/teste/servidor-teste.mjs). Mesma interface do js/db.js.
// Guarda tudo no localStorage desta origem de teste. ?reset=1 recomeça do zero.
import { ORDEM_IMPORTACAO } from './importar.js';

export const configurado = true;
export const supabase = null;

export const TABELAS = [
  'config', 'categorias', 'limites', 'caixinhas', 'contas_fixas', 'dividas', 'parcelas',
  'passos_divida', 'itens_mes', 'lancamentos', 'meses', 'desejos', 'a_receber', 'saldos_conferidos',
];

const CHAVE = 'banco-falso';
if (new URLSearchParams(location.search).has('reset')) localStorage.removeItem(CHAVE);
let banco = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') ?? Object.fromEntries(TABELAS.map((t) => [t, []]));
const salvar = () => localStorage.setItem(CHAVE, JSON.stringify(banco));
window.__banco = () => banco;

const semRede = () => {
  if (window.__offline) throw Object.assign(new Error('TypeError: Failed to fetch'), { code: '' });
};
const copia = (x) => JSON.parse(JSON.stringify(x));
let relogio = 0;
const agoraISO = () => new Date(Date.now() + (relogio++)).toISOString();

// Colunas com valor padrão no banco de verdade (o app conta com elas em quase toda tela)
const PADROES = {
  lancamentos: { item_mes_id: null, caixinha_id: null, fatura_mes: null, regra_cartao: null, antes_do_app: false, observacao: null, cliente_id: null, categoria_id: null, meio: null, descricao: null },
  itens_mes: { valor_real: null, vencimento: null, categoria_id: null, conta_fixa_id: null, parcela_id: null, caixinha_id: null, fatura_mes: null, pago: false, pago_em: null, observacao: null, ordem: 0 },
  config: { banco: 'C6', regras_de_ouro: null },
};

function completar(tabela, linha) {
  return { id: crypto.randomUUID(), user_id: 'u1', created_at: agoraISO(), ...(PADROES[tabela] ?? {}), ...copia(linha) };
}

export async function sessaoAtual() { return { user: { id: 'u1', email: 'teste@local' } }; }
export async function entrar() { return sessaoAtual(); }
export async function sair() {}
export function aoMudarSessao() {}

export async function carregarTudo() {
  semRede();
  const d = Object.fromEntries(TABELAS.map((t) => [t, copia(banco[t])]));
  d.config = d.config[0] ?? null;
  return d;
}

export async function inserir(tabela, linhas) {
  semRede();
  const novas = linhas.map((l) => completar(tabela, l));
  banco[tabela].push(...novas);
  salvar();
  return copia(novas);
}

export async function atualizar(tabela, id, campos) {
  semRede();
  const l = banco[tabela].find((x) => x.id === id);
  Object.assign(l, copia(campos));
  salvar();
  return copia(l);
}

export async function apagar(tabela, id) {
  semRede();
  banco[tabela] = banco[tabela].filter((x) => x.id !== id);
  salvar();
}

export async function apagarOnde(tabela, coluna, valor) {
  semRede();
  banco[tabela] = banco[tabela].filter((x) => x[coluna] !== valor);
  salvar();
}

export async function importarDados(montados) {
  await inserir('config', [montados.config]);
  for (const t of ORDEM_IMPORTACAO) if (montados[t]?.length) await inserir(t, montados[t]);
}

export async function salvarInscricao() { semRede(); }
export async function apagarInscricao() { semRede(); }
export async function avisoDeTeste() { semRede(); return { enviados: 1 }; }
export async function trocarSenha(nova) { semRede(); window.__senhaNova = nova; }

// IA de mentira: devolve o que estiver em window.__respostaIA (ou uma lista de exemplo)
export async function lerComIA(pedido) {
  semRede();
  window.__ultimoPedidoIA = pedido;
  return window.__respostaIA ?? {
    aviso: '',
    lancamentos: [
      { data: pedido.hoje, valor_centavos: 3200, descricao: 'Mercado', categoria: 'Mercado', meio: 'pix', tipo: 'gasto' },
      { data: pedido.hoje, valor_centavos: 1500, descricao: 'Uber', categoria: 'Transporte', meio: 'cartao', tipo: 'gasto' },
      { data: pedido.hoje, valor_centavos: 990, descricao: 'Lanche', categoria: '', meio: 'pix', tipo: 'gasto' },
    ],
  };
}
