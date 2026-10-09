// Importar o extrato do C6: lê o arquivo aqui no celular, mostra o que falta lançar
// e lança o que você marcar. O arquivo não vai pra lugar nenhum.
import { inserir } from './db.js';
import {
  lerOFX, lerExtratoC6, linhasDoPDF, idDaTransacao, analisarExtrato, lancamentoDaTransacao,
} from './extrato.js';
import { semInternet } from './fila.js';
import { folhaExtrato } from './telas-rotina.js';

// Leitor de PDF (só baixa quando você escolhe um PDF; depois fica guardado no celular)
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';

class Aviso extends Error {}

async function carregarPdfjs() {
  try {
    const pdfjs = await import(`${PDFJS}pdf.min.mjs`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
    return pdfjs;
  } catch (e) {
    console.warn(e);
    throw new Aviso('Não deu pra abrir o leitor de PDF. Confere a internet e tenta de novo.');
  }
}

async function lerPDF(arquivo) {
  const pdfjs = await carregarPdfjs();
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let senha;
  for (;;) {
    try {
      // O pdf.js fica com os bytes que recebe: manda uma cópia a cada tentativa
      return lerExtratoC6(await linhasDoPDF(pdfjs, bytes.slice(), senha));
    } catch (e) {
      if (e?.name !== 'PasswordException') throw e;
      senha = prompt(senha === undefined ? 'Esse PDF tem senha. Qual é?' : 'Senha errada. Tenta de novo:');
      if (!senha) throw new Aviso('Sem a senha não dá pra abrir esse PDF.');
    }
  }
}

export function criarExtrato(api) {
  const { estado, trocar, salvarCache, render, avisar, abrirFolha, fecharFolha, ctx, textoPorDia, pagarItem } = api;

  async function escolheu(arquivo, erro) {
    erro.textContent = '';
    try {
      avisar('Lendo o extrato...');
      const pdf = arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name);
      const extrato = pdf ? await lerPDF(arquivo) : lerOFX(await arquivo.text());
      if (!extrato.transacoes.length) throw new Aviso('Não achei transações nesse arquivo. É o extrato do C6 em PDF?');
      for (const t of extrato.transacoes) t.id = await idDaTransacao(t.ref);
      estado.extrato = analisarExtrato(extrato, estado.dados);
      abrirFolha(folhaExtrato(estado.extrato, ctx()));
    } catch (e) {
      console.warn(e);
      erro.textContent = e instanceof Aviso ? e.message : 'Não deu pra ler esse arquivo. É o extrato do C6 em PDF?';
    }
  }

  // Marcou ou desmarcou: atualiza o botão. Escolheu categoria: marca a linha.
  function mudou(e) {
    const form = e.target.form;
    if (form?.id !== 'form-extrato') return;
    if (e.target.classList.contains('ext-cat') && e.target.value) {
      const marca = e.target.closest('.ext-linha')?.querySelector('[name="usar"]');
      if (marca) marca.checked = true;
    }
    const n = form.querySelectorAll('[name="usar"]:checked').length;
    form.querySelector('[type=submit]').textContent = n ? `Lançar ${n}` : 'Marca o que lançar';
  }

  async function enviar(form) {
    const a = estado.extrato;
    const erro = form.querySelector('.erro');
    const botao = form.querySelector('[type=submit]');
    erro.textContent = '';
    const marcadas = new Set(new FormData(form).getAll('usar'));
    const escolhidas = a.linhas.filter((r) => r.situacao === 'nova' && marcadas.has(r.id));
    if (!escolhidas.length) { erro.textContent = 'Marca pelo menos uma.'; return; }
    const categoria = (r) => form.elements[`cat-${r.id}`]?.value || null;
    const semCategoria = escolhidas.filter((r) => r.proposta.tipo === 'gasto' && !categoria(r));
    if (semCategoria.length) {
      erro.textContent = semCategoria.length === 1
        ? `Escolhe a categoria de ${semCategoria[0].descricao}.`
        : `Faltam as categorias de ${semCategoria.length} gastos.`;
      form.elements[`cat-${semCategoria[0].id}`].focus();
      return;
    }

    const novos = escolhidas.filter((r) => r.proposta.tipo !== 'conta').map((r) => lancamentoDaTransacao(r, categoria(r)));
    const contas = escolhidas.filter((r) => r.proposta.tipo === 'conta');
    const texto = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Lançando...';
    try {
      if (novos.length) for (const l of await inserir('lancamentos', novos)) trocar('lancamentos', l);
      for (const r of contas) {
        const item = estado.dados.itens_mes.find((i) => i.id === r.proposta.item_id);
        await pagarItem(item, {
          valor: -r.valor, data: r.data, meio: r.proposta.meio,
          extra: { cliente_id: r.id, observacao: r.memo ? `C6: ${r.memo}` : null },
        });
      }
      salvarCache();
    } catch (e) {
      console.warn(e);
      erro.textContent = semInternet(e)
        ? 'Sem internet. O extrato precisa de internet pra lançar. Tenta de novo quando voltar.'
        : 'Não deu pra lançar tudo. Abre o extrato de novo: o que já entrou não repete.';
      botao.disabled = false;
      botao.textContent = texto;
      render();
      return;
    }
    estado.extrato = null;
    fecharFolha();
    render();
    const n = escolhidas.length;
    avisar(`${n === 1 ? '1 lançamento entrou' : `${n} lançamentos entraram`}. ${textoPorDia()}`);
  }

  return { escolheu, mudou, enviar };
}
