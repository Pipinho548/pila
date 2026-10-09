// Tudo que fala com o Supabase fica aqui.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const configurado = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = configurado
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pila-auth' },
    })
  : null;

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
