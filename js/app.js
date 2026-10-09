// Navegação, login e o que acontece em cada toque.
import {
  configurado, sessaoAtual, entrar, sair, aoMudarSessao,
  carregarTudo, inserir, atualizar, apagar, apagarOnde, importarDados,
} from './db.js';
import { hoje as hojeSP, mesDe, lerValor, moeda, dataCurta, esc } from './format.js';
import {
  faturaDaCompra, vencimentoDaFatura, resumoMes, gastosDoDia, quantoPossoGastar,
  saldoEsperado, somarMeses, detalheFatura, itensDaFatura, resumoDivida,
} from './calc.js';
import { montarDados } from './importar.js';
import * as telas from './telas.js';

const $ = (sel) => document.querySelector(sel);

const telaLogin = $('#tela-login');
const app = $('#app');
const conteudo = $('#conteudo');
const folhaLancar = $('#folha-lancar');
const formLancar = $('#form-lancar');
const folhaItem = $('#folha-item');
const folhaEditar = $('#folha-editar');
const folhaGeral = $('#folha-geral');

const estado = {
  usuario: null,
  dados: null,          // tudo do Supabase (ou do cache, se estiver sem internet)
  atualizadoEm: null,
  offline: false,
  mesVisto: null,       // mês aberto na aba Mês
  conferencia: null,    // resultado da última conferência de saldo
  itemAberto: null,
  lancamentoAberto: null,
};

// ---------- Service worker (PWA) ----------
if ('serviceWorker' in navigator) {
  // Chegou versão nova do app: recarrega uma vez pra usar ela.
  const tinhaVersao = Boolean(navigator.serviceWorker.controller);
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (tinhaVersao && !recarregou) { recarregou = true; location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW não registrou', e));
}

// ---------- Dados e cache (pra abrir sem internet) ----------
const chaveCache = () => `pila-dados-${estado.usuario.id}`;

function salvarCache() {
  try {
    localStorage.setItem(chaveCache(), JSON.stringify({ dados: estado.dados, em: estado.atualizadoEm }));
  } catch { /* sem espaço ou modo privado: segue sem cache */ }
}

function lerCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(chaveCache()));
    if (cache?.dados) { estado.dados = cache.dados; estado.atualizadoEm = cache.em; }
  } catch { /* cache estragado: ignora */ }
}

async function carregar() {
  try {
    estado.dados = await carregarTudo();
    estado.atualizadoEm = new Date().toISOString();
    estado.offline = false;
    salvarCache();
  } catch (e) {
    console.warn('Não deu pra buscar os dados', e);
    estado.offline = true;
  }
  render();
}

// Atualiza a lista local depois de gravar, sem buscar tudo de novo
function trocar(tabela, linha) {
  const lista = estado.dados[tabela];
  const i = lista.findIndex((x) => x.id === linha.id);
  if (i >= 0) lista[i] = linha; else lista.push(linha);
}

// ---------- Navegação ----------
const ROTAS = {
  hoje: telas.telaHoje,
  mes: telas.telaMes,
  dividas: telas.telaDividas,
  comprar: telas.telaComprar,
  mais: telas.telaMais,
  conferir: telas.telaConferir,
  fatura: telas.telaFatura,
  caixinhas: telas.telaCaixinhas,
};
const ABA_DA_ROTA = { conferir: 'mais', fatura: 'hoje', caixinhas: 'hoje' };

function rotaAtual() {
  const rota = location.hash.slice(1);
  return ROTAS[rota] ? rota : 'hoje';
}

function ctx() {
  return { ...estado, hoje: hojeSP() };
}

function render() {
  if (!estado.usuario) return;
  const rota = rotaAtual();
  estado.mesVisto ??= mesDe(hojeSP());
  conteudo.innerHTML = ROTAS[rota](ctx());
  const aba = ABA_DA_ROTA[rota] ?? rota;
  document.querySelectorAll('.abas a').forEach((a) => {
    if (a.dataset.aba === aba) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

window.addEventListener('hashchange', () => {
  estado.conferencia = null;
  render();
  window.scrollTo(0, 0);
});

// Voltou pro app (ex.: abriu de novo no iPhone): busca dados novos
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.usuario) carregar();
});

