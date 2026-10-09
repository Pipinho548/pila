// O que aparece em cada tela. Só monta HTML: quem reage aos toques é o app.js.
import { moeda, menos, dataBR, dataCurta, nomeMes, mesDe, esc, diaDaSemana, valorParaTexto } from './format.js';
import * as calc from './calc.js';

export const MEIOS = { pix: 'Pix', debito: 'Débito', cartao: 'Cartão', boleto: 'Boleto', dinheiro: 'Dinheiro' };

const REGRAS_DE_OURO = [
  'Salário caiu: paga primeiro contas e parcelas. O que sobrar é seu.',
  'Cartão só pra Uber e assinatura.',
  'Nada parcelado novo até março/2027.',
  'Dinheiro que ainda não caiu não existe.',
  'Viu algo legal? Vai pra lista de compras e espera 2 dias.',
];

const neg = (v) => (v < 0 ? ' negativo' : '');

function categoriaDe(dados, id) {
  return dados.categorias.find((c) => c.id === id) ?? null;
}

function iconeLancamento(dados, l) {
  if (l.tipo === 'entrada') return '💰';
  if (l.tipo === 'deposito_caixinha') return '🏦';
  if (l.tipo === 'resgate_caixinha') return '↩️';
  if (l.tipo === 'ajuste') return '⚖️';
  if (l.tipo === 'pagamento_fatura') return '💳';
  return categoriaDe(dados, l.categoria_id)?.icone ?? '•';
}

function linhaLancamento(dados, l) {
  const cat = categoriaDe(dados, l.categoria_id);
  const titulo = l.descricao || cat?.nome || 'Gasto';
  const detalhes = [dataCurta(l.data), MEIOS[l.meio], l.regra_cartao === 'uber' ? 'vai pra fatura' : null]
    .filter(Boolean).join(' · ');
  const entrada = l.tipo === 'entrada' || l.tipo === 'resgate_caixinha' || (l.tipo === 'ajuste' && l.valor > 0);
  const valor = l.tipo === 'ajuste' ? Math.abs(l.valor) : l.valor;
  return `
    <li>
      <button type="button" class="linha botao-linha" data-acao="abrir-lancamento" data-id="${l.id}">
        <span class="icone" aria-hidden="true">${esc(iconeLancamento(dados, l))}</span>
        <span class="linha-texto"><span class="linha-titulo">${esc(titulo)}</span><span class="mini">${esc(detalhes)}</span></span>
        <span class="num linha-valor${entrada ? ' positivo' : ''}">${entrada ? '+' : ''}${moeda(valor)}</span>
      </button>
    </li>`;
}

const NOMES_TIPO_LANCAMENTO = {
  gasto: 'Gasto', entrada: 'Entrada', deposito_caixinha: 'Guardado no CDB', resgate_caixinha: 'Resgate do CDB',
  pagamento_fatura: 'Pagamento de fatura', ajuste: 'Ajuste',
};

