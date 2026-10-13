// Função do Supabase: lê uma frase ou um print e devolve os lançamentos pra você conferir no app.
// Usa o Claude Sonnet 5.5. Nada é gravado aqui: quem lança é o app, depois que você confere.
//
// Quem chama: só o app, com você logado.
// Segredo (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY  chave da API da Anthropic (console.anthropic.com > API Keys)
// O Supabase já dá SUPABASE_URL e a chave secreta do projeto pra função.

import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const MODELO = 'claude-sonnet-5-5';
const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SISTEMA = `Você ajuda a lançar gastos num app brasileiro de finanças pessoais.
Você recebe uma frase escrita pela pessoa, ou um print (comprovante, fatura de cartão de crédito, extrato do banco), e devolve os lançamentos que estão ali.

Regras:
- valor_centavos: inteiro positivo em centavos. "32" = 3200, "R$ 32,50" = 3250, "1.234,56" = 123456.
- data: AAAA-MM-DD. Sem data, use hoje. "Ontem" e "anteontem" contam a partir de hoje. Datas do print sem ano (como 07/10) são do ano de hoje; se ficariam no futuro, são do ano anterior.
- tipo: "gasto" quando saiu dinheiro; "entrada" quando a pessoa recebeu.
- meio: "pix", "debito", "cartao" (cartão de crédito), "dinheiro" ou "boleto". Fatura de cartão de crédito: tudo é "cartao". Frase sem o meio: "pix".
- categoria: o nome exato de uma das categorias da lista. Uber, 99 e táxi são Transporte. Em entrada, use "".
- descricao: curta e legível, como a pessoa escreveria (ex.: "Uber", "Mercado", "Almoço").
- Num print, um lançamento por compra. Ignore totais, limite, saldo, "valor a pagar", pagamentos de fatura e estornos que anulam uma compra. IOF é um gasto separado.
- Se não der pra entender algo, deixe de fora e explique em aviso. Se estiver tudo certo, aviso é "".`;

function esquema(categorias: string[]) {
  return {
    type: 'object',
    properties: {
      lancamentos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'AAAA-MM-DD' },
            valor_centavos: { type: 'integer', description: 'valor em centavos, positivo' },
            descricao: { type: 'string' },
            categoria: { type: 'string', enum: [...categorias, ''] },
            meio: { type: 'string', enum: ['pix', 'debito', 'cartao', 'dinheiro', 'boleto'] },
            tipo: { type: 'string', enum: ['gasto', 'entrada'] },
          },
          required: ['data', 'valor_centavos', 'descricao', 'categoria', 'meio', 'tipo'],
          additionalProperties: false,
        },
      },
      aviso: { type: 'string' },
    },
    required: ['lancamentos', 'aviso'],
    additionalProperties: false,
  };
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

// Hoje em São Paulo, 'AAAA-MM-DD' (se o app não mandar)
function hojeSP(): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  // Só quem está logado no Pila (os cadastros estão desligados: só você)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, chaveSecreta(), { auth: { persistSession: false } });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: login, error: erroLogin } = await supabase.auth.getUser(token);
  if (erroLogin || !login.user) return json({ erro: 'Entra no Pila de novo.' }, 401);

  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return json({ erro: 'Falta a chave da IA no Supabase (ANTHROPIC_API_KEY).' }, 500);

  let pedido: { texto?: string; imagem?: { tipo: string; dados: string } | null; hoje?: string; categorias?: string[] };
  try {
    pedido = await req.json();
  } catch {
    return json({ erro: 'Pedido com problema.' }, 400);
  }
  const texto = String(pedido.texto ?? '').slice(0, 2000);
  const imagem = pedido.imagem ?? null;
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(pedido.hoje ?? '') ? pedido.hoje! : hojeSP();
  const categorias = (pedido.categorias ?? []).map(String).slice(0, 50);
  if (!texto && !imagem) return json({ erro: 'Escreve o gasto ou escolhe um print.' }, 400);
  if (imagem && (!TIPOS_DE_IMAGEM.includes(imagem.tipo) || imagem.dados.length > 7_000_000)) {
    return json({ erro: 'Esse print não deu. Tenta um print de tela comum.' }, 400);
  }

  const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (imagem) {
    conteudo.push({
      type: 'image',
      source: { type: 'base64', media_type: imagem.tipo as 'image/jpeg' | 'image/png' | 'image/webp', data: imagem.dados },
    });
  }
  conteudo.push({
    type: 'text',
    text: `Hoje é ${hoje}.\nCategorias: ${categorias.join(', ')}.\n\n${texto || 'Lê os lançamentos desse print.'}`,
  });

  const cliente = new Anthropic({ apiKey: chave });
  try {
    const resposta = await cliente.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      // Se a IA recusar por engano, o próprio Claude tenta de novo em outro modelo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SISTEMA,
      output_config: {
        effort: imagem ? 'medium' : 'low',
        format: { type: 'json_schema', schema: esquema(categorias) },
      },
      messages: [{ role: 'user', content: conteudo }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (resposta.stop_reason === 'refusal') return json({ erro: 'A IA não quis ler isso. Lança à mão.' }, 422);
    if (resposta.stop_reason === 'max_tokens') return json({ erro: 'Muita coisa de uma vez. Manda um print menor.' }, 422);
    const saida = resposta.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return json(JSON.parse(saida));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ erro: 'A chave da IA não funcionou. Confere o ANTHROPIC_API_KEY no Supabase.' }, 500);
    if (e instanceof Anthropic.RateLimitError) return json({ erro: 'A IA está ocupada. Tenta de novo em um minuto.' }, 429);
    if (e instanceof Anthropic.APIError) {
      console.error('Erro da IA', e.status, e.message);
      return json({ erro: 'A IA deu erro. Se continuar, confere o crédito em console.anthropic.com.' }, 502);
    }
    console.error('Falhou', String(e));
    return json({ erro: 'Não deu pra ler. Tenta de novo.' }, 500);
  }
});