// ---------- Aviso rápido ----------
let timerAviso;
function avisar(texto, tipo = 'ok') {
  const el = $('#toast');
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { el.hidden = true; }, 3500);
}

function porDiaAgora() {
  const hoje = hojeSP();
  const mes = resumoMes(estado.dados, mesDe(hoje), hoje);
  return quantoPossoGastar(mes.livre, gastosDoDia(estado.dados, hoje), hoje);
}

// ---------- Toques nas telas ----------
conteudo.addEventListener('click', async (e) => {
  const alvo = e.target.closest('[data-acao]');
  if (!alvo) return;
  const acao = alvo.dataset.acao;

  if (acao === 'sair') {
    try { localStorage.removeItem(chaveCache()); } catch { /* ok */ }
    await sair();
  } else if (acao === 'mes-anterior' || acao === 'mes-seguinte') {
    estado.mesVisto = somarMeses(estado.mesVisto, acao === 'mes-anterior' ? -1 : 1);
    render();
  } else if (acao === 'abrir-item') {
    abrirItem(alvo.dataset.id);
  } else if (acao === 'abrir-lancamento') {
    abrirLancamento(alvo.dataset.id);
  } else if (acao === 'ir-mes') {
    estado.mesVisto = alvo.dataset.mes;
    render();
    window.scrollTo(0, 0);
  } else if (acao === 'abrir-pagar-fatura') {
    abrirFolha(telas.folhaPagarFatura(detalheFatura(estado.dados, alvo.dataset.mes, hojeSP()), ctx()));
  } else if (acao === 'abrir-caixinha') {
    const caixinha = estado.dados.caixinhas.find((c) => c.id === alvo.dataset.id);
    abrirFolha(telas.folhaCaixinha(caixinha, alvo.dataset.tipo, ctx()));
  } else if (acao === 'passo') {
    await marcarPasso(alvo);
  } else if (acao === 'confirmar-salario') {
    await confirmarSalario(alvo);
  } else if (acao === 'ajustar') {
    await ajustarSaldo(alvo);
  } else if (acao === 'cancelar-conferencia') {
    estado.conferencia = null;
    render();
  }
});

conteudo.addEventListener('submit', async (e) => {
  if (e.target.id === 'form-conferir') {
    e.preventDefault();
    await conferirSaldo(e.target);
  }
});

conteudo.addEventListener('change', async (e) => {
  if (e.target.id === 'arquivo-importar' && e.target.files[0]) {
    await importarArquivo(e.target.files[0]);
    e.target.value = '';
  }
});

async function ocupado(botao, texto, tarefa) {
  const original = botao.textContent;
  botao.disabled = true;
  botao.textContent = texto;
  try { return await tarefa(); } finally { botao.disabled = false; botao.textContent = original; }
}

const ERRO_REDE = 'Não deu pra salvar. Confere a internet e tenta de novo.';

async function confirmarSalario(botao) {
  try {
    await ocupado(botao, 'Salvando...', async () => {
      const [l] = await inserir('lancamentos', [{
        cliente_id: crypto.randomUUID(), data: hojeSP(), valor: estado.dados.config.salario,
        tipo: 'entrada', descricao: 'Salário',
      }]);
      trocar('lancamentos', l);
      salvarCache();
    });
    render();
    avisar(`Salário lançado. Daqui pra frente: ${moeda(porDiaAgora().porDia)} por dia`);
  } catch (e) {
    console.warn(e);
    avisar(ERRO_REDE, 'erro');
  }
}

// ---------- Lançar gasto ----------
const categoria = (id) => estado.dados.categorias.find((c) => c.id === id);

$('#btn-lancar').addEventListener('click', () => {
  if (!estado.dados?.config) {
    avisar('Importa os dados iniciais primeiro (aba Mais).', 'erro');
    return;
  }
  prepararLancar();
  folhaLancar.showModal();
  formLancar.elements.valor.focus();
});