// Folha que abre ao tocar num lançamento: editar ou apagar
export function folhaLancamento(l, ctx) {
  const { dados } = ctx;
  const cat = categoriaDe(dados, l.categoria_id);
  const titulo = l.descricao || cat?.nome || NOMES_TIPO_LANCAMENTO[l.tipo];
  const sub = [NOMES_TIPO_LANCAMENTO[l.tipo], dataBR(l.data), MEIOS[l.meio]].filter(Boolean).join(' · ');
  const topo = `
    <div class="folha-topo"><h2 tabindex="-1" autofocus>${esc(titulo)}</h2><button type="button" class="btn-fechar" data-fechar aria-label="Fechar">✕</button></div>
    <p class="sub">${esc(sub)}</p>
    ${l.observacao ? `<p class="mini obs">${esc(l.observacao)}</p>` : ''}`;

  // Pagamento de conta do mês: desfaz pela conta, pra não ficar marcada como paga sem lançamento
  if (l.item_mes_id) {
    const item = dados.itens_mes.find((i) => i.id === l.item_mes_id);
    return `${topo}
      <p class="nota">Esse é o pagamento de <b>${esc(item?.nome ?? 'uma conta do mês')}</b>: ${moeda(l.valor)}.
      Pra mudar ou desfazer, toca na conta na aba <a href="#mes" data-fechar>Mês</a> e desmarca.</p>`;
  }

  if (l.tipo === 'pagamento_fatura') {
    return `${topo}
      <p class="nota">Pagamento da fatura: <b class="num">${moeda(l.valor)}</b>. Apagar desfaz o pagamento: as contas dessa fatura voltam a "não paga".</p>
      <button type="button" class="btn-perigo" data-acao="apagar-lancamento">Desfazer pagamento</button>`;
  }

  // Gasto normal: dá pra mudar tudo. Outros tipos e compras de antes do app: só valor, data e descrição.
  const completo = l.tipo === 'gasto' && !l.antes_do_app;
  const meios = l.meio === 'boleto' ? ['pix', 'debito', 'boleto', 'cartao', 'dinheiro'] : ['pix', 'debito', 'cartao', 'dinheiro'];
  return `${topo}
    <form id="form-editar" class="form">
      <label class="campo">Valor
        <input name="valor" inputmode="decimal" autocomplete="off" value="${valorParaTexto(l.valor)}" required>
      </label>
      ${completo ? `
      <label class="campo">Categoria
        <select name="categoria">
          ${dados.categorias.map((c) => `<option value="${c.id}"${c.id === l.categoria_id ? ' selected' : ''}>${esc(c.icone ?? '')} ${esc(c.nome)}</option>`).join('')}
        </select>
      </label>
      <fieldset class="segmentado">
        <legend>Meio</legend>
        ${meios.map((m) => `
          <label><input type="radio" name="meio" value="${m}"${m === (l.meio ?? 'pix') ? ' checked' : ''}><span>${MEIOS[m]}</span></label>`).join('')}
      </fieldset>` : ''}
      <label class="campo">Descrição <input name="descricao" autocomplete="off" value="${esc(l.descricao ?? '')}"></label>
      <label class="campo">Data <input type="date" name="data" value="${l.data}"></label>
      <button type="submit" class="btn-primario">Salvar</button>
      <button type="button" class="btn-perigo" data-acao="apagar-lancamento">Apagar lançamento</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

const maisRecentes = (a, b) => b.data.localeCompare(a.data) || (b.created_at ?? '').localeCompare(a.created_at ?? '');

function avisoOffline(ctx) {
  if (!ctx.offline) return '';
  const quando = ctx.atualizadoEm ? new Date(ctx.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  return `<p class="faixa">Sem internet. Mostrando os dados de ${esc(quando)}.</p>`;
}

function cartaoImportar() {
  return `
    <section class="cartao">
      <h2>Bora começar</h2>
      <p class="vazio">Ainda não tem dados aqui. Vai em <a href="#mais">Mais</a> e toca em <b>Importar dados iniciais</b>.</p>
    </section>`;
}

function carregando(ctx) {
  return ctx.dados === null ? '<p class="vazio">Carregando...</p>' : '';
}

// ---------- Hoje ----------

export function telaHoje(ctx) {
  const { dados, hoje } = ctx;
  const topo = `
    <header class="cabecalho">
      <h1>Hoje</h1>
      <p class="sub">${esc(diaDaSemana(hoje))}, ${dataBR(hoje)}</p>
    </header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();

  const mes = calc.resumoMes(dados, mesDe(hoje), hoje);
  const q = calc.quantoPossoGastar(mes.livre, calc.gastosDoDia(dados, hoje), hoje);
  const fatura = calc.faturaAberta(dados, hoje);
  const paraPagar = calc.faturasParaPagar(dados, hoje);
  const reserva = dados.caixinhas[0];
  const alertas = calc.alertas(dados, hoje);
  const ultimos = [...dados.lancamentos].sort(maisRecentes).slice(0, 5);

  let sub;
  if (q.aindaDaHoje < 0) {
    sub = `Passou ${moeda(-q.aindaDaHoje)} hoje. Daqui pra frente fica ${moeda(q.porDia)} por dia.`;
  } else if (q.diasDepoisDeHoje === 0) {
    sub = 'Último dia do mês.';
  } else {
    sub = `Daqui pra frente: ${moeda(q.porDia)} por dia até ${dataCurta(q.ultimoDia)}`;
  }

  return `${topo}
    <section class="cartao destaque">
      <p class="rotulo">Ainda dá hoje</p>
      <p class="valor-grande num${neg(q.aindaDaHoje)}">${moeda(q.aindaDaHoje)}</p>
      <p class="linha-sub${neg(q.aindaDaHoje)}">${sub}</p>
      ${mes.salarioCaiu ? '' : '<p class="nota">O salário deste mês ainda não caiu. Quando cair, confirma na aba <a href="#mes">Mês</a>.</p>'}
    </section>

    <div class="grade-2">
      <a class="cartao toque" href="#mes">
        <p class="rotulo">Livre do mês</p>
        <p class="valor-medio num${neg(mes.livre)}">${moeda(mes.livre)}</p>
      </a>
      <a class="cartao toque" href="#mes">
        <p class="rotulo">Falta pagar</p>
        <p class="valor-medio num">${moeda(mes.faltaPagar)}</p>
        <p class="mini">${mes.proxima
          ? `${esc(mes.proxima.nome)}${mes.proxima.vencimento ? `, ${dataCurta(mes.proxima.vencimento)}` : ''}`
          : 'Tudo pago'}</p>
      </a>
    </div>

    ${paraPagar.map((f) => `
    <a class="cartao toque alerta-cartao linha-unica" href="#fatura">
      <span><span class="rotulo">Fatura de ${dataCurta(f.vence)} fechou</span><br><b class="num">${moeda(f.total)}</b></span>
      <span class="btn-mini">Pagar ›</span>
    </a>`).join('')}

    <a class="cartao toque" href="#fatura">
      <div class="cartao-topo">
        <p class="rotulo">Fatura aberta · vence ${dataCurta(fatura.vence)}</p>
        <p class="valor-medio num">${moeda(fatura.total)}</p>
      </div>
      <div class="tres">
        <div><p class="mini">Uber</p><p class="num">${moeda(fatura.uber)}</p></div>
        <div><p class="mini">Assinaturas</p><p class="num">${moeda(fatura.assinaturas)}</p></div>
        <div><p class="mini">Outras</p><p class="num">${moeda(fatura.outras)}</p></div>
      </div>
    </a>

    ${reserva ? `
    <a class="cartao toque linha-unica" href="#caixinhas">
      <span>🏦 ${esc(reserva.nome)}</span>
      <span class="num forte">${moeda(calc.saldoCaixinha(reserva, dados.lancamentos))} ›</span>
    </a>` : ''}

    ${alertas.length ? `
    <section class="cartao">
      <h2>Atenção</h2>
      <ul class="lista">${alertas.map((a) => `<li class="alerta">${textoAlerta(a, hoje)}</li>`).join('')}</ul>
    </section>` : ''}

    <section class="cartao">
      <h2>Últimos lançamentos</h2>
      ${ultimos.length
        ? `<ul class="lista">${ultimos.map((l) => linhaLancamento(dados, l)).join('')}</ul>`
        : '<p class="vazio">Nada lançado ainda.</p>'}
    </section>`;
}

