// Função do Supabase: o aviso das 9h no iPhone.
// Todo dia: quanto dá pra gastar hoje e por dia (a mesma conta da tela Hoje) e as contas vencendo.
//
// Quem chama:
//   - o agendamento (pg_cron), todo dia às 9h de Brasília, com o cabeçalho x-pila-segredo
//   - o próprio app, logado, pra mandar um aviso de teste
//
// Segredos (Supabase > Edge Functions > Secrets):
//   PILA_VAPID    chaves do serviço de notificação (JSON)
//   PILA_SEGREDO  senha que só o agendamento conhece
// O Supabase já dá SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY pra função.
//
// As contas vêm do próprio app (calc.js), numa versão fixa do GitHub servida pelo jsDelivr.
// Mudou alguma regra no calc.js? Troque o código da versão (o commit) abaixo e publique a função de novo.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.115.0';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { resumoMes, gastosDoDia, quantoPossoGastar, mesSemPlano } from 'https://cdn.jsdelivr.net/gh/Pipinho548/pila@4380c356bace13d74457090136da83aada7db52c/js/calc.js';
import { mesDe, nomeMes } from 'https://cdn.jsdelivr.net/gh/Pipinho548/pila@4380c356bace13d74457090136da83aada7db52c/js/format.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (centavos: number) => dinheiro.format(centavos / 100);

// Hoje em São Paulo, 'AAAA-MM-DD'
function hojeSP(): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function somarDias(data: string, n: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

const dataCurta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

type Aviso = { titulo: string; corpo: string };
// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>;

// Tudo de uma tabela desse usuário (o Supabase devolve no máximo 1000 linhas por vez)
async function tabela(admin: Admin, nome: string, usuario: string) {
  const linhas: Record<string, unknown>[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from(nome).select('*').eq('user_id', usuario)
      .order('created_at').range(de, de + 999);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < 1000) return linhas;
  }
}

// Os dados que a tela Hoje usa pra calcular o "ainda dá hoje"
async function carregarDados(admin: Admin, usuario: string) {
  const nomes = ['config', 'categorias', 'contas_fixas', 'dividas', 'parcelas', 'itens_mes', 'lancamentos'];
  const tabelas = await Promise.all(nomes.map((n) => tabela(admin, n, usuario)));
  const dados: Record<string, unknown> = Object.fromEntries(nomes.map((n, i) => [n, tabelas[i]]));
  dados.config = (dados.config as unknown[])[0] ?? null;
  return dados;
}

// Quanto dá pra gastar hoje e por dia, igual à tela Hoje
function quantoDa(dados: any, hoje: string): Aviso | null {
  if (!dados.config) return null;
  const semPlano = mesSemPlano(dados, hoje);
  if (semPlano) {
    return { titulo: `Começou ${nomeMes(semPlano)}`, corpo: 'Abre o Pila pra montar o plano do mês e ver quanto dá por dia.' };
  }
  const mes = resumoMes(dados, mesDe(hoje), hoje);
  const gastosHoje = gastosDoDia(dados, hoje);
  // Antes do salário cair o Livre fica negativo: mostra quanto vai dar quando ele cair
  if (!mes.salarioCaiu) {
    const q = quantoPossoGastar(mes.livre + dados.config.salario, gastosHoje, hoje);
    return {
      titulo: `Quando o salário cair: ${moeda(q.porDia)} por dia`,
      corpo: `Até ${dataCurta(q.ultimoDia)}. Quando ele cair, toca em "Salário caiu" no Pila.`,
    };
  }
  const q = quantoPossoGastar(mes.livre, gastosHoje, hoje);
  if (q.aindaDaHoje < 0) {
    return { titulo: `Hoje: ${moeda(q.aindaDaHoje)}`, corpo: `O Livre do mês está em ${moeda(mes.livre)}.` };
  }
  return {
    titulo: `Hoje dá ${moeda(q.aindaDaHoje)}`,
    corpo: q.diasDepoisDeHoje === 0 ? 'Último dia do mês.' : `Daqui pra frente, ${moeda(q.porDia)} por dia até ${dataCurta(q.ultimoDia)}.`,
  };
}