function prepararLancar() {
  formLancar.reset();
  formLancar.elements.data.value = hojeSP();
  $('#lancar-erro').textContent = '';
  // Categorias mais usadas primeiro
  const uso = new Map();
  for (const l of estado.dados.lancamentos) {
    if (l.tipo === 'gasto' && l.categoria_id) uso.set(l.categoria_id, (uso.get(l.categoria_id) ?? 0) + 1);
  }
  const lista = [...estado.dados.categorias]
    .sort((a, b) => (uso.get(b.id) ?? 0) - (uso.get(a.id) ?? 0) || a.ordem - b.ordem);
  $('#lancar-categorias').innerHTML = lista.map((c) => `
    <label class="chip"><input type="radio" name="categoria" value="${c.id}"><span>${esc(c.icone ?? '')} ${esc(c.nome)}</span></label>`).join('');
  atualizarDica();
}

function atualizarDica() {
  const f = formLancar.elements;
  const dica = $('#lancar-dica');
  if (f.meio.value !== 'cartao') { dica.hidden = true; return; }
  const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = estado.dados.config;
  const fatura = faturaDaCompra(f.data.value || hojeSP(), fecha, vence);
  const quando = dataCurta(vencimentoDaFatura(fatura, vence));
  const ehUber = categoria(f.categoria.value)?.nome === 'Transporte';
  dica.hidden = false;
  dica.classList.toggle('aviso-cartao', !ehUber);
  dica.textContent = ehUber
    ? `Uber no cartão: vai pra fatura de ${quando} e entra no plano desse mês. Não mexe no seu Livre de hoje.`
    : `Cartão é só pra Uber e assinatura. Essa compra sai do seu Livre agora e fica reservada pra fatura de ${quando}.`;
}

formLancar.addEventListener('change', atualizarDica);

folhaLancar.addEventListener('click', (e) => {
  if (e.target === folhaLancar || e.target.closest('[data-fechar]')) folhaLancar.close();
});

formLancar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = formLancar.elements;
  const erro = $('#lancar-erro');
  const valor = lerValor(f.valor.value);
  if (!valor || valor <= 0) { erro.textContent = 'Digita o valor.'; f.valor.focus(); return; }
  const cat = categoria(f.categoria.value);
  if (!cat) { erro.textContent = 'Escolhe uma categoria.'; return; }

  const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = estado.dados.config;
  const meio = f.meio.value || 'pix';
  const data = f.data.value || hojeSP();
  const cartao = meio === 'cartao';
  const linha = {
    cliente_id: crypto.randomUUID(),
    data,
    valor,
    descricao: f.descricao.value.trim() || null,
    categoria_id: cat.id,
    meio,
    tipo: 'gasto',
    fatura_mes: cartao ? faturaDaCompra(data, fecha, vence) : null,
    regra_cartao: cartao ? (cat.nome === 'Transporte' ? 'uber' : 'outra') : null,
  };

  erro.textContent = '';
  try {
    await ocupado(formLancar.querySelector('[type=submit]'), 'Lançando...', async () => {
      const [nova] = await inserir('lancamentos', [linha]);
      trocar('lancamentos', nova);
      salvarCache();
    });
    folhaLancar.close();
    render();
    avisar(`Lançado. Daqui pra frente: ${moeda(porDiaAgora().porDia)} por dia`);
  } catch (err) {
    console.warn(err);
    erro.textContent = ERRO_REDE;
  }
});

// ---------- Contas do mês (marcar como pago) ----------
function abrirItem(id) {
  const item = estado.dados.itens_mes.find((i) => i.id === id);
  if (!item) return;
  estado.itemAberto = item;
  folhaItem.innerHTML = telas.folhaItem(item, ctx());
  folhaItem.showModal();
}