function quando(data, hoje) {
  if (data === hoje) return 'hoje';
  if (data === calc.somarDias(hoje, 1)) return 'amanhã';
  return dataCurta(data);
}

function textoAlerta(a, hoje) {
  switch (a.tipo) {
    case 'atrasada': return `⚠️ <b>${esc(a.item.nome)}</b> venceu ${dataCurta(a.item.vencimento)} e não foi marcada como paga.`;
    case 'vence': return `📅 <b>${esc(a.item.nome)}</b> vence ${quando(a.item.vencimento, hoje)}.`;
    case 'limite': return `📊 <b>${esc(a.limite.nome)}</b>: ${a.limite.pct}% do limite.`;
    case 'cartao': return `💳 ${a.quantas === 1 ? '1 compra' : `${a.quantas} compras`} no cartão fora da regra este mês (${moeda(a.total)}). Cartão é só pra Uber e assinatura.`;
    case 'fatura': return `💳 Fatura de <b>${moeda(a.fatura.total)}</b> vence ${quando(a.fatura.vence, hoje)}. <a href="#fatura">Pagar</a>`;
    case 'prazo': return `⏳ <b>${esc(a.divida.nome)}</b>: prazo até ${dataBR(a.divida.prazo)}. <a href="#dividas">Ver</a>`;
    default: return '';
  }
}

// ---------- Mês ----------

const NOMES_TIPO = {
  parcela: 'Parcela', avulsa: 'Só este mês', deposito: 'Guardar', fatura_antiga: 'Cartão',
  fatura_uber: 'Cartão', assinatura: 'Cartão', conta_fixa: '',
};
export const pagoComFatura = (item) => ['fatura_antiga', 'fatura_uber', 'assinatura'].includes(item.tipo);

function linhaItem(item, dados, hoje) {
  const valor = calc.valorItem(item, dados, hoje);
  const detalhes = [];
  if (item.pago && item.pago_em) detalhes.push(`pago ${dataCurta(item.pago_em)}`);
  else if (item.vencimento) detalhes.push(`vence ${dataCurta(item.vencimento)}`);
  if (NOMES_TIPO[item.tipo]) detalhes.push(NOMES_TIPO[item.tipo]);
  if (item.tipo === 'fatura_uber' && item.fatura_mes) {
    detalhes.push(`usado ${moeda(calc.corridasUber(dados.lancamentos, item.fatura_mes))}`);
  } else if (item.valor_real == null && !item.pago) {
    detalhes.push('previsto');
  }
  const atrasada = !item.pago && item.vencimento && item.vencimento < hoje;
  return `
    <li>
      <button type="button" class="linha botao-linha${item.pago ? ' pago' : ''}" data-acao="abrir-item" data-id="${item.id}">
        <span class="check${item.pago ? ' marcado' : ''}" aria-label="${item.pago ? 'Pago' : 'Não pago'}"></span>
        <span class="linha-texto">
          <span class="linha-titulo">${esc(item.nome)}</span>
          <span class="mini${atrasada ? ' negativo' : ''}">${esc(detalhes.join(' · '))}</span>
          ${item.observacao ? `<span class="mini obs">${esc(item.observacao)}</span>` : ''}
        </span>
        <span class="num linha-valor">${moeda(valor)}</span>
      </button>
    </li>`;
}

function barra(usado, limite, cor) {
  const pct = Math.min(100, Math.round(usado * 100 / limite));
  return `<div class="barra" role="img" aria-label="${pct}%"><span class="${cor}" style="width:${pct}%"></span></div>`;
}

