// Fila de lançamentos feitos sem internet. Fica no celular até conseguir mandar pro Supabase.
const chave = (usuarioId) => `pila-fila-${usuarioId}`;

export function lerFila(usuarioId) {
  try { return JSON.parse(localStorage.getItem(chave(usuarioId))) ?? []; } catch { return []; }
}

function gravar(usuarioId, fila) {
  try { localStorage.setItem(chave(usuarioId), JSON.stringify(fila)); } catch { /* sem espaço: segue */ }
}

export function guardarNaFila(usuarioId, linha) {
  gravar(usuarioId, [...lerFila(usuarioId), linha]);
}

export function tirarDaFila(usuarioId, clienteId) {
  gravar(usuarioId, lerFila(usuarioId).filter((l) => l.cliente_id !== clienteId));
}

// Erro de rede (sem internet), não erro do banco
export function semInternet(erro) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /failed to fetch|load failed|networkerror|network request failed/i.test(erro?.message ?? '');
}