// O que avisar hoje: quanto dá pra gastar (com as contas vencendo hoje ou amanhã) e prazos de dívidas
async function avisosDoDia(admin: Admin, usuario: string, hoje: string): Promise<Aviso[]> {
  const amanha = somarDias(hoje, 1);
  const { data: contas } = await admin
    .from('itens_mes')
    .select('nome, valor_previsto, valor_real, vencimento')
    .eq('user_id', usuario)
    .eq('pago', false)
    .gte('vencimento', hoje)
    .lte('vencimento', amanha)
    .order('vencimento');

  const lista = contas ?? [];
  const valor = (c: { valor_real: number | null; valor_previsto: number }) => moeda(c.valor_real ?? c.valor_previsto);
  const vencem = (quando: string, dia: string) => {
    const doDia = lista.filter((c) => c.vencimento === dia);
    if (!doDia.length) return '';
    return `${doDia.length === 1 ? 'Vence' : 'Vencem'} ${quando}: ${doDia.map((c) => `${c.nome} ${valor(c)}`).join(', ')}.`;
  };
  const textoContas = [vencem('hoje', hoje), vencem('amanhã', amanha)].filter(Boolean).join(' ');

  // Se a conta do dia falhar por algum motivo, o aviso das contas vencendo sai do mesmo jeito
  let resumo: Aviso | null = null;
  try {
    resumo = quantoDa(await carregarDados(admin, usuario), hoje);
  } catch (e) {
    console.error('Falhou ao calcular o dia', String(e));
  }

  const avisos: Aviso[] = [];
  if (resumo) {
    avisos.push({ titulo: resumo.titulo, corpo: [resumo.corpo, textoContas].filter(Boolean).join(' ') });
  } else if (textoContas) {
    avisos.push({ titulo: lista.length === 1 ? 'Conta vencendo' : 'Contas vencendo', corpo: `${textoContas} Quando pagar, marca no Pila.` });
  }

  // Prazos de dívidas (ex.: último dia pra fechar um acordo com desconto): avisa com 7 dias, 1 dia e no dia
  const marcos = [hoje, amanha, somarDias(hoje, 7)];
  const { data: dividas } = await admin
    .from('dividas')
    .select('nome, prazo')
    .eq('user_id', usuario)
    .neq('status', 'quitada')
    .in('prazo', marcos);
  for (const d of dividas ?? []) {
    const quando = d.prazo === hoje ? 'O prazo acaba hoje' : d.prazo === amanha ? 'O prazo acaba amanhã' : `Faltam 7 dias pro prazo (${dataCurta(d.prazo)})`;
    avisos.push({ titulo: d.nome, corpo: `${quando}.` });
  }
  return avisos;
}

// Chave secreta do projeto: o Supabase dá pela variável antiga ou pelas novas, depende da conta
function chaveSecreta(): string {
  const direta = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (direta) return direta;
  const varias = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (varias) {
    try {
      const chaves = JSON.parse(varias);
      return chaves.default ?? Object.values(chaves)[0];
    } catch { /* segue pro erro */ }
  }
  throw new Error('A função não achou a chave secreta do Supabase');
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, chaveSecreta(), {
    auth: { persistSession: false },
  });

  // Quem está chamando?
  let usuarios: string[] | null = null; // null = todo mundo (agendamento)
  let teste = false;
  if (req.headers.get('x-pila-segredo') !== Deno.env.get('PILA_SEGREDO')) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ erro: 'Não autorizado' }, 401);
    usuarios = [data.user.id];
    teste = true;
  }

  let consulta = admin.from('push_inscricoes').select('id, user_id, endpoint, p256dh, auth');
  if (usuarios) consulta = consulta.in('user_id', usuarios);
  const { data: inscricoes, error } = await consulta;
  if (error) return json({ erro: error.message }, 500);
  if (!inscricoes?.length) return json({ enviados: 0, motivo: 'nenhum aparelho com avisos ligados' });

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get('PILA_VAPID')!), { extractable: false });
  const servidor = await webpush.ApplicationServer.new({
    contactInformation: 'https://pipinho548.github.io/pila/',
    vapidKeys,
  });

  const hoje = hojeSP();
  const porUsuario = new Map<string, typeof inscricoes>();
  for (const i of inscricoes) porUsuario.set(i.user_id, [...(porUsuario.get(i.user_id) ?? []), i]);

  let enviados = 0;
  let removidos = 0;
  for (const [usuario, aparelhos] of porUsuario) {
    // No teste manda o aviso de hoje de verdade, pra você ver como ele chega às 9h
    const avisos = await avisosDoDia(admin, usuario, hoje);
    if (teste && !avisos.length) avisos.push({ titulo: 'Pila', corpo: 'Os avisos estão funcionando. Eles chegam todo dia às 9h.' });
    for (const aviso of avisos) {
      for (const a of aparelhos) {
        try {
          const assinante = servidor.subscribe({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } });
          await assinante.pushTextMessage(JSON.stringify({ ...aviso, url: './#hoje' }), { ttl: 6 * 3600 });
          enviados++;
        } catch (e) {
          // Aparelho que desligou os avisos ou apagou o app: tira da lista
          if (e instanceof webpush.PushMessageError && e.isGone()) {
            await admin.from('push_inscricoes').delete().eq('id', a.id);
            removidos++;
          } else {
            console.error('Falhou ao avisar', a.endpoint.slice(0, 40), String(e));
          }
        }
      }
    }
  }
  return json({ enviados, removidos, hoje });
});