folhaItem.addEventListener('click', async (e) => {
  if (e.target === folhaItem || e.target.closest('[data-fechar]')) { folhaItem.close(); return; }
  const alvo = e.target.closest('[data-acao]');
  if (!alvo) return;
  const item = estado.itemAberto;
  try {
    if (alvo.dataset.acao === 'desmarcar-item') {
      await ocupado(alvo, 'Desmarcando...', () => desmarcarItem(item));
      folhaItem.close();
      render();
      avisar('Pagamento desmarcado.');
    } else if (alvo.dataset.acao === 'mudar-valor') {
      const form = folhaItem.querySelector('#form-item');
      const valor = lerValor(form.elements.valor.value);
      if (valor == null || valor < 0) { form.querySelector('.erro').textContent = 'Valor inválido.'; return; }
      await ocupado(alvo, 'Salvando...', async () => {
        trocar('itens_mes', await atualizar('itens_mes', item.id, { valor_real: valor }));
        salvarCache();
      });
      folhaItem.close();
      render();
      avisar(`Valor atualizado: ${moeda(valor)}`);
    }
  } catch (err) {
    console.warn(err);
    avisar(ERRO_REDE, 'erro');
  }
});

folhaItem.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const item = estado.itemAberto;
  const valor = lerValor(form.elements.valor.value);
  if (valor == null || valor < 0) { form.querySelector('.erro').textContent = 'Valor inválido.'; return; }
  try {
    const quitou = await ocupado(form.querySelector('[type=submit]'), 'Salvando...', () => pagarItem(item, form, valor));
    folhaItem.close();
    render();
    if (quitou) avisar(`🎉 Acabou! ${quitou} quitado. Esse dinheiro agora sobra todo mês.`);
    else avisar(item.tipo === 'deposito' ? 'Guardado.' : 'Pago.');
  } catch (err) {
    console.warn(err);
    form.querySelector('.erro').textContent = ERRO_REDE;
  }
});

async function pagarItem(item, form, valor) {
  const data = form.elements.data.value || hojeSP();
  const deposito = item.tipo === 'deposito';
  // Pagar cria um lançamento, pra entrar na conferência com o banco
  if (valor > 0) {
    const [l] = await inserir('lancamentos', [{
      cliente_id: crypto.randomUUID(), data, valor, descricao: item.nome, categoria_id: item.categoria_id,
      meio: deposito ? null : form.elements.meio.value, tipo: deposito ? 'deposito_caixinha' : 'gasto',
      item_mes_id: item.id, caixinha_id: item.caixinha_id,
    }]);
    trocar('lancamentos', l);
  }
  trocar('itens_mes', await atualizar('itens_mes', item.id, { pago: true, pago_em: data, valor_real: valor }));
  let quitou = null;
  if (item.parcela_id) {
    const parcela = await atualizar('parcelas', item.parcela_id, { paga: true, paga_em: data });
    trocar('parcelas', parcela);
    quitou = await verificarQuitacao(parcela.divida_id, data);
  }
  salvarCache();
  return quitou;
}

// Pagou a última parcela: a dívida vira "quitada". Devolve o nome pra comemorar.
async function verificarQuitacao(dividaId, data) {
  const divida = estado.dados.dividas.find((d) => d.id === dividaId);
  if (!divida || divida.status === 'quitada') return null;
  const r = resumoDivida(divida, estado.dados.parcelas);
  if (r.pendentes.length || (divida.total_parcelas && r.pagas < divida.total_parcelas)) return null;
  trocar('dividas', await atualizar('dividas', divida.id, { status: 'quitada', quitada_em: data }));
  return divida.nome;
}

async function desmarcarItem(item) {
  await apagarOnde('lancamentos', 'item_mes_id', item.id);
  estado.dados.lancamentos = estado.dados.lancamentos.filter((l) => l.item_mes_id !== item.id);
  trocar('itens_mes', await atualizar('itens_mes', item.id, { pago: false, pago_em: null }));
  if (item.parcela_id) {
    const parcela = await atualizar('parcelas', item.parcela_id, { paga: false, paga_em: null });
    trocar('parcelas', parcela);
    // Se tinha quitado por causa dessa parcela, volta a ser ativa
    const divida = estado.dados.dividas.find((d) => d.id === parcela.divida_id);
    if (divida?.status === 'quitada') {
      trocar('dividas', await atualizar('dividas', divida.id, { status: 'ativa', quitada_em: null }));
    }
  }
  salvarCache();
}

