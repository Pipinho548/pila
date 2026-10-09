// Tudo que fala com o Supabase fica aqui.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { ORDEM_IMPORTACAO } from './importar.js';

export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pila-auth' },
    })
  : null;

// ---------- Login ----------

export async function sessaoAtual() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function entrar(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data.session;
}

export async function sair() {
  if (supabase) await supabase.auth.signOut();
}

export function aoMudarSessao(callback) {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_evento, sessao) => callback(sessao));
}

// ---------- Dados ----------

export const TABELAS = [
  'config', 'categorias', 'limites', 'caixinhas', 'contas_fixas', 'dividas', 'parcelas',
  'passos_divida', 'itens_mes', 'lancamentos', 'meses', 'desejos', 'a_receber', 'saldos_conferidos',
];

// O Supabase devolve no máximo 1000 linhas por vez: busca em páginas.
async function buscarTabela(tabela) {
  const PAGINA = 1000;
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase.from(tabela).select('*').order('created_at').range(de, de + PAGINA - 1);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < PAGINA) return linhas;
  }
}

export async function carregarTudo() {
  const resultados = await Promise.all(TABELAS.map(buscarTabela));
  const dados = Object.fromEntries(TABELAS.map((t, i) => [t, resultados[i]]));
  dados.config = dados.config[0] ?? null;
  return dados;
}

export async function inserir(tabela, linhas) {
  const { data, error } = await supabase.from(tabela).insert(linhas).select();
  if (error) throw error;
  return data;
}

export async function atualizar(tabela, id, campos) {
  const { data, error } = await supabase.from(tabela).update(campos).eq('id', id).select();
  if (error) throw error;
  return data[0];
}

export async function apagarOnde(tabela, coluna, valor) {
  const { error } = await supabase.from(tabela).delete().eq(coluna, valor);
  if (error) throw error;
}

// ---------- Importar dados iniciais ----------

// Grava tudo na ordem certa. Só roda com a conta vazia.
// Se der erro no meio, apaga o que gravou pra não ficar pela metade.
export async function importarDados(montados) {
  const { count, error } = await supabase.from('config').select('id', { count: 'exact', head: true });
  if (error) throw error;
  if (count > 0) throw new Error('Os dados iniciais já foram importados.');

  const gravadas = [];
  try {
    await inserir('config', [montados.config]);
    gravadas.push('config');
    for (const tabela of ORDEM_IMPORTACAO) {
      if (!montados[tabela]?.length) continue;
      await inserir(tabela, montados[tabela]);
      gravadas.push(tabela);
    }
  } catch (erro) {
    for (const tabela of gravadas.reverse()) {
      await supabase.from(tabela).delete().not('id', 'is', null);
    }
    throw erro;
  }
}
