// Telas da rotina: Comprar, A receber, Configurações e Como funciona.
import { moeda, dataBR, dataCurta, nomeMes, mesDe, esc, valorParaTexto, FUSO } from './format.js';
import * as calc from './calc.js';
import { lojaDoLink, mensagemCobranca } from './links.js';
import {
  MEIOS, neg, avisoOffline, carregando, cartaoImportar,
} from './telas.js';

const fechar = '<button type="button" class="btn-fechar" data-fechar aria-label="Fechar">✕</button>';
const titulo = (texto) => `<div class="folha-topo"><h2 tabindex="-1" autofocus>${esc(texto)}</h2>${fechar}</div>`;

function opcoesCategoria(dados, escolhida, vazio = '') {
  return `${vazio ? `<option value="">${esc(vazio)}</option>` : ''}${dados.categorias
    .map((c) => `<option value="${c.id}"${c.id === escolhida ? ' selected' : ''}>${esc(c.icone ?? '')} ${esc(c.nome)}</option>`)
    .join('')}`;
}

function segmentadoMeio(meios, escolhido) {
  return `
    <fieldset class="segmentado">
      <legend>Meio</legend>
      ${meios.map((m) => `<label><input type="radio" name="meio" value="${m}"${m === escolhido ? ' checked' : ''}><span>${MEIOS[m]}</span></label>`).join('')}
    </fieldset>`;
}