// ---------- Folha geral: pagar fatura, guardar e resgatar ----------
function abrirFolha(html) {
  folhaGeral.innerHTML = html;
  folhaGeral.showModal();
}

folhaGeral.addEventListener('click', (e) => {
  if (e.target === folhaGeral || e.target.closest('[data-fechar]')) folhaGeral.close();
});

folhaGeral.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const erro = form.querySelector('.erro');
  const valor = lerValor(form.elements.valor.value);
  if (!valor || valor <= 0) { erro.textContent = 'Valor inválido.'; return; }
  try {
    let mensagem;
    await ocupado(form.querySelector('[type=submit]'), 'Salvando...', async () => {
      if (form.id === 'form-fatura') mensagem = await pagarFatura(form.dataset.mes, valor, form.elements.data.value || hojeSP());
      else if (form.id === 'form-caixinha') mensagem = await movimentarCaixinha(form, valor);
    });
    folhaGeral.close();
    render();
    avisar(mensagem);
  } catch (err) {
    console.warn(err);
    erro.textContent = ERRO_REDE;
  }
});

// Pagar a fatura não é gasto novo: sai da conta, mas o Livre já contou cada parte
// (Uber, assinaturas e compras antigas pelo plano; o resto pelo "Reservado pra fatura").
async function pagarFatura(faturaMes, valor, data) {
  const f = detalheFatura(estado.dados, faturaMes, hojeSP());
  const quando = dataCurta(f.vence);
  const novos = [{
    cliente_id: crypto.randomUUID(), data, valor, tipo: 'pagamento_fatura', fatura_mes: faturaMes,
    descricao: `Fatura C6 de ${quando}`,
  }];
  const diferenca = f.total - valor; // banco cobrou mais: diferença negativa, o Livre cai
  if (diferenca !== 0) {
    novos.push({
      cliente_id: crypto.randomUUID(), data, valor: diferenca, tipo: 'ajuste', fatura_mes: faturaMes,
      descricao: `Diferença da fatura de ${quando}`,
      observacao: `Banco cobrou ${moeda(valor)}, o app esperava ${moeda(f.total)}`,
    });
  }
  for (const l of await inserir('lancamentos', novos)) trocar('lancamentos', l);

  // As contas do plano que eram dessa fatura ficam pagas, com o valor de verdade
  for (const item of itensDaFatura(estado.dados, faturaMes)) {
    const real = item.tipo === 'fatura_uber' ? f.origem.uber : (item.valor_real ?? item.valor_previsto);
    trocar('itens_mes', await atualizar('itens_mes', item.id, { pago: true, pago_em: data, valor_real: real }));
  }
  salvarCache();
  return diferenca === 0
    ? `Fatura de ${quando} paga.`
    : `Fatura paga. A diferença de ${moeda(Math.abs(diferenca))} entrou como ajuste.`;
}

// Apagar o pagamento da fatura: some o pagamento, o ajuste da diferença e as contas voltam a "não paga"
async function desfazerPagamentoFatura(faturaMes) {
  const daFatura = estado.dados.lancamentos.filter((l) =>
    l.fatura_mes === faturaMes && (l.tipo === 'pagamento_fatura' || l.tipo === 'ajuste'));
  for (const l of daFatura) await apagar('lancamentos', l.id);
  estado.dados.lancamentos = estado.dados.lancamentos.filter((l) => !daFatura.includes(l));
  for (const item of itensDaFatura(estado.dados, faturaMes)) {
    const campos = { pago: false, pago_em: null };
    if (item.tipo === 'fatura_uber') campos.valor_real = null; // volta a valer o previsto até fechar
    trocar('itens_mes', await atualizar('itens_mes', item.id, campos));
  }
}

