// Função do Supabase: manda aviso no iPhone quando tem conta vencendo.
//
// Quem chama:
//   - o agendamento (pg_cron), todo dia às 9h de Brasília, com o cabeçalho x-pila-segredo
//   - o próprio app, logado, pra mandar um aviso de teste
//
// Segredos (Supabase > Edge Functions > Secrets):
//   PILA_VAPID    chaves do serviço de notificação (JSON)
//   PILA_SEGREDO  senha que só o agendamento conhece
// O Supabase já dá SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY pra função.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

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

// O que avisar hoje: contas não pagas vencendo hoje ou amanhã, e prazos de dívidas chegando
async function avisosDoDia(admin: ReturnType<typeof createClient>, usuario: string, hoje: string): Promise<Aviso[]> {
  const amanha = somarDias(hoje, 1);
  const { data: contas } = await admin
    .from('itens_mes')
    .select('nome, valor_previsto, valor_real, vencimento')
    .eq('user_id', usuario)
    .eq('pago', false)
    .gte('vencimento', hoje)
    .lte('vencimento', amanha)
    .order('vencimento');

  const avisos: Aviso[] = [];
  const lista = contas ?? [];
  const valor = (c: { valor_real: number | null; valor_previsto: number }) => moeda(c.valor_real ?? c.valor_previsto);
  if (lista.length === 1) {
    const c = lista[0];
    avisos.push({
      titulo: `${c.vencimento === hoje ? 'Vence hoje' : 'Vence amanhã'}: ${c.nome}`,
      corpo: `${valor(c)}. Quando pagar, marca no Pila.`,
    });
  } else if (lista.length > 1) {
    const deHoje = lista.filter((c) => c.vencimento === hoje).length;
    avisos.push({
      titulo: deHoje === lista.length ? `${lista.length} contas vencem hoje`
        : deHoje === 0 ? `${lista.length} contas vencem amanhã` : `${lista.length} contas vencem hoje e amanhã`,
      corpo: lista.map((c) => `${c.nome} ${valor(c)}`).join(', '),
    });
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

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
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
    const avisos = teste
      ? [{ titulo: 'Pila', corpo: 'Os avisos estão funcionando. Quando tiver conta vencendo, eles chegam às 9h.' }]
      : await avisosDoDia(admin, usuario, hoje);
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
