// O que acontece nos toques da rotina: Comprar, A receber, Configurações, fechar mês e exportar.
// O app.js passa as ferramentas dele (estado, gravar na tela, avisos) no "api".
import { inserir, atualizar, apagar } from './db.js';
import { hoje as hojeSP, lerValor, moeda, nomeMes } from './format.js';
import { faturaDaCompra, somarMeses, dataNoMes, resumoMes } from './calc.js';
import { nomeDoLink, linkWhatsApp } from './links.js';
import { backupJSON, csvDoMes } from './exportar.js';
import * as rt from './telas-rotina.js';

// Erro de preenchimento (mostra a mensagem como está)
class Aviso extends Error {}

export function criarRotina(api) {
  const { estado, trocar, salvarCache, render, avisar, abrirFolha, fecharFolha, ctx, recarregar } = api;
  const achar = (tabela, id) => estado.dados[tabela].find((x) => x.id === id);
  const tirar = (tabela, id) => { estado.dados[tabela] = estado.dados[tabela].filter((x) => x.id !== id); };
  const novoId = () => crypto.randomUUID();

  // ---------- Toques nas telas ----------
  const FOLHAS = {
    'novo-desejo': () => rt.folhaDesejo(null, ctx()),
    'editar-desejo': (id) => rt.folhaDesejo(achar('desejos', id), ctx()),
    comprei: (id) => rt.folhaComprei(achar('desejos', id), ctx()),
    'novo-receber': () => rt.folhaReceber(null, ctx()),
    'editar-receber': (id) => rt.folhaReceber(achar('a_receber', id), ctx()),
    cobrar: (id) => rt.folhaCobrar(achar('a_receber', id)),
    recebi: (id) => rt.folhaRecebi(achar('a_receber', id), ctx()),
    'editar-config': () => rt.folhaConfig(ctx()),
    'nova-conta-fixa': () => rt.folhaContaFixa(null, ctx()),
    'editar-conta-fixa': (id) => rt.folhaContaFixa(achar('contas_fixas', id), ctx()),
    'novo-limite': () => rt.folhaLimite(null, ctx()),
    'editar-limite': (id) => rt.folhaLimite(achar('limites', id), ctx()),
    'nova-categoria': () => rt.folhaCategoria(null),
    'editar-categoria': (id) => rt.folhaCategoria(achar('categorias', id)),
  };

  // Devolve true se a ação era dela
  async function clique(acao, alvo) {
    if (FOLHAS[acao]) { abrirFolha(FOLHAS[acao](alvo.dataset.id)); return true; }
    if (acao === 'nova-avulsa') { abrirFolha(rt.folhaAvulsa(alvo.dataset.mes, ctx())); return true; }
    if (acao === 'fechar-mes') { await fecharMes(alvo.dataset.mes, alvo.dataset.destino, alvo); return true; }
    if (acao === 'exportar-json') {
      await baixar(`pila-backup-${hojeSP()}.json`, backupJSON(estado.dados), 'application/json');
      return true;
    }
    if (acao === 'exportar-csv') {
      const mes = estado.mesVisto;
      await baixar(`pila-${mes}.csv`, csvDoMes(estado.dados, mes), 'text/csv');
      return true;
    }
    return false;
  }

  // ---------- Formulários das folhas ----------
  // Devolve a mensagem do aviso, ou null se a folha deve ficar aberta
  const ENVIOS = {
    async 'form-desejo'(f, form) {
      const preco = f.preco.value.trim() ? lerValor(f.preco.value) : null;
      if (preco != null && preco <= 0) throw new Aviso('Preço inválido.');
      const campos = {
        nome: f.nome.value.trim(), link: f.link.value.trim() || null, preco,
        pra_quem: f.pra_quem.value.trim() || null, prioridade: Number(f.prioridade.value || 2),
        plano: f.plano.value.trim() || null, parcelado: f.parcelado.checked, observacao: f.observacao.value.trim() || null,
      };
      if (!campos.nome) throw new Aviso('Diz o que é.');
      if (form.dataset.id) trocar('desejos', await atualizar('desejos', form.dataset.id, campos));
      else trocar('desejos', (await inserir('desejos', [campos]))[0]);
      return form.dataset.id ? 'Salvo.' : 'Salvo. Agora espera 2 dias.';
    },

    async 'form-comprei'(f, form) {
      const desejo = achar('desejos', form.dataset.id);
      const valor = lerValor(f.valor.value);
      if (!valor || valor <= 0) throw new Aviso('Valor inválido.');
      const categoria = achar('categorias', f.categoria.value);
      if (!categoria) throw new Aviso('Escolhe uma categoria.');
      const meio = f.meio.value || 'pix';
      const data = f.data.value || hojeSP();
      const { cartao_fecha_dia: fecha, cartao_vence_dia: vence } = estado.dados.config;
      const cartao = meio === 'cartao';
      const [l] = await inserir('lancamentos', [{
        cliente_id: novoId(), data, valor, tipo: 'gasto', meio, categoria_id: categoria.id, descricao: desejo.nome,
        fatura_mes: cartao ? faturaDaCompra(data, fecha, vence) : null,
        regra_cartao: cartao ? (categoria.nome === 'Transporte' ? 'uber' : 'outra') : null,
      }]);
      trocar('lancamentos', l);
      trocar('desejos', await atualizar('desejos', desejo.id, { comprado_em: data, lancamento_id: l.id }));
      return `Comprado! ${api.textoPorDia()}`;
    },

    async 'form-receber'(f, form) {
      const valor = lerValor(f.valor.value);
      if (!valor || valor <= 0) throw new Aviso('Valor inválido.');
      const campos = {
        quem: f.quem.value.trim(), valor, motivo: f.motivo.value.trim() || null,
        telefone: f.telefone.value.trim() || null, data: f.data.value || null,
      };
      if (!campos.quem) throw new Aviso('Diz quem te deve.');
      if (form.dataset.id) trocar('a_receber', await atualizar('a_receber', form.dataset.id, campos));
      else trocar('a_receber', (await inserir('a_receber', [campos]))[0]);
      return 'Salvo.';
    },

    async 'form-cobrar'(f, form) {
      const r = achar('a_receber', form.dataset.id);
      const telefone = f.telefone.value.trim() || null;
      window.open(linkWhatsApp(telefone, f.mensagem.value), '_blank');
      // Guarda o telefone pra próxima vez
      if (telefone && telefone !== r.telefone) trocar('a_receber', await atualizar('a_receber', r.id, { telefone }));
      return 'Abrindo o WhatsApp...';
    },

    async 'form-recebi'(f, form) {
      const r = achar('a_receber', form.dataset.id);
      const valor = lerValor(f.valor.value);
      if (!valor || valor <= 0) throw new Aviso('Valor inválido.');
      const data = f.data.value || hojeSP();
      const [l] = await inserir('lancamentos', [{
        cliente_id: novoId(), data, valor, tipo: 'entrada', meio: f.meio.value || 'pix', descricao: `Recebi de ${r.quem}`,
      }]);
      trocar('lancamentos', l);
      trocar('a_receber', await atualizar('a_receber', r.id, { recebido_em: data, lancamento_id: l.id }));
      return `Recebido. ${api.textoPorDia()}`;
    },

    async 'form-config'(f) {
      const salario = lerValor(f.salario.value);
      const dia = (campo) => {
        const n = Number(f[campo].value);
        if (!Number.isInteger(n) || n < 1 || n > 31) throw new Aviso('Os dias vão de 1 a 31.');
        return n;
      };
      if (salario == null || salario < 0) throw new Aviso('Salário inválido.');
      const campos = {
        salario, dia_salario: dia('dia_salario'), cartao_fecha_dia: dia('cartao_fecha_dia'), cartao_vence_dia: dia('cartao_vence_dia'),
      };
      estado.dados.config = await atualizar('config', estado.dados.config.id, campos);
      return 'Configuração salva.';
    },

    async 'form-conta-fixa'(f, form) {
      const valor = lerValor(f.valor.value);
      if (valor == null || valor < 0) throw new Aviso('Valor inválido.');
      const dia = f.dia.value.trim() ? Number(f.dia.value) : null;
      if (dia != null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) throw new Aviso('O dia vai de 1 a 31.');
      const tipo = f.tipo.value;
      const campos = {
        nome: f.nome.value.trim(), tipo, valor_previsto: valor, dia,
        categoria_id: f.categoria.value || null, meio: f.meio.value || null, quem: f.quem.value.trim() || null,
        ativa: f.ativa.checked,
        caixinha_id: tipo === 'deposito' ? (estado.dados.caixinhas[0]?.id ?? null) : null,
      };
      if (!campos.nome) throw new Aviso('Dá um nome pra conta.');
      if (form.dataset.id) trocar('contas_fixas', await atualizar('contas_fixas', form.dataset.id, campos));
      else trocar('contas_fixas', (await inserir('contas_fixas', [{ ...campos, ordem: estado.dados.contas_fixas.length }]))[0]);
      return 'Conta fixa salva. Vale a partir do próximo mês.';
    },

    async 'form-limite'(f, form) {
      const valor = lerValor(f.valor.value);
      if (!valor || valor <= 0) throw new Aviso('Valor inválido.');
      const categorias = [...form.querySelectorAll('input[name="categorias"]:checked')].map((c) => c.value);
      if (!categorias.length) throw new Aviso('Escolhe pelo menos uma categoria.');
      const campos = { mes: f.mes.value, nome: f.nome.value.trim(), valor, categorias };
      if (!campos.nome || !campos.mes) throw new Aviso('Preenche o mês e o nome.');
      if (form.dataset.id) trocar('limites', await atualizar('limites', form.dataset.id, campos));
      else trocar('limites', (await inserir('limites', [campos]))[0]);
      return 'Limite salvo.';
    },

    async 'form-categoria'(f, form) {
      const campos = { nome: f.nome.value.trim(), icone: f.icone.value.trim() || null };
      if (!campos.nome) throw new Aviso('Dá um nome pra categoria.');
      if (form.dataset.id) trocar('categorias', await atualizar('categorias', form.dataset.id, campos));
      else trocar('categorias', (await inserir('categorias', [{ ...campos, ordem: estado.dados.categorias.length }]))[0]);
      return 'Categoria salva.';
    },

    async 'form-avulsa'(f, form) {
      const valor = lerValor(f.valor.value);
      if (!valor || valor <= 0) throw new Aviso('Valor inválido.');
      const nome = f.nome.value.trim();
      if (!nome) throw new Aviso('Diz o que é.');
      trocar('itens_mes', (await inserir('itens_mes', [{
        mes: form.dataset.mes, nome, tipo: 'avulsa', valor_previsto: valor,
        vencimento: f.vencimento.value || null, categoria_id: f.categoria.value || null, ordem: 99,
      }]))[0]);
      return `${nome} entrou no plano de ${nomeMes(form.dataset.mes)}.`;
    },
  };

  async function enviar(form) {
    const envio = ENVIOS[form.id];
    if (!envio) return false;
    const erro = form.querySelector('.erro');
    const botao = form.querySelector('[type=submit]');
    if (erro) erro.textContent = '';
    try {
      botao.disabled = true;
      const mensagem = await envio(form.elements, form);
      salvarCache();
      fecharFolha();
      render();
      avisar(mensagem);
    } catch (e) {
      console.warn(e);
      if (erro) erro.textContent = e instanceof Aviso ? e.message : 'Não deu pra salvar. Confere a internet e tenta de novo.';
    } finally {
      botao.disabled = false;
    }
    return true;
  }

  // ---------- Botões de apagar dentro das folhas ----------
  const APAGAR = {
    'apagar-desejo': ['desejos', 'Tirar da lista?'],
    'apagar-receber': ['a_receber', 'Apagar?'],
    'apagar-conta-fixa': ['contas_fixas', 'Apagar essa conta fixa? Ela some dos próximos meses (os meses que já existem ficam como estão).'],
    'apagar-limite': ['limites', 'Apagar esse limite?'],
    'apagar-categoria': ['categorias', 'Apagar essa categoria? Os lançamentos dela ficam sem categoria.'],
  };

  async function cliqueFolha(acao, alvo) {
    if (!APAGAR[acao]) return false;
    const [tabela, pergunta] = APAGAR[acao];
    const id = alvo.closest('form').dataset.id;
    if (!confirm(pergunta)) return true;
    try {
      alvo.disabled = true;
      await apagar(tabela, id);
      tirar(tabela, id);
      fecharFolha();
      // Categoria e conta fixa apagadas deixam referências vazias em outras tabelas: busca tudo de novo
      if (tabela === 'categorias' || tabela === 'contas_fixas') await recarregar();
      else { salvarCache(); render(); }
      avisar('Apagado.');
    } catch (e) {
      console.warn(e);
      avisar('Não deu pra apagar. Confere a internet e tenta de novo.', 'erro');
    } finally {
      alvo.disabled = false;
    }
    return true;
  }

  // Colou o link: tenta preencher o nome sozinho
  function digitou(e) {
    const campo = e.target;
    if (campo.name !== 'link' || campo.form?.id !== 'form-desejo') return;
    const nome = campo.form.elements.nome;
    if (nome.value.trim()) return;
    const sugestao = nomeDoLink(campo.value);
    if (sugestao) nome.value = sugestao;
  }

  // ---------- Fechar o mês ----------
  // A sobra do mês que acabou vai pra Reserva ou pro mês seguinte. Os ajustes deixam
  // o Livre de cada mês certo sem mexer na conferência com o banco.
  async function fecharMes(mes, destino, botao) {
    const ultimoDia = dataNoMes(mes, 31);
    const proximo = somarMeses(mes, 1);
    const sobra = resumoMes(estado.dados, mes, ultimoDia).livre;
    const hoje = hojeSP();
    const novos = [];
    if (destino === 'reserva' && sobra > 0) {
      const reserva = estado.dados.caixinhas[0];
      if (!reserva) { avisar('Não achei a Reserva.', 'erro'); return; }
      // Sai da conta hoje (pra conferência bater) e não mexe no Livre do mês de agora
      novos.push(
        { tipo: 'deposito_caixinha', valor: sobra, data: hoje, caixinha_id: reserva.id, descricao: `Sobra de ${nomeMes(mes)} pra Reserva` },
        { tipo: 'ajuste', valor: sobra, data: hoje, descricao: `Sobra de ${nomeMes(mes)} (já guardada)` },
        { tipo: 'ajuste', valor: -sobra, data: ultimoDia, descricao: 'Sobra foi pra Reserva' },
      );
    } else if (destino === 'proximo_mes' && sobra !== 0) {
      novos.push(
        { tipo: 'ajuste', valor: -sobra, data: ultimoDia, descricao: `Sobra levada pra ${nomeMes(proximo)}` },
        { tipo: 'ajuste', valor: sobra, data: `${proximo}-01`, descricao: `Sobra de ${nomeMes(mes)}` },
      );
    }
    try {
      botao.disabled = true;
      if (novos.length) {
        for (const l of await inserir('lancamentos', novos.map((n) => ({ cliente_id: novoId(), ...n })))) trocar('lancamentos', l);
      }
      const campos = { fechado_em: new Date().toISOString(), sobra, destino_sobra: destino === 'nada' ? null : destino };
      const existente = estado.dados.meses.find((m) => m.mes === mes);
      if (existente) trocar('meses', await atualizar('meses', existente.id, campos));
      else trocar('meses', (await inserir('meses', [{ mes, ...campos }]))[0]);
      salvarCache();
      render();
      if (destino === 'reserva') avisar(`${moeda(sobra)} foram pra Reserva. 💪`);
      else if (destino === 'proximo_mes') avisar(sobra > 0 ? `${moeda(sobra)} entraram em ${nomeMes(proximo)}.` : `${moeda(-sobra)} saíram de ${nomeMes(proximo)}.`);
      else avisar(`${nomeMes(mes)} fechado.`);
    } catch (e) {
      console.warn(e);
      avisar('Não deu pra fechar o mês. Confere a internet e tenta de novo.', 'erro');
    } finally {
      botao.disabled = false;
    }
  }

  // ---------- Exportar ----------
  // No celular abre o "compartilhar" (salvar em Arquivos, mandar pra si mesmo...). No computador, baixa.
  async function baixar(nome, texto, tipo) {
    const arquivo = new File([texto], nome, { type: tipo });
    const celular = matchMedia('(pointer: coarse)').matches;
    if (celular && navigator.canShare?.({ files: [arquivo] })) {
      try { await navigator.share({ files: [arquivo], title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    avisar(`Baixado: ${nome}`);
  }

  return { clique, enviar, cliqueFolha, digitou };
}