async function movimentarCaixinha(form, valor) {
  const tipo = form.dataset.tipo;
  const [l] = await inserir('lancamentos', [{
    cliente_id: crypto.randomUUID(), data: form.elements.data.value || hojeSP(), valor, tipo,
    caixinha_id: form.dataset.id,
    descricao: form.elements.descricao.value.trim() || (tipo === 'deposito_caixinha' ? 'Guardar no CDB' : 'Resgate do CDB'),
  }]);
  trocar('lancamentos', l);
  salvarCache();
  return `${tipo === 'deposito_caixinha' ? 'Guardado' : 'Resgatado'}. Daqui pra frente: ${moeda(porDiaAgora().porDia)} por dia`;
}

async function marcarPasso(botao) {
  const passo = estado.dados.passos_divida.find((p) => p.id === botao.dataset.id);
  try {
    trocar('passos_divida', await atualizar('passos_divida', passo.id, { feito: !passo.feito }));
    salvarCache();
    render();
  } catch (err) {
    console.warn(err);
    avisar(ERRO_REDE, 'erro');
  }
}

// ---------- Editar ou apagar lançamento ----------
function abrirLancamento(id) {
  const l = estado.dados.lancamentos.find((x) => x.id === id);
  if (!l) return;
  estado.lancamentoAberto = l;
  folhaEditar.innerHTML = telas.folhaLancamento(l, ctx());
  folhaEditar.showModal();
}

folhaEditar.addEventListener('click', async (e) => {
  if (e.target === folhaEditar || e.target.closest('[data-fechar]')) { folhaEditar.close(); return; }
  const alvo = e.target.closest('[data-acao="apagar-lancamento"]');
  if (!alvo) return;
  const l = estado.lancamentoAberto;
  if (!confirm(`Apagar "${l.descricao || 'lançamento'}" de ${moeda(Math.abs(l.valor))}?`)) return;
  try {
    await ocupado(alvo, 'Apagando...', async () => {
      if (l.tipo === 'pagamento_fatura') await desfazerPagamentoFatura(l.fatura_mes);
      else await apagar('lancamentos', l.id);
      estado.dados.lancamentos = estado.dados.lancamentos.filter((x) => x.id !== l.id);
      salvarCache();
    });
    folhaEditar.close();
    render();
    avisar(`Apagado. Daqui pra frente: ${moeda(porDiaAgora().porDia)} por dia`);
  } catch (err) {
    console.warn(err);
    avisar(ERRO_REDE, 'erro');
  }
});

folhaEditar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = form.elements;
  const l = estado.lancamentoAberto;
  const erro = form.querySelector('.erro');
  const valor = lerValor(f.valor.value);
  // Só o ajuste pode ser negativo
  if (!valor || (valor < 0 && l.tipo !== 'ajuste')) { erro.textContent = 'Valor inválido.'; return; }

  const campos = { valor, data: f.data.value || l.data, descricao: f.descricao.value.trim() || null };
  if (f.categoria) {
    const cat = categoria(f.categoria.value);
    const meio = f.meio.value || 'pix';
    const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = estado.dados.config;
    campos.categoria_id = cat.id;
    campos.meio = meio;
    if (meio === 'cartao') {
      campos.fatura_mes = faturaDaCompra(campos.data, fecha, vence);
      campos.regra_cartao = l.regra_cartao === 'assinatura' ? 'assinatura' : (cat.nome === 'Transporte' ? 'uber' : 'outra');
    } else {
      campos.fatura_mes = null;
      campos.regra_cartao = null;
    }
  }
  try {
    await ocupado(form.querySelector('[type=submit]'), 'Salvando...', async () => {
      trocar('lancamentos', await atualizar('lancamentos', l.id, campos));
      salvarCache();
    });
    folhaEditar.close();
    render();
    avisar(`Salvo. Daqui pra frente: ${moeda(porDiaAgora().porDia)} por dia`);
  } catch (err) {
    console.warn(err);
    erro.textContent = ERRO_REDE;
  }
});