export function telaMes(ctx) {
  const { dados, hoje } = ctx;
  const mes = ctx.mesVisto;
  const mesAtual = mesDe(hoje);
  const topo = `
    <header class="cabecalho cabecalho-nav">
      <button type="button" class="btn-nav" data-acao="mes-anterior" aria-label="Mês anterior">‹</button>
      <div><h1>${esc(nomeMes(mes))}</h1>${mes === mesAtual ? '<p class="sub">este mês</p>' : ''}</div>
      <button type="button" class="btn-nav" data-acao="mes-seguinte" aria-label="Próximo mês">›</button>
    </header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();

  const plano = calc.planoDoMes(dados, mes);
  if (plano.projetado && mes > mesAtual) return topo + mesProjetado(plano.itens, ctx);

  const r = calc.resumoMes(dados, mes, hoje);
  const salario = dados.config.salario;
  const sobraPrevista = salario - r.plano;
  const porCategoria = calc.gastosPorCategoria(dados, mes);
  const categorias = dados.categorias
    .map((c) => ({ ...c, total: porCategoria.get(c.id) ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const limites = calc.situacaoLimites(dados, mes);
  const lancamentos = dados.lancamentos.filter((l) => mesDe(l.data) === mes).sort(maisRecentes);

  return `${topo}
    <section class="cartao">
      <dl class="resumo">
        <div><dt>Entradas</dt><dd class="num">${moeda(r.entradas + r.resgates)}</dd></div>
        <div><dt>Contas do plano</dt><dd class="num">${menos(r.plano)}</dd></div>
        <div><dt>Gastos do dia a dia</dt><dd class="num">${menos(r.gastos)}</dd></div>
        ${r.depositos ? `<div><dt>Guardado fora do plano</dt><dd class="num">${menos(r.depositos)}</dd></div>` : ''}
        ${r.ajustes ? `<div><dt>Ajustes</dt><dd class="num">${r.ajustes > 0 ? '+' : '-'}${moeda(Math.abs(r.ajustes))}</dd></div>` : ''}
        <div class="total"><dt>Livre</dt><dd class="num${neg(r.livre)}">${moeda(r.livre)}</dd></div>
      </dl>
      ${!r.salarioCaiu ? `
        <p class="nota">Salário de ${moeda(salario)} ainda não caiu. Sobra prevista: <b class="num">${moeda(sobraPrevista)}</b>.</p>
        ${mes === mesAtual ? `<button type="button" class="btn-primario largo" data-acao="confirmar-salario">Salário caiu</button>` : ''}` : ''}
    </section>

    <section class="cartao">
      <h2>Contas do mês</h2>
      ${r.itens.length ? `
        <ul class="lista">${r.itens.map((i) => linhaItem(i, dados, hoje)).join('')}</ul>
        <p class="rodape num">Total ${moeda(r.plano)} · Falta pagar ${moeda(r.faltaPagar)}</p>`
        : '<p class="vazio">Nenhuma conta no plano deste mês.</p>'}
    </section>

    ${limites.length ? `
    <section class="cartao">
      <h2>Limites</h2>
      <ul class="lista limites">${limites.map((l) => `
        <li>
          <div class="limite-topo"><span>${esc(l.nome)}</span><span class="num">${moeda(l.usado)} de ${moeda(l.valor)}</span></div>
          ${barra(l.usado, l.valor, l.cor)}
        </li>`).join('')}
      </ul>
    </section>` : ''}

    <section class="cartao">
      <h2>Dia a dia por categoria</h2>
      ${categorias.length ? `<ul class="lista">${categorias.map((c) => `
        <li class="linha"><span class="icone" aria-hidden="true">${esc(c.icone ?? '')}</span>
          <span class="linha-texto"><span class="linha-titulo">${esc(c.nome)}</span></span>
          <span class="num linha-valor">${moeda(c.total)}</span></li>`).join('')}</ul>`
        : '<p class="vazio">Nenhum gasto do dia a dia ainda.</p>'}
    </section>

    <details class="cartao">
      <summary><h2>Lançamentos do mês (${lancamentos.length})</h2></summary>
      ${lancamentos.length ? `<ul class="lista">${lancamentos.map((l) => linhaLancamento(dados, l)).join('')}</ul>` : '<p class="vazio">Nenhum.</p>'}
    </details>

    ${mes === mesAtual ? proximosMeses(ctx) : ''}`;
}

// Mês futuro que ainda não tem plano: mostra o que deve vir
function mesProjetado(itens, ctx) {
  const { dados, hoje } = ctx;
  const total = calc.soma(itens, (i) => calc.valorItem(i, dados, hoje));
  const sobra = dados.config.salario - total;
  return `
    <section class="cartao">
      <p class="rotulo">Projeção</p>
      <dl class="resumo">
        <div><dt>Salário previsto</dt><dd class="num">${moeda(dados.config.salario)}</dd></div>
        <div><dt>Contas previstas</dt><dd class="num">${menos(total)}</dd></div>
        <div class="total"><dt>Sobra prevista</dt><dd class="num${neg(sobra)}">${moeda(sobra)}</dd></div>
      </dl>
      <p class="mini">O plano de verdade é montado quando o mês começar. Aqui entram as contas fixas ativas e as parcelas que vencem no mês.</p>
    </section>
    <section class="cartao">
      <h2>Contas previstas</h2>
      <ul class="lista">${itens.map((i) => `
        <li class="linha">
          <span class="check vazio-check" aria-hidden="true"></span>
          <span class="linha-texto"><span class="linha-titulo">${esc(i.nome)}</span>
            <span class="mini">${esc([i.vencimento ? `vence ${dataCurta(i.vencimento)}` : '', NOMES_TIPO[i.tipo]].filter(Boolean).join(' · '))}</span></span>
          <span class="num linha-valor">${moeda(calc.valorItem(i, dados, hoje))}</span>
        </li>`).join('')}</ul>
    </section>`;
}

function proximosMeses(ctx) {
  const { dados, hoje } = ctx;
  const meses = calc.projecao(dados, calc.somarMeses(mesDe(hoje), 1), 6, hoje);
  const maior = Math.max(...meses.map((m) => m.sobra), 1);
  return `
    <section class="cartao">
      <h2>Próximos meses</h2>
      <p class="mini">Quanto deve sobrar do salário depois das contas. Toca pra ver.</p>
      <ul class="lista">${meses.map((m) => `
        <li>
          <button type="button" class="botao-linha projecao" data-acao="ir-mes" data-mes="${m.mes}">
            <span class="linha-titulo">${esc(nomeMes(m.mes))}</span>
            <span class="barra"><span class="verde" style="width:${Math.max(0, Math.round(m.sobra * 100 / maior))}%"></span></span>
            <span class="num linha-valor${neg(m.sobra)}">${moeda(m.sobra)}</span>
          </button>
        </li>`).join('')}</ul>
    </section>`;
}

// Folha que abre ao tocar numa conta do mês
export function folhaItem(item, ctx) {
  const { dados, hoje } = ctx;
  const valor = calc.valorItem(item, dados, hoje);
  const cat = categoriaDe(dados, item.categoria_id);
  const fixa = dados.contas_fixas.find((c) => c.id === item.conta_fixa_id);
  const sub = [item.vencimento ? `vence ${dataBR(item.vencimento)}` : 'sem data', cat?.nome].filter(Boolean).join(' · ');
  const topo = `
    <div class="folha-topo"><h2 tabindex="-1" autofocus>${esc(item.nome)}</h2><button type="button" class="btn-fechar" data-fechar aria-label="Fechar">✕</button></div>
    <p class="sub">${esc(sub)}</p>
    ${item.observacao ? `<p class="mini obs">${esc(item.observacao)}</p>` : ''}`;

  if (pagoComFatura(item)) {
    return `${topo}
      <p class="nota">Essa conta é paga junto com a fatura do cartão. O valor que conta no plano agora é <b class="num">${moeda(valor)}</b>.</p>
      ${item.pago ? `<p class="mini">Fatura paga${item.pago_em ? ` em ${dataBR(item.pago_em)}` : ''}.</p>` : `
      <a class="btn-primario largo link-botao" href="#fatura" data-fechar>Ver a fatura</a>`}`;
  }

  if (item.pago) {
    const lanc = dados.lancamentos.find((l) => l.item_mes_id === item.id);
    return `${topo}
      <p class="nota">Pago${item.pago_em ? ` em ${dataBR(item.pago_em)}` : ''}: <b class="num">${moeda(valor)}</b>${lanc?.meio ? ` (${MEIOS[lanc.meio]})` : ''}.</p>
      <button type="button" class="btn-secundario" data-acao="desmarcar-item">Desmarcar pagamento</button>`;
  }

  const deposito = item.tipo === 'deposito';
  const meioPadrao = fixa?.meio && fixa.meio !== 'cartao' ? fixa.meio : 'pix';
  return `${topo}
    <form id="form-item" class="form">
      <label class="campo">Valor ${item.valor_real == null ? '(previsto, pode mudar)' : ''}
        <input name="valor" inputmode="decimal" autocomplete="off" value="${valorParaTexto(valor)}" required>
      </label>
      ${deposito ? '' : `
      <fieldset class="segmentado">
        <legend>Como pagou</legend>
        ${['pix', 'debito', 'boleto', 'dinheiro'].map((m) => `
          <label><input type="radio" name="meio" value="${m}"${m === meioPadrao ? ' checked' : ''}><span>${MEIOS[m]}</span></label>`).join('')}
      </fieldset>`}
      <label class="campo">Data <input type="date" name="data" value="${hoje}"></label>
      <button type="submit" class="btn-primario">${deposito ? 'Guardei' : 'Paguei'}</button>
      <button type="button" class="btn-secundario" data-acao="mudar-valor">Só atualizar o valor</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

// ---------- Conferir saldo ----------

export function telaConferir(ctx) {
  const { dados } = ctx;
  const topo = `
    <header class="cabecalho">
      <a href="#mais" class="voltar">‹ Mais</a>
      <h1>Conferir saldo</h1>
      <p class="sub">Confere se o app bate com a conta C6.</p>
    </header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();

  const r = calc.saldoEsperado(dados);
  const c = ctx.conferencia;
  let resultado = '';
  if (c) {
    if (c.diff === 0) {
      resultado = '<section class="cartao resultado ok"><p class="valor-medio">✅ Bateu certinho</p><p class="mini">Saldo conferido e salvo.</p></section>';
    } else if (c.ajustado) {
      resultado = `<section class="cartao resultado ok"><p class="valor-medio">Ajustado</p><p class="mini">Criei um ajuste de ${c.diff > 0 ? '+' : '-'}${moeda(Math.abs(c.diff))} e salvei o saldo de ${moeda(c.real)}.</p></section>`;
    } else {
      resultado = `
        <section class="cartao resultado alerta-cartao">
          <p class="rotulo">Diferença</p>
          <p class="valor-medio num">${moeda(Math.abs(c.diff))}</p>
          <p>O banco tem ${c.diff > 0 ? 'mais' : 'menos'} do que o app esperava (${moeda(c.esperado)}).</p>
          <p><b>Falta lançar algo?</b> Se lembrou, lança e confere de novo. Se não, ajusta.</p>
          <button type="button" class="btn-primario largo" data-acao="ajustar">Ajustar ${c.diff > 0 ? '+' : '-'}${moeda(Math.abs(c.diff))}</button>
          <button type="button" class="btn-secundario" data-acao="cancelar-conferencia">Vou lançar o que falta</button>
        </section>`;
    }
  }

  return `${topo}
    ${r ? `
    <section class="cartao">
      <dl class="resumo">
        <div><dt>Último conferido (${dataCurta(r.base.data)})</dt><dd class="num">${moeda(r.base.saldo)}</dd></div>
        <div><dt>Entrou na conta</dt><dd class="num">+${moeda(calc.soma(r.movimentos.filter((m) => calc.efeitoNaConta(m) > 0), calc.efeitoNaConta))}</dd></div>
        <div><dt>Saiu da conta</dt><dd class="num">${menos(-calc.soma(r.movimentos.filter((m) => calc.efeitoNaConta(m) < 0), calc.efeitoNaConta))}</dd></div>
        <div class="total"><dt>Esperado agora</dt><dd class="num">${moeda(r.esperado)}</dd></div>
      </dl>
      <p class="mini">Compras no cartão e em dinheiro vivo não contam aqui. O cartão só sai da conta quando a fatura é paga.</p>
    </section>` : '<section class="cartao"><p class="vazio">Ainda não tem saldo conferido. O primeiro que você digitar vira o ponto de partida.</p></section>'}

    <form id="form-conferir" class="cartao form">
      <label class="campo">Quanto tem na conta C6 agora?
        <input name="saldo" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
      </label>
      <button type="submit" class="btn-primario">Conferir</button>
      <p class="erro" role="alert"></p>
    </form>
    ${resultado}`;
}

// ---------- Dívidas e Comprar (próximas fases) ----------

const SELO_DIVIDA = { ativa: 'Ativa', planejada: 'Planejada', a_pagar: 'A pagar', quitada: 'Quitada' };

function cartaoDividaParcelada(d, r) {
  const pct = r.total ? Math.round(r.pagas * 100 / r.total) : 0;
  return `
    <section class="cartao divida">
      <div class="cartao-topo"><h2>${esc(d.nome)}</h2><span class="selo ${d.status}">${SELO_DIVIDA[d.status]}</span></div>
      ${d.credor ? `<p class="mini">${esc(d.credor)}</p>` : ''}
      ${r.total ? `
        <div class="barra grossa" role="img" aria-label="${r.pagas} de ${r.total} pagas"><span class="verde" style="width:${pct}%"></span></div>
        <p class="mini">${r.pagas} de ${r.total} pagas</p>` : ''}
      <dl class="resumo">
        ${r.proxima ? `<div><dt>Próxima</dt><dd class="num">${dataCurta(r.proxima.vencimento)} · ${moeda(r.proxima.valor)}</dd></div>` : ''}
        <div><dt>Falta</dt><dd class="num forte">${moeda(r.falta)}</dd></div>
        ${r.ultima ? `<div><dt>Acaba em</dt><dd>${esc(nomeMes(mesDe(r.ultima.vencimento)))}</dd></div>` : ''}
      </dl>
      ${d.observacoes ? `<details><summary class="mini">Observações</summary><p class="mini">${esc(d.observacoes)}</p></details>` : ''}
    </section>`;
}

function cartaoDividaSemData(d, dados, hoje) {
  const passos = dados.passos_divida.filter((p) => p.divida_id === d.id).sort((a, b) => a.ordem - b.ordem);
  const dias = d.prazo ? calc.diasEntre(hoje, d.prazo) : null;
  return `
    <section class="cartao divida">
      <div class="cartao-topo"><h2>${esc(d.nome)}</h2><span class="selo ${d.status}">${SELO_DIVIDA[d.status]}</span></div>
      ${d.credor ? `<p class="mini">${esc(d.credor)}</p>` : ''}
      <p class="valor-medio num">${moeda(d.valor_negociado ?? d.valor_original ?? 0)}</p>
      ${d.valor_negociado != null && d.valor_original != null
        ? `<p class="mini">com desconto · sem desconto: <s>${moeda(d.valor_original)}</s></p>` : ''}
      ${d.prazo ? `<p class="nota${dias != null && dias <= 30 ? ' aviso-cartao' : ''}">⏳ Prazo: ${dataBR(d.prazo)}${dias >= 0 ? ` (faltam ${dias} dias)` : ' (passou)'}</p>` : ''}
      ${passos.length ? `<ul class="lista passos">${passos.map((p) => `
        <li><button type="button" class="botao-linha passo${p.feito ? ' pago' : ''}" data-acao="passo" data-id="${p.id}">
          <span class="check${p.feito ? ' marcado' : ''}" aria-hidden="true"></span>
          <span class="linha-texto"><span class="linha-titulo">${esc(p.descricao)}</span>${p.data ? `<span class="mini">${dataBR(p.data)}</span>` : ''}</span>
        </button></li>`).join('')}</ul>` : ''}
      ${d.observacoes ? `<p class="mini obs">${esc(d.observacoes)}</p>` : ''}
      ${d.link ? `<a class="btn-secundario link-botao" href="${esc(d.link)}" target="_blank" rel="noopener">Abrir site ›</a>` : ''}
    </section>`;
}

export function telaDividas(ctx) {
  const { dados, hoje } = ctx;
  const topo = `<header class="cabecalho"><h1>Dívidas</h1></header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();

  const total = calc.totalDevo(dados);
  const comResumo = dados.dividas.map((d) => ({ d, r: calc.resumoDivida(d, dados.parcelas) }));
  const parceladas = comResumo.filter(({ d, r }) => d.status !== 'quitada' && r.pendentes.length);
  const semData = comResumo.filter(({ d, r }) => d.status !== 'quitada' && !r.pendentes.length);
  const quitadas = comResumo.filter(({ d }) => d.status === 'quitada');
  const tempo = calc.linhaDoTempo(dados);

  return `${topo}
    <section class="cartao destaque">
      <p class="rotulo">Ainda devo</p>
      <p class="valor-grande num">${moeda(total.total)}</p>
      <p class="linha-sub">Parcelado: ${moeda(total.parcelado)} · Sem data: ${moeda(total.semData)}</p>
    </section>

    ${tempo.length ? `
    <section class="cartao">
      <h2>Quando o dinheiro libera</h2>
      <ul class="lista tempo">${tempo.map((p) => `
        <li class="linha">
          <span class="icone" aria-hidden="true">🔓</span>
          <span class="linha-texto">
            <span class="linha-titulo">${esc(nomeMes(p.mes))}: +${moeda(p.valor)} por mês</span>
            <span class="mini">${esc(p.dividas.join(' e '))} acaba${p.dividas.length > 1 ? 'm' : ''}. A partir daí sobram +${moeda(p.acumulado)} por mês.</span>
          </span>
        </li>`).join('')}</ul>
    </section>` : ''}

    ${parceladas.map(({ d, r }) => cartaoDividaParcelada(d, r)).join('')}

    ${semData.length ? `<h2 class="secao">A pagar, sem data</h2>
      ${semData.map(({ d }) => cartaoDividaSemData(d, dados, hoje)).join('')}` : ''}

    ${quitadas.length ? `
    <details class="cartao">
      <summary><h2>Quitadas (${quitadas.length}) 🎉</h2></summary>
      <ul class="lista">${quitadas.map(({ d }) => `
        <li class="linha"><span class="icone" aria-hidden="true">✅</span>
          <span class="linha-texto"><span class="linha-titulo">${esc(d.nome)}</span>
          ${d.quitada_em ? `<span class="mini">quitada em ${dataBR(d.quitada_em)}</span>` : ''}</span>
          <span class="num linha-valor">${moeda(d.valor_negociado ?? d.valor_original ?? 0)}</span></li>`).join('')}</ul>
    </details>` : ''}`;
}

// ---------- Fatura do cartão ----------

function deOndeSai(f) {
  const nomeDoMes = nomeMes(f.mes);
  const linhas = [
    ['Compras antigas', f.origem.antigas, `no plano de ${nomeDoMes}`],
    ['Uber', f.origem.uber, `no plano de ${nomeDoMes}`],
    ['Assinaturas', f.origem.assinaturas, `no plano de ${nomeDoMes}`],
    ['Outras compras', f.origem.reservado, 'Reservado pra fatura'],
  ].filter(([, valor]) => valor > 0);
  if (!linhas.length) return '<p class="vazio">Nenhuma compra nessa fatura.</p>';
  return `<dl class="resumo">${linhas.map(([nome, valor, onde]) => `
    <div><dt>${nome}<br><span class="mini">${onde}</span></dt><dd class="num">${moeda(valor)}</dd></div>`).join('')}</dl>`;
}

function cartaoFatura(f, ctx) {
  const { dados } = ctx;
  let status;
  if (f.pagamento) status = `Paga em ${dataCurta(f.pagamento.data)}`;
  else if (f.fechada) status = `Fechou ${dataCurta(f.fecha)} · vence ${dataCurta(f.vence)}`;
  else status = `Aberta · fecha ${dataCurta(f.fecha)} · vence ${dataCurta(f.vence)}`;
  const compras = [...f.compras].sort(maisRecentes);
  return `
    <section class="cartao${!f.pagamento && f.fechada ? ' alerta-cartao' : ''}">
      <div class="cartao-topo">
        <h2>Fatura de ${dataCurta(f.vence)}</h2>
        <p class="valor-medio num">${moeda(f.pagamento ? f.pagamento.valor : f.total)}</p>
      </div>
      <p class="mini">${status}</p>
      <div class="tres">
        <div><p class="mini">Uber</p><p class="num">${moeda(f.uber)}</p></div>
        <div><p class="mini">Assinaturas</p><p class="num">${moeda(f.assinaturas)}</p></div>
        <div><p class="mini">Outras</p><p class="num">${moeda(f.outras)}</p></div>
      </div>
      ${f.pagamento ? '' : `
        <h3 class="sub-titulo">De onde sai o dinheiro</h3>
        ${deOndeSai(f)}
        ${f.fechada
          ? `<button type="button" class="btn-primario largo" data-acao="abrir-pagar-fatura" data-mes="${f.mes}">Pagar fatura</button>`
          : `<p class="mini">Dá pra pagar quando fechar, dia ${dataCurta(f.fecha)}.</p>`}`}
      ${compras.length || f.itensAssinatura.length ? `
      <details>
        <summary class="mini">Ver compras (${compras.length + f.itensAssinatura.length})</summary>
        <ul class="lista">
          ${f.itensAssinatura.map((i) => `
            <li class="linha"><span class="icone" aria-hidden="true">📄</span>
              <span class="linha-texto"><span class="linha-titulo">${esc(i.nome)}</span><span class="mini">assinatura · no plano</span></span>
              <span class="num linha-valor">${moeda(i.valor_real ?? i.valor_previsto)}</span></li>`).join('')}
          ${compras.map((l) => linhaLancamento(dados, l)).join('')}
        </ul>
      </details>` : ''}
    </section>`;
}

export function telaFatura(ctx) {
  const { dados, hoje } = ctx;
  const topo = `
    <header class="cabecalho">
      <a href="#hoje" class="voltar">‹ Hoje</a>
      <h1>Cartão C6</h1>
      ${dados?.config ? `<p class="sub">Fecha dia ${dados.config.cartao_fecha_dia} · vence dia ${dados.config.cartao_vence_dia}</p>` : ''}
    </header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();

  const paraPagar = calc.faturasParaPagar(dados, hoje);
  const aberta = calc.faturaAberta(dados, hoje);
  const pagas = dados.lancamentos
    .filter((l) => l.tipo === 'pagamento_fatura')
    .sort(maisRecentes)
    .slice(0, 3)
    .map((l) => calc.detalheFatura(dados, l.fatura_mes, hoje));
  const reservado = calc.reservadoFatura(dados.lancamentos);

  return `${topo}
    ${paraPagar.map((f) => cartaoFatura(f, ctx)).join('')}
    ${cartaoFatura(aberta, ctx)}
    <section class="cartao linha-unica">
      <span>Reservado pra fatura<br><span class="mini">compras fora da regra, já tiradas do Livre</span></span>
      <span class="num forte">${moeda(reservado)}</span>
    </section>
    ${pagas.length ? `
    <details class="cartao">
      <summary><h2>Pagas</h2></summary>
      <ul class="lista">${pagas.map((f) => `
        <li class="linha"><span class="icone" aria-hidden="true">✅</span>
          <span class="linha-texto"><span class="linha-titulo">Fatura de ${dataCurta(f.vence)}</span>
          <span class="mini">paga em ${dataBR(f.pagamento.data)}</span></span>
          <span class="num linha-valor">${moeda(f.pagamento.valor)}</span></li>`).join('')}</ul>
    </details>` : ''}`;
}

export function folhaPagarFatura(f, ctx) {
  return `
    <div class="folha-topo"><h2 tabindex="-1" autofocus>Pagar fatura de ${dataCurta(f.vence)}</h2><button type="button" class="btn-fechar" data-fechar aria-label="Fechar">✕</button></div>
    <p class="sub">Pagar a fatura não é gasto novo: o dinheiro já estava separado.</p>
    ${deOndeSai(f)}
    <form id="form-fatura" class="form" data-mes="${f.mes}">
      <label class="campo">Quanto o banco cobrou?
        <input name="valor" inputmode="decimal" autocomplete="off" value="${valorParaTexto(f.total)}" required>
      </label>
      <label class="campo">Data do pagamento <input type="date" name="data" value="${ctx.hoje}"></label>
      <p class="mini">O app esperava ${moeda(f.total)}. Se o banco cobrou diferente, a diferença entra como ajuste no seu Livre do mês.</p>
      <button type="submit" class="btn-primario">Paguei a fatura</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

// ---------- Caixinhas (Reserva no CDB) ----------

export function telaCaixinhas(ctx) {
  const { dados } = ctx;
  const topo = `
    <header class="cabecalho">
      <a href="#hoje" class="voltar">‹ Hoje</a>
      <h1>Reserva</h1>
    </header>${avisoOffline(ctx)}`;
  if (!dados) return topo + carregando(ctx);
  if (!dados.config) return topo + cartaoImportar();

  return topo + dados.caixinhas.map((c) => {
    const historico = dados.lancamentos.filter((l) => l.caixinha_id === c.id).sort(maisRecentes);
    return `
      <section class="cartao destaque">
        <p class="rotulo">${esc(c.nome)}</p>
        <p class="valor-grande num">${moeda(calc.saldoCaixinha(c, dados.lancamentos))}</p>
        ${c.observacao ? `<p class="mini">${esc(c.observacao)}</p>` : ''}
        <div class="botoes-lado">
          <button type="button" class="btn-primario" data-acao="abrir-caixinha" data-id="${c.id}" data-tipo="deposito_caixinha">Guardar</button>
          <button type="button" class="btn-secundario" data-acao="abrir-caixinha" data-id="${c.id}" data-tipo="resgate_caixinha">Resgatar</button>
        </div>
      </section>
      <section class="cartao">
        <h2>Histórico</h2>
        ${historico.length ? `<ul class="lista">${historico.map((l) => linhaLancamento(dados, l)).join('')}</ul>` : '<p class="vazio">Nada ainda.</p>'}
      </section>`;
  }).join('');
}

export function folhaCaixinha(caixinha, tipo, ctx) {
  const guardar = tipo === 'deposito_caixinha';
  return `
    <div class="folha-topo"><h2 tabindex="-1" autofocus>${guardar ? 'Guardar' : 'Resgatar'}: ${esc(caixinha.nome)}</h2><button type="button" class="btn-fechar" data-fechar aria-label="Fechar">✕</button></div>
    <p class="sub">${guardar
      ? 'Sai da conta C6 e do seu Livre do mês. (A conta "Guardar no CDB" do plano você marca na aba Mês.)'
      : 'Volta pra conta C6 e entra no seu Livre do mês.'}</p>
    <form id="form-caixinha" class="form" data-id="${caixinha.id}" data-tipo="${tipo}">
      <label class="campo">Valor <input name="valor" inputmode="decimal" autocomplete="off" placeholder="0,00" required></label>
      <label class="campo">Descrição <input name="descricao" autocomplete="off" placeholder="opcional"></label>
      <label class="campo">Data <input type="date" name="data" value="${ctx.hoje}"></label>
      <button type="submit" class="btn-primario">${guardar ? 'Guardei' : 'Resgatei'}</button>
      <p class="erro" role="alert"></p>
    </form>`;
}

export function telaComprar(ctx) {
  return `
    <header class="cabecalho"><h1>Comprar</h1><p class="sub">Coisas que você quer, esperando a hora certa.</p></header>${avisoOffline(ctx)}
    <section class="cartao"><p class="vazio">A lista com links da Amazon, Mercado Livre e Shopee chega na Fase 4.</p></section>`;
}

// ---------- Mais ----------

export function telaMais(ctx) {
  const { dados } = ctx;
  const importar = dados && !dados.config ? `
    <section class="cartao">
      <h2>Importar dados iniciais</h2>
      <p class="vazio">Escolhe o arquivo <b>dados-iniciais.json</b>. Faz isso uma vez só. Os dados vão direto pro seu Supabase.</p>
      <label class="btn-primario largo arquivo">Escolher arquivo
        <input type="file" id="arquivo-importar" accept=".json,application/json">
      </label>
      <p class="erro" id="erro-importar" role="alert"></p>
    </section>` : '';

  return `
    <header class="cabecalho">
      <h1>Mais</h1>
      <p class="sub">${esc(ctx.usuario?.email ?? '')}</p>
    </header>${avisoOffline(ctx)}
    ${importar}
    <nav class="cartao menu">
      <a href="#conferir"><span>🏦 Conferir saldo</span><span aria-hidden="true">›</span></a>
    </nav>
    <section class="cartao">
      <h2>Regras de ouro</h2>
      <ol class="regras">${REGRAS_DE_OURO.map((r) => `<li>${r}</li>`).join('')}</ol>
    </section>
    <section class="cartao">
      <button type="button" class="btn-secundario" data-acao="sair">Sair</button>
    </section>`;
}
