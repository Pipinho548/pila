// Telas e navegação.
import { configurado, sessaoAtual, entrar, sair, aoMudarSessao } from './db.js';
import { hoje, dataBR, nomeMes, mesDe } from './format.js';

const $ = (sel) => document.querySelector(sel);

const telaLogin = $('#tela-login');
const app = $('#app');
const conteudo = $('#conteudo');
const folhaLancar = $('#folha-lancar');

let usuario = null;

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

// ---------- Telas ----------
const REGRAS_DE_OURO = [
  'Salário caiu: paga primeiro contas e parcelas. O que sobrar é seu.',
  'Cartão só pra Uber e assinatura.',
  'Nada parcelado novo até março/2027.',
  'Dinheiro que ainda não caiu não existe.',
  'Viu algo legal? Vai pra lista de desejos e espera 2 dias.',
];

const telas = {
  hoje() {
    return `
      <header class="cabecalho">
        <h1>Hoje</h1>
        <p class="sub">${dataBR(hoje())}</p>
      </header>
      <section class="cartao destaque">
        <p class="rotulo">Ainda dá hoje</p>
        <p class="valor-grande num">R$ --</p>
        <p class="linha-sub">Os números chegam na Fase 2.</p>
      </section>
      <div class="grade-2">
        <section class="cartao">
          <p class="rotulo">Livre do mês</p>
          <p class="valor-medio num">--</p>
        </section>
        <section class="cartao">
          <p class="rotulo">Falta pagar</p>
          <p class="valor-medio num">--</p>
        </section>
      </div>
      <section class="cartao">
        <h2>Últimos lançamentos</h2>
        <p class="vazio">Nada lançado ainda.</p>
      </section>`;
  },

  mes() {
    return `
      <header class="cabecalho">
        <h1>Mês</h1>
        <p class="sub">${nomeMes(mesDe(hoje()))}</p>
      </header>
      <section class="cartao">
        <h2>Contas do mês</h2>
        <p class="vazio">O plano do mês chega na Fase 2.</p>
      </section>`;
  },

  dividas() {
    return `
      <header class="cabecalho"><h1>Dívidas</h1></header>
      <section class="cartao">
        <p class="vazio">Progresso e linha do tempo chegam na Fase 3.</p>
      </section>`;
  },

  metas() {
    return `
      <header class="cabecalho"><h1>Metas</h1></header>
      <section class="cartao">
        <h2>Lista de desejos</h2>
        <p class="vazio">Chega na Fase 4.</p>
      </section>
      <section class="cartao">
        <h2>Caixinhas</h2>
        <p class="vazio">Chega na Fase 3.</p>
      </section>`;
  },

  mais() {
    return `
      <header class="cabecalho">
        <h1>Mais</h1>
        <p class="sub">${usuario?.email ?? ''}</p>
      </header>
      <section class="cartao">
        <h2>Regras de ouro</h2>
        <ol class="regras">${REGRAS_DE_OURO.map((r) => `<li>${r}</li>`).join('')}</ol>
      </section>
      <section class="cartao">
        <button type="button" class="btn-secundario" id="btn-sair">Sair</button>
      </section>`;
  },
};

function abaAtual() {
  const aba = location.hash.slice(1);
  return telas[aba] ? aba : 'hoje';
}

function render() {
  const aba = abaAtual();
  conteudo.innerHTML = telas[aba]();
  document.querySelectorAll('.abas a').forEach((a) => {
    if (a.dataset.aba === aba) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => { if (usuario) render(); });

conteudo.addEventListener('click', async (e) => {
  if (e.target.closest('#btn-sair')) {
    await sair();
  }
});

// ---------- Lançar gasto ----------
$('#btn-lancar').addEventListener('click', () => folhaLancar.showModal());
folhaLancar.addEventListener('click', (e) => {
  // Fecha no X ou tocando fora da folha
  if (e.target === folhaLancar || e.target.closest('[data-fechar]')) folhaLancar.close();
});

// ---------- Login ----------
function mostrarLogin() {
  usuario = null;
  app.hidden = true;
  telaLogin.hidden = false;
  if (!configurado) {
    $('#aviso-config').hidden = false;
    $('#form-login').querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
  }
}

function mostrarApp(sessao) {
  usuario = sessao.user;
  telaLogin.hidden = true;
  app.hidden = false;
  render();
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