// ---------- Conferir saldo ----------
async function conferirSaldo(form) {
  const real = lerValor(form.elements.saldo.value);
  const erro = form.querySelector('.erro');
  if (real == null) { erro.textContent = 'Digita o saldo da conta.'; return; }
  const r = saldoEsperado(estado.dados);
  const esperado = r ? r.esperado : real;
  const diff = real - esperado;
  try {
    if (diff === 0) {
      await ocupado(form.querySelector('[type=submit]'), 'Conferindo...', async () => {
        const [s] = await inserir('saldos_conferidos', [{ data: hojeSP(), saldo: real }]);
        trocar('saldos_conferidos', s);
        salvarCache();
      });
    }
    estado.conferencia = { real, esperado, diff };
    render();
  } catch (e) {
    console.warn(e);
    erro.textContent = ERRO_REDE;
  }
}

async function ajustarSaldo(botao) {
  const c = estado.conferencia;
  try {
    await ocupado(botao, 'Ajustando...', async () => {
      // O ajuste corrige o Livre. O saldo conferido vira o novo ponto de partida.
      const [a] = await inserir('lancamentos', [{
        cliente_id: crypto.randomUUID(), data: hojeSP(), valor: c.diff, tipo: 'ajuste',
        descricao: 'Ajuste da conferência', observacao: `Banco ${moeda(c.real)}, app esperava ${moeda(c.esperado)}`,
      }]);
      trocar('lancamentos', a);
      const [s] = await inserir('saldos_conferidos', [{ data: hojeSP(), saldo: c.real }]);
      trocar('saldos_conferidos', s);
      salvarCache();
    });
    estado.conferencia = { ...c, ajustado: true };
    render();
  } catch (e) {
    console.warn(e);
    avisar(ERRO_REDE, 'erro');
  }
}

// ---------- Importar dados iniciais ----------
async function importarArquivo(arquivo) {
  const erro = $('#erro-importar');
  erro.textContent = '';
  let montados;
  try {
    montados = montarDados(JSON.parse(await arquivo.text()));
  } catch (e) {
    erro.textContent = `Arquivo com problema: ${e.message}`;
    return;
  }
  const resumo = `${montados.lancamentos.length} lançamentos, ${montados.contas_fixas.length} contas fixas, `
    + `${montados.dividas.length} dívidas e ${montados.itens_mes.length} contas de meses.`;
  if (!confirm(`Importar ${resumo}`)) return;
  try {
    avisar('Importando...');
    await importarDados(montados);
    await carregar();
    location.hash = '#hoje';
    avisar('Dados importados.');
  } catch (e) {
    console.warn(e);
    erro.textContent = `Não deu pra importar: ${e.message}`;
  }
}

// ---------- Login ----------
function mostrarLogin() {
  estado.usuario = null;
  estado.dados = null;
  app.hidden = true;
  telaLogin.hidden = false;
  if (!configurado) {
    $('#aviso-config').hidden = false;
    $('#form-login').querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
  }
}

function mostrarApp(sessao) {
  const novoUsuario = estado.usuario?.id !== sessao.user.id;
  estado.usuario = sessao.user;
  telaLogin.hidden = true;
  app.hidden = false;
  if (novoUsuario) {
    lerCache();
    render();
    carregar();
  }
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const botao = form.querySelector('button');
  const erro = $('#erro-login');
  erro.textContent = '';
  botao.disabled = true;
  botao.textContent = 'Entrando...';
  try {
    await entrar(form.email.value.trim(), form.senha.value);
    form.reset();
  } catch (err) {
    erro.textContent = (err?.code === 'invalid_credentials' || err?.message === 'Invalid login credentials')
      ? 'E-mail ou senha errados.'
      : 'Não deu pra entrar. Confere a internet e tenta de novo.';
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});

aoMudarSessao((sessao) => (sessao ? mostrarApp(sessao) : mostrarLogin()));

const sessao = await sessaoAtual();
if (sessao) mostrarApp(sessao);
else mostrarLogin();