const quandoLibera = (ms) => new Date(ms).toLocaleString('pt-BR', {
  timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

// ---------- Comprar ----------

const PRIORIDADE = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };

function cartaoDesejo(d, ctx) {
  const { dados, hoje } = ctx;
  const s = calc.situacaoDesejo(d, dados, hoje);
  const loja = lojaDoLink(d.link);
  let situacao;
  if (d.preco == null) situacao = '<p class="nota">Sem preço ainda. Edita e coloca o preço pra ver se cabe.</p>';
  else if (s.cabeAgora) {
    situacao = `<p class="nota">Cabe no seu Livre agora. Seu por dia vai de <b class="num">${moeda(s.porDiaAntes)}</b> pra <b class="num${neg(s.porDiaDepois)}">${moeda(s.porDiaDepois)}</b>.</p>`;
  } else if (s.quandoCabe) {
    situacao = `<p class="nota aviso-cartao">Não cabe agora (Livre ${moeda(s.livre)}). Cabe na sobra prevista de <b>${esc(nomeMes(s.quandoCabe.mes))}</b> (${moeda(s.quandoCabe.sobra)}).</p>`;
  } else {
    situacao = '<p class="nota aviso-cartao">Não cabe agora nem na sobra prevista dos próximos 12 meses.</p>';
  }
  return `
    <section class="cartao desejo">
      <div class="cartao-topo">
        <h2>${esc(d.nome)}</h2>
        ${d.preco != null ? `<p class="valor-medio num">${moeda(d.preco)}</p>` : ''}
      </div>
      <p class="mini">${esc([loja, d.pra_quem ? `pra ${d.pra_quem.trim().toLowerCase() === 'eu' ? 'mim' : d.pra_quem}` : null, d.plano, `prioridade ${PRIORIDADE[d.prioridade] ?? 'média'}`].filter(Boolean).join(', '))}</p>
      ${d.observacao ? `<p class="mini obs">${esc(d.observacao)}</p>` : ''}
      ${s.esfriando ? `<p class="nota">Esfriando até ${quandoLibera(s.liberaEm)}. Se ainda quiser depois disso, libera o "Comprei".</p>` : ''}
      ${situacao}
      ${d.parcelado ? '<p class="nota aviso-cartao">Regra de ouro: nada parcelado novo até março/2027.</p>' : ''}
      <div class="botoes-lado">
        <button type="button" class="btn-primario" data-acao="comprei" data-id="${d.id}"${s.esfriando ? ' disabled' : ''}>Comprei</button>
        <button type="button" class="btn-secundario" data-acao="editar-desejo" data-id="${d.id}">Editar</button>
      </div>
      ${d.link ? `<a class="btn-secundario link-botao" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir${loja ? ` na ${esc(loja)}` : ' o link'}</a>` : ''}
    </section>`;
}

export function telaComprar(ctx) {
  const { dados } = ctx;
  const topo = `
    <header class="cabecalho"><h1>Comprar</h1><p class="sub">Viu algo legal? Salva aqui e espera 2 dias.</p></header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();
  const ativos = dados.desejos.filter((d) => !d.comprado_em)
    .sort((a, b) => a.prioridade - b.prioridade || a.created_at.localeCompare(b.created_at));
  const comprados = dados.desejos.filter((d) => d.comprado_em).sort((a, b) => b.comprado_em.localeCompare(a.comprado_em));
  return `${topo}
    <button type="button" class="btn-primario largo topo-botao" data-acao="novo-desejo">+ Quero comprar</button>
    ${ativos.length ? ativos.map((d) => cartaoDesejo(d, ctx)).join('') : '<section class="cartao"><p class="vazio">Nada na lista. Cola o link de algo que você quer.</p></section>'}
    ${comprados.length ? `
    <details class="cartao">
      <summary><h2>Comprados (${comprados.length})</h2></summary>
      <ul class="lista">${comprados.map((d) => `
        <li class="linha"><span class="icone" aria-hidden="true"><span class="folhinha cheia"></span></span>
          <span class="linha-texto"><span class="linha-titulo">${esc(d.nome)}</span><span class="mini">${dataBR(d.comprado_em)}</span></span>
          <span class="num linha-valor">${d.preco != null ? moeda(d.preco) : ''}</span></li>`).join('')}</ul>
    </details>` : ''}`;
}

export function folhaDesejo(d, ctx) {
  const novo = !d;
  d ??= { prioridade: 2, parcelado: false };
  return `${titulo(novo ? 'Quero comprar' : 'Editar')}
    <form id="form-desejo" class="form" data-id="${d.id ?? ''}">
      <label class="campo">Link (Amazon, Mercado Livre, Shopee...)
        <input name="link" type="url" inputmode="url" autocomplete="off" placeholder="Cola o link aqui" value="${esc(d.link ?? '')}">
      </label>
      <label class="campo">O que é <input name="nome" autocomplete="off" required value="${esc(d.nome ?? '')}"></label>
      <label class="campo">Preço <input name="preco" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${d.preco != null ? valorParaTexto(d.preco) : ''}"></label>
      <label class="campo">Pra quem <input name="pra_quem" autocomplete="off" placeholder="eu" value="${esc(d.pra_quem ?? '')}"></label>
      <fieldset class="segmentado">
        <legend>Prioridade</legend>
        ${[1, 2, 3].map((p) => `<label><input type="radio" name="prioridade" value="${p}"${p === d.prioridade ? ' checked' : ''}><span>${PRIORIDADE[p]}</span></label>`).join('')}
      </fieldset>
      <label class="campo">Quando <input name="plano" autocomplete="off" placeholder="Black Friday, fevereiro/27, quando entrar extra..." value="${esc(d.plano ?? '')}"></label>
      <label class="check-linha"><input type="checkbox" name="parcelado"${d.parcelado ? ' checked' : ''}> Vou parcelar</label>
      <label class="campo">Observação <input name="observacao" autocomplete="off" value="${esc(d.observacao ?? '')}"></label>
      <button type="submit" class="btn-primario">Salvar</button>
      ${novo ? '' : '<button type="button" class="btn-perigo" data-acao="apagar-desejo">Tirar da lista</button>'}
      <p class="erro" role="alert"></p>
    </form>`;
}

export function folhaComprei(d, ctx) {
  const { dados } = ctx;
  return `${titulo(`Comprei: ${d.nome}`)}
    <p class="sub">Vira um gasto do dia a dia e sai do seu Livre.</p>
    ${d.parcelado ? '<p class="nota aviso-cartao">Regra de ouro: nada parcelado novo até março/2027.</p>' : ''}
    <form id="form-comprei" class="form" data-id="${d.id}">
      <label class="campo">Quanto pagou <input name="valor" inputmode="decimal" autocomplete="off" required value="${d.preco != null ? valorParaTexto(d.preco) : ''}"></label>
      <label class="campo">Categoria <select name="categoria" required>${opcoesCategoria(dados, null, 'Escolhe')}</select></label>
      ${segmentadoMeio(['pix', 'debito', 'cartao', 'dinheiro'], 'pix')}
      <label class="campo">Data <input type="date" name="data" value="${ctx.hoje}"></label>
      <button type="submit" class="btn-primario">Comprei</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

// ---------- A receber ----------

export function telaReceber(ctx) {
  const { dados } = ctx;
  const topo = `
    <header class="cabecalho">
      <a href="#mais" class="voltar">‹ Mais</a>
      <h1>A receber</h1>
      <p class="sub">Dinheiro que ainda não caiu não existe: só entra nas contas quando você toca em Recebi.</p>
    </header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();
  const pendentes = dados.a_receber.filter((r) => !r.recebido_em);
  const recebidos = dados.a_receber.filter((r) => r.recebido_em).sort((a, b) => b.recebido_em.localeCompare(a.recebido_em));
  return `${topo}
    <button type="button" class="btn-primario largo topo-botao" data-acao="novo-receber">+ Alguém me deve</button>
    ${pendentes.length ? `<p class="secao">Total: ${moeda(calc.soma(pendentes))}</p>` : ''}
    ${pendentes.length ? pendentes.map((r) => `
      <section class="cartao">
        <div class="cartao-topo"><h2>${esc(r.quem)}</h2><p class="valor-medio num">${moeda(r.valor)}</p></div>
        <p class="mini">${esc([r.motivo, r.data ? dataBR(r.data) : null].filter(Boolean).join(', '))}</p>
        <div class="botoes-lado">
          <button type="button" class="btn-primario" data-acao="cobrar" data-id="${r.id}">Cobrar</button>
          <button type="button" class="btn-secundario" data-acao="recebi" data-id="${r.id}">Recebi</button>
        </div>
        <button type="button" class="btn-link" data-acao="editar-receber" data-id="${r.id}">Editar</button>
      </section>`).join('') : '<section class="cartao"><p class="vazio">Ninguém te deve nada.</p></section>'}
    ${recebidos.length ? `
    <details class="cartao">
      <summary><h2>Recebidos (${recebidos.length})</h2></summary>
      <ul class="lista">${recebidos.map((r) => `
        <li class="linha"><span class="icone" aria-hidden="true"><span class="folhinha cheia"></span></span>
          <span class="linha-texto"><span class="linha-titulo">${esc(r.quem)}</span><span class="mini">${dataBR(r.recebido_em)}</span></span>
          <span class="num linha-valor positivo">+${moeda(r.valor)}</span></li>`).join('')}</ul>
    </details>` : ''}`;
}

export function folhaReceber(r, ctx) {
  const novo = !r;
  r ??= {};
  return `${titulo(novo ? 'Alguém me deve' : 'Editar')}
    <form id="form-receber" class="form" data-id="${r.id ?? ''}">
      <label class="campo">Quem <input name="quem" autocomplete="off" required value="${esc(r.quem ?? '')}"></label>
      <label class="campo">Quanto <input name="valor" inputmode="decimal" autocomplete="off" required placeholder="0,00" value="${r.valor != null ? valorParaTexto(r.valor) : ''}"></label>
      <label class="campo">Do quê <input name="motivo" autocomplete="off" placeholder="almoço, ingresso..." value="${esc(r.motivo ?? '')}"></label>
      <label class="campo">WhatsApp (com DDD) <input name="telefone" type="tel" inputmode="tel" autocomplete="off" placeholder="(54) 99999-9999" value="${esc(r.telefone ?? '')}"></label>
      <label class="campo">Quando <input type="date" name="data" value="${r.data ?? ctx.hoje}"></label>
      <button type="submit" class="btn-primario">Salvar</button>
      ${novo ? '' : '<button type="button" class="btn-perigo" data-acao="apagar-receber">Apagar</button>'}
      <p class="erro" role="alert"></p>
    </form>`;
}

export function folhaCobrar(r) {
  return `${titulo(`Cobrar ${r.quem}`)}
    <p class="sub">Edita a mensagem se quiser. Abre no WhatsApp pra você mandar.</p>
    <form id="form-cobrar" class="form" data-id="${r.id}">
      <label class="campo">Mensagem <textarea name="mensagem" rows="5">${esc(mensagemCobranca(r))}</textarea></label>
      <label class="campo">WhatsApp (com DDD) <input name="telefone" type="tel" inputmode="tel" autocomplete="off" placeholder="sem número, você escolhe o contato" value="${esc(r.telefone ?? '')}"></label>
      <button type="submit" class="btn-primario">Abrir WhatsApp</button>
    </form>`;
}

export function folhaRecebi(r, ctx) {
  return `${titulo(`Recebi de ${r.quem}`)}
    <p class="sub">Vira uma entrada no mês e aumenta o seu Livre.</p>
    <form id="form-recebi" class="form" data-id="${r.id}">
      <label class="campo">Quanto <input name="valor" inputmode="decimal" autocomplete="off" required value="${valorParaTexto(r.valor)}"></label>
      ${segmentadoMeio(['pix', 'dinheiro'], 'pix')}
      <label class="campo">Data <input type="date" name="data" value="${ctx.hoje}"></label>
      <button type="submit" class="btn-primario">Recebi</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

// ---------- Configurações ----------

const NOMES_TIPO_FIXA = { conta: 'Conta', assinatura: 'Assinatura no cartão', fatura_uber: 'Uber no cartão', deposito: 'Guardar no CDB' };

export function telaConfig(ctx) {
  const { dados, hoje } = ctx;
  const topo = `
    <header class="cabecalho">
      <a href="#mais" class="voltar">‹ Mais</a>
      <h1>Configurações</h1>
    </header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();
  const c = dados.config;
  const contas = [...dados.contas_fixas].sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.ordem - b.ordem);
  const meses = [...new Set(dados.limites.map((l) => l.mes))].filter((m) => m >= mesDe(hoje)).sort();
  return `${topo}
    <section class="cartao">
      <h2>Geral</h2>
      <dl class="resumo">
        <div><dt>Salário</dt><dd class="num">${moeda(c.salario)}</dd></div>
        <div><dt>Dia do salário</dt><dd>${c.dia_salario}</dd></div>
        <div><dt>Cartão fecha</dt><dd>dia ${c.cartao_fecha_dia}</dd></div>
        <div><dt>Cartão vence</dt><dd>dia ${c.cartao_vence_dia}</dd></div>
      </dl>
      <button type="button" class="btn-secundario largo" data-acao="editar-config">Editar</button>
    </section>

    <section class="cartao">
      <h2>Contas fixas</h2>
      <p class="mini">Valem a partir do próximo mês. O plano deste mês você ajusta na aba Mês.</p>
      <ul class="lista">${contas.map((f) => `
        <li><button type="button" class="botao-linha linha${f.ativa ? '' : ' pago'}" data-acao="editar-conta-fixa" data-id="${f.id}">
          <span class="icone" aria-hidden="true">${f.ativa ? '📌' : '💤'}</span>
          <span class="linha-texto"><span class="linha-titulo">${esc(f.nome)}</span>
            <span class="mini">${esc([NOMES_TIPO_FIXA[f.tipo], f.dia ? `dia ${f.dia}` : null, f.ativa ? null : 'pausada'].filter(Boolean).join(', '))}</span></span>
          <span class="num linha-valor">${moeda(f.valor_previsto)}</span>
        </button></li>`).join('')}</ul>
      <button type="button" class="btn-secundario largo" data-acao="nova-conta-fixa">+ Nova conta fixa</button>
    </section>

    <section class="cartao">
      <h2>Limites do dia a dia</h2>
      <p class="mini">Cada mês novo copia os limites do mês anterior.</p>
      ${meses.length ? meses.map((m) => `
        <p class="sub-titulo">${esc(nomeMes(m))}</p>
        <ul class="lista">${dados.limites.filter((l) => l.mes === m).map((l) => `
          <li><button type="button" class="botao-linha linha" data-acao="editar-limite" data-id="${l.id}">
            <span class="icone" aria-hidden="true">📊</span>
            <span class="linha-texto"><span class="linha-titulo">${esc(l.nome)}</span>
              <span class="mini">${esc(l.categorias.map((id) => dados.categorias.find((x) => x.id === id)?.nome).filter(Boolean).join(', '))}</span></span>
            <span class="num linha-valor">${moeda(l.valor)}</span>
          </button></li>`).join('')}</ul>`).join('') : '<p class="vazio">Nenhum limite.</p>'}
      <button type="button" class="btn-secundario largo" data-acao="novo-limite">+ Novo limite</button>
    </section>

    <section class="cartao">
      <h2>Categorias</h2>
      <div class="chips">${dados.categorias.map((cat) => `
        <button type="button" class="chip-botao" data-acao="editar-categoria" data-id="${cat.id}">${esc(cat.icone ?? '')} ${esc(cat.nome)}</button>`).join('')}
      </div>
      <button type="button" class="btn-secundario largo" data-acao="nova-categoria">+ Nova categoria</button>
    </section>`;
}

const numero = (nome, rotulo, valor) => `
  <label class="campo">${rotulo} <input name="${nome}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${valor ?? ''}"></label>`;

export function folhaConfig(ctx) {
  const c = ctx.dados.config;
  return `${titulo('Geral')}
    <form id="form-config" class="form">
      <label class="campo">Salário <input name="salario" inputmode="decimal" autocomplete="off" required value="${valorParaTexto(c.salario)}"></label>
      ${numero('dia_salario', 'Dia do salário', c.dia_salario)}
      ${numero('cartao_fecha_dia', 'Dia que o cartão fecha', c.cartao_fecha_dia)}
      ${numero('cartao_vence_dia', 'Dia que a fatura vence', c.cartao_vence_dia)}
      <p class="mini">Mudar o fechamento do cartão não muda a fatura de compras que já foram lançadas.</p>
      <button type="submit" class="btn-primario">Salvar</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

export function folhaContaFixa(f, ctx) {
  const { dados } = ctx;
  const nova = !f;
  f ??= { tipo: 'conta', ativa: true };
  return `${titulo(nova ? 'Nova conta fixa' : f.nome)}
    <p class="sub">Vale a partir do próximo mês.</p>
    <form id="form-conta-fixa" class="form" data-id="${f.id ?? ''}">
      <label class="campo">Nome <input name="nome" autocomplete="off" required value="${esc(f.nome ?? '')}"></label>
      <label class="campo">Tipo
        <select name="tipo">${Object.entries(NOMES_TIPO_FIXA).map(([v, n]) => `<option value="${v}"${v === f.tipo ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </label>
      <label class="campo">Valor previsto <input name="valor" inputmode="decimal" autocomplete="off" required value="${f.valor_previsto != null ? valorParaTexto(f.valor_previsto) : ''}"></label>
      ${numero('dia', 'Dia que vence (opcional)', f.dia)}
      <label class="campo">Categoria <select name="categoria">${opcoesCategoria(dados, f.categoria_id, 'Sem categoria')}</select></label>
      <label class="campo">Como paga
        <select name="meio"><option value="">Não sei</option>${['pix', 'debito', 'boleto', 'cartao', 'dinheiro'].map((m) => `<option value="${m}"${m === f.meio ? ' selected' : ''}>${MEIOS[m]}</option>`).join('')}</select>
      </label>
      <label class="campo">Pra quem (opcional) <input name="quem" autocomplete="off" value="${esc(f.quem ?? '')}"></label>
      <label class="check-linha"><input type="checkbox" name="ativa"${f.ativa ? ' checked' : ''}> Ativa (entra no plano todo mês)</label>
      <button type="submit" class="btn-primario">Salvar</button>
      ${nova ? '' : '<button type="button" class="btn-perigo" data-acao="apagar-conta-fixa">Apagar conta fixa</button>'}
      <p class="erro" role="alert"></p>
    </form>`;
}

export function folhaLimite(l, ctx) {
  const { dados, hoje } = ctx;
  const novo = !l;
  l ??= { mes: mesDe(hoje), categorias: [] };
  return `${titulo(novo ? 'Novo limite' : l.nome)}
    <form id="form-limite" class="form" data-id="${l.id ?? ''}">
      <label class="campo">Mês <input type="month" name="mes" required value="${l.mes}"></label>
      <label class="campo">Nome <input name="nome" autocomplete="off" required placeholder="Mercado" value="${esc(l.nome ?? '')}"></label>
      <label class="campo">Limite <input name="valor" inputmode="decimal" autocomplete="off" required value="${l.valor != null ? valorParaTexto(l.valor) : ''}"></label>
      <fieldset class="caixas">
        <legend>Categorias que entram</legend>
        ${dados.categorias.map((c) => `
          <label class="check-linha"><input type="checkbox" name="categorias" value="${c.id}"${l.categorias.includes(c.id) ? ' checked' : ''}> ${esc(c.icone ?? '')} ${esc(c.nome)}</label>`).join('')}
      </fieldset>
      <button type="submit" class="btn-primario">Salvar</button>
      ${novo ? '' : '<button type="button" class="btn-perigo" data-acao="apagar-limite">Apagar limite</button>'}
      <p class="erro" role="alert"></p>
    </form>`;
}

export function folhaCategoria(c) {
  const nova = !c;
  c ??= {};
  return `${titulo(nova ? 'Nova categoria' : c.nome)}
    <form id="form-categoria" class="form" data-id="${c.id ?? ''}">
      <label class="campo">Ícone (um emoji) <input name="icone" autocomplete="off" maxlength="4" value="${esc(c.icone ?? '')}"></label>
      <label class="campo">Nome <input name="nome" autocomplete="off" required value="${esc(c.nome ?? '')}"></label>
      <button type="submit" class="btn-primario">Salvar</button>
      ${nova ? '' : '<button type="button" class="btn-perigo" data-acao="apagar-categoria">Apagar categoria</button>'}
      <p class="erro" role="alert"></p>
    </form>`;
}

// Conta que aparece só num mês (ex.: carne em novembro)
export function folhaAvulsa(mes, ctx) {
  return `${titulo(`Conta só de ${nomeMes(mes)}`)}
    <form id="form-avulsa" class="form" data-mes="${mes}">
      <label class="campo">O que é <input name="nome" autocomplete="off" required></label>
      <label class="campo">Valor <input name="valor" inputmode="decimal" autocomplete="off" required placeholder="0,00"></label>
      <label class="campo">Vence (opcional) <input type="date" name="vencimento" min="${mes}-01"></label>
      <label class="campo">Categoria <select name="categoria">${opcoesCategoria(ctx.dados, null, 'Sem categoria')}</select></label>
      <button type="submit" class="btn-primario">Colocar no plano</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

// ---------- Como funciona ----------

export function telaComo() {
  const blocos = [
    ['Livre do mês', 'É o que sobra pra gastar no mês: salário que já caiu, menos todas as contas do plano (pagas ou não), menos os gastos do dia a dia. Dinheiro que ainda não caiu não existe.'],
    ['Ainda dá hoje', 'O Livre do começo do dia dividido pelos dias que faltam, contando hoje. Menos o que você já gastou hoje. Se ficar vermelho, tudo bem: os próximos dias ficam um pouco menores.'],
    ['Daqui pra frente', 'O Livre de agora dividido pelos dias que faltam a partir de amanhã. Sempre arredondado pra baixo.'],
    ['Cartão', 'Uber e assinaturas (Claude, Google) entram como conta no plano do mês em que a fatura vence. Qualquer outra compra no cartão sai do Livre na hora e fica em "Reservado pra fatura". Assim o cartão não esconde gasto.'],
    ['Fatura', 'O cartão fecha dia 3 e vence dia 10. Pagar a fatura não é gasto novo: cada parte já foi descontada antes. Se o banco cobrar diferente, a diferença vira um ajuste.'],
    ['Reserva (CDB)', 'Fica fora do saldo da conta. Guardar sai do Livre; resgatar volta pro Livre. Ela também é a garantia do limite do cartão.'],
    ['Conferir saldo', 'Você digita o saldo do C6 e o app compara com o esperado: último saldo conferido mais o que entrou menos o que saiu da conta. Cartão e dinheiro vivo não contam.'],
    ['Virada do mês', 'No dia 1 o app monta o plano novo: contas fixas ativas, parcelas do mês, assinaturas e Uber da fatura, e o CDB. Quando o salário cair, toca em "Salário caiu".'],
    ['Fechar o mês', 'No mês seguinte o app pergunta o que fazer com a sobra: mandar pra Reserva ou levar pro mês novo.'],
    ['Comprar', 'Tudo que você quer comprar espera 2 dias antes de liberar o "Comprei". O app mostra se cabe no Livre agora ou em que mês cabe.'],
  ];
  return `
    <header class="cabecalho">
      <a href="#mais" class="voltar">‹ Mais</a>
      <h1>Como funciona</h1>
    </header>
    ${blocos.map(([t, texto]) => `<section class="cartao"><h2>${t}</h2><p>${texto}</p></section>`).join('')}`;
}


// ---------- Extrato do C6 ----------

const num = (centavos) => `<span class="num">${moeda(centavos)}</span>`;

function valorExtrato(r) {
  return `<span class="num linha-valor${r.valor > 0 ? ' positivo' : ''}">${r.valor > 0 ? '+' : ''}${moeda(Math.abs(r.valor))}</span>`;
}

function detalheNova(r) {
  const quando = dataCurta(r.data);
  if (r.proposta.tipo === 'conta') return `${quando}, paga a conta ${r.proposta.nome}`;
  if (r.proposta.tipo === 'entrada') return `${quando}, entrada`;
  return `${quando}, ${MEIOS[r.proposta.meio] ?? 'Pix'}`;
}

function linhaNova(r, dados) {
  return `
    <li class="ext-linha">
      <label class="ext-marca">
        <input type="checkbox" name="usar" value="${r.id}"${r.proposta.marcada ? ' checked' : ''}>
        <span class="linha-texto"><span class="linha-titulo">${esc(r.descricao)}</span><span class="mini">${esc(detalheNova(r))}</span></span>
        ${valorExtrato(r)}
      </label>
      ${r.proposta.tipo === 'gasto' ? `
      <select name="cat-${r.id}" class="ext-cat" aria-label="Categoria de ${esc(r.descricao)}">
        ${opcoesCategoria(dados, r.proposta.categoria_id, 'Escolher categoria')}
      </select>` : ''}
    </li>`;
}

function linhaVista(r, detalhe) {
  return `
    <li class="linha">
      <span class="linha-texto"><span class="linha-titulo">${esc(r.descricao)}</span><span class="mini">${esc(`${dataCurta(r.data)}, ${detalhe}`)}</span></span>
      ${valorExtrato(r)}
    </li>`;
}

export function folhaExtrato(a, ctx) {
  const { dados } = ctx;
  const de = (situacoes) => a.linhas.filter((r) => situacoes.includes(r.situacao));
  const novas = de(['nova']);
  const noApp = de(['no-app', 'importada']).reverse();
  const fora = de(['fora']).reverse();
  const antigas = de(['antiga']);
  const marcadas = novas.filter((r) => r.proposta.marcada).length;

  let saldo = '';
  if (a.saldo) {
    const diferenca = a.saldo.valor - a.saldo.esperado;
    saldo = `
    <div class="cartao-topo bloco-topo">
      <h3>Saldo no banco em ${dataCurta(a.saldo.data)}</h3>
      <p class="valor-medio num">${moeda(a.saldo.valor)}</p>
    </div>
    <p class="mini">${diferenca === 0
      ? 'Bate com o app.'
      : `O app esperava ${num(a.saldo.esperado)}, diferença de ${num(Math.abs(diferenca))}. ${novas.length ? 'Lançar o que falta deve resolver. Se não resolver, ajusta' : 'Ajusta'} em Conferir saldo.`}</p>`;
  }

  return `${titulo('Extrato do C6')}
    <p class="sub">${a.de ? `De ${dataCurta(a.de)} a ${dataCurta(a.ate)}, ${a.linhas.length} transações` : 'Sem transações'}</p>
    ${saldo}
    <div class="cartao-topo bloco-topo"><h3>Falta lançar</h3><p class="mini">${novas.length}</p></div>
    ${novas.length ? `
    <form id="form-extrato" class="form">
      <p class="mini">Marca o que vai pro app. Gasto precisa de categoria.</p>
      <ul class="lista ext-lista">${novas.map((r) => linhaNova(r, dados)).join('')}</ul>
      <button type="submit" class="btn-primario">${marcadas ? `Lançar ${marcadas}` : 'Marca o que lançar'}</button>
      <p class="erro" role="alert"></p>
    </form>` : '<p class="vazio">Nada novo: o que está no extrato já está no app.</p>'}
    ${noApp.length ? `
    <details class="ext-mais">
      <summary>Já estão no app (${noApp.length})</summary>
      <ul class="lista">${noApp.map((r) => linhaVista(r, r.situacao === 'importada'
        ? 'importado do extrato'
        : `lançado como ${r.comQue.map((l) => l.descricao || 'gasto').join(' + ')}`)).join('')}</ul>
    </details>` : ''}
    ${fora.length ? `
    <details class="ext-mais">
      <summary>Ficam de fora (${fora.length})</summary>
      <ul class="lista">${fora.map((r) => linhaVista(r, r.motivo)).join('')}</ul>
    </details>` : ''}
    ${antigas.length ? `<p class="mini ext-antigas">${antigas.length === 1 ? '1 transação' : `${antigas.length} transações`} ${a.diaFechado ? 'até' : 'de antes de'} ${dataCurta(a.desde)} não aparecem: o saldo que você conferiu nesse dia já conta com elas.</p>` : ''}`;
}
