// Backup completo (JSON) e planilha do mês (CSV). Puro: só monta o texto.
import { mesDe, valorParaTexto } from './format.js';

const TIPOS = {
  gasto: 'Gasto', entrada: 'Entrada', deposito_caixinha: 'Guardado no CDB', resgate_caixinha: 'Resgate do CDB',
  pagamento_fatura: 'Pagamento de fatura', ajuste: 'Ajuste',
};
const MEIOS = { pix: 'Pix', debito: 'Débito', cartao: 'Cartão', boleto: 'Boleto', dinheiro: 'Dinheiro' };

export function backupJSON(dados, agora = new Date()) {
  return JSON.stringify({ app: 'pila', versao: 1, exportado_em: agora.toISOString(), tabelas: dados }, null, 2);
}

// Campo de CSV: aspas se tiver ; " ou quebra de linha
const campo = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV com ; (o Excel em português abre direto). Valores com vírgula: 12,50
export function csvDoMes(dados, mes) {
  const categorias = new Map(dados.categorias.map((c) => [c.id, c.nome]));
  const linhas = dados.lancamentos
    .filter((l) => mesDe(l.data) === mes)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((l) => [
      l.data.split('-').reverse().join('/'),
      l.descricao ?? '',
      categorias.get(l.categoria_id) ?? '',
      MEIOS[l.meio] ?? '',
      TIPOS[l.tipo] ?? l.tipo,
      valorParaTexto(l.valor),
      l.observacao ?? '',
    ].map(campo).join(';'));
  // ﻿ no começo: o Excel entende os acentos
  return `﻿${['Data;Descrição;Categoria;Meio;Tipo;Valor;Observação', ...linhas].join('\r\n')}\r\n`;
}
