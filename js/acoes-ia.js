// Lançar por frase ou print: manda pra IA, mostra a lista e lança o que você marcar.
import { inserir, lerComIA } from './db.js';
import { pedidoParaIA, propostasDaIA, lancamentoDaIA } from './ia.js';
import { semInternet } from './fila.js';
import { folhaIA, folhaIAResultado } from './telas-rotina.js';

// Print grande vira um JPEG menor antes de ir (a IA lê bem até ~1,15 megapixel e custa menos)
async function prepararPrint(arquivo) {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, Math.sqrt(1_150_000 / (bitmap.width * bitmap.height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return { tipo: 'image/jpeg', dados: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

export function criarIA(api) {
  const { estado, trocar, salvarCache, render, avisar, abrirFolha, fecharFolha, ctx, textoPorDia } = api;

  function abrir(texto = '', erro = '') {
    abrirFolha(folhaIA({ texto, erro }));
  }

  async function ler(form) {
    const erro = form.querySelector('.erro');
    const botao = form.querySelector('[type=submit]');
    const texto = form.elements.texto.value;
    const arquivo = form.elements.print.files[0] ?? null;
    erro.textContent = '';
    if (!texto.trim() && !arquivo) { erro.textContent = 'Escreve o gasto ou escolhe um print.'; return; }
    botao.disabled = true;
    botao.textContent = 'Lendo...';
    try {
      const imagem = arquivo ? await prepararPrint(arquivo) : null;
      const pedido = pedidoParaIA({ texto, imagem, hoje: ctx().hoje, categorias: estado.dados.categorias });
      const resposta = await lerComIA(pedido);
      estado.ia = { texto, ...propostasDaIA(resposta, estado.dados, ctx().hoje) };
      abrirFolha(folhaIAResultado(estado.ia, ctx()));
    } catch (e) {
      console.warn(e);
      erro.textContent = e.daFuncao ? e.message
        : semInternet(e) ? 'Sem internet. A IA precisa de internet.'
          : 'Não deu pra ler. Tenta de novo.';
      botao.disabled = false;
      botao.textContent = 'Ler';
    }
  }

  async function lancar(form) {
    const r = estado.ia;
    const erro = form.querySelector('.erro');
    const botao = form.querySelector('[type=submit]');
    erro.textContent = '';
    const marcadas = new Set(new FormData(form).getAll('usar'));
    const escolhidas = r.propostas.filter((p) => marcadas.has(p.id));
    if (!escolhidas.length) { erro.textContent = 'Marca pelo menos um.'; return; }
    const categoria = (p) => form.elements[`cat-${p.id}`]?.value || null;
    const semCategoria = escolhidas.filter((p) => p.tipo === 'gasto' && !categoria(p));
    if (semCategoria.length) {
      erro.textContent = semCategoria.length === 1
        ? `Escolhe a categoria de ${semCategoria[0].descricao}.`
        : `Faltam as categorias de ${semCategoria.length} gastos.`;
      form.elements[`cat-${semCategoria[0].id}`].focus();
      return;
    }
    botao.disabled = true;
    botao.textContent = 'Lançando...';
    try {
      const linhas = escolhidas.map((p) => lancamentoDaIA(p, categoria(p), estado.dados));
      for (const l of await inserir('lancamentos', linhas)) trocar('lancamentos', l);
      salvarCache();
    } catch (e) {
      console.warn(e);
      erro.textContent = semInternet(e) ? 'Sem internet. Tenta de novo quando voltar.' : 'Não deu pra lançar. Tenta de novo.';
      botao.disabled = false;
      botao.textContent = `Lançar ${escolhidas.length}`;
      return;
    }
    estado.ia = null;
    fecharFolha();
    render();
    avisar(`${escolhidas.length === 1 ? 'Lançado' : `${escolhidas.length} lançamentos entraram`}. ${textoPorDia()}`);
  }

  async function enviar(form) {
    if (form.id === 'form-ia') { await ler(form); return true; }
    if (form.id === 'form-ia-lancar') { await lancar(form); return true; }
    return false;
  }

  // Marcou ou desmarcou: atualiza o botão. Escolheu categoria: marca a linha. Escolheu print: mostra o nome.
  function mudou(e) {
    const form = e.target.form;
    if (form?.id === 'form-ia' && e.target.name === 'print') {
      if (e.target.files[0]) {
        form.querySelector('.ia-arquivo').textContent = 'Print escolhido';
        form.requestSubmit();
      }
      return;
    }
    if (form?.id !== 'form-ia-lancar') return;
    if (e.target.classList.contains('ext-cat') && e.target.value) {
      const marca = e.target.closest('.ext-linha')?.querySelector('[name="usar"]');
      if (marca) marca.checked = true;
    }
    const n = form.querySelectorAll('[name="usar"]:checked').length;
    form.querySelector('[type=submit]').textContent = n ? `Lançar ${n}` : 'Marca o que lançar';
  }

  function clique(acao) {
    if (acao !== 'ia-de-novo') return false;
    abrir(estado.ia?.texto ?? '');
    return true;
  }

  return { abrir, enviar, mudou, clique };
}
