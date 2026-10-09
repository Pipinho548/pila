-- Pila: tabelas e segurança (RLS)
--
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem estragar nada (só cria o que ainda não existe).
--
-- Regras:
--   Dinheiro sempre em centavos (bigint). R$ 12,50 = 1250.
--   Datas como date (AAAA-MM-DD). Mês como texto 'AAAA-MM'.
--   Toda tabela tem id, user_id e created_at, e só o dono vê as próprias linhas.

-- ---------- Configuração (uma linha por usuário) ----------
create table if not exists public.config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  salario bigint not null check (salario >= 0),
  dia_salario smallint not null check (dia_salario between 1 and 31),
  cartao_fecha_dia smallint not null check (cartao_fecha_dia between 1 and 31),
  cartao_vence_dia smallint not null check (cartao_vence_dia between 1 and 31),
  inicio_controle date not null
);

-- ---------- Categorias ----------
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  nome text not null,
  icone text,
  cor text,
  ordem int not null default 0,
  unique (user_id, nome)
);

-- ---------- Limites por categoria (um limite pode juntar várias categorias) ----------
create table if not exists public.limites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  nome text not null,
  valor bigint not null check (valor > 0),
  categorias uuid[] not null default '{}'
);

-- ---------- Caixinhas (hoje só a Reserva no CDB) ----------
create table if not exists public.caixinhas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  nome text not null,
  saldo_inicial bigint not null default 0,
  data_inicio date not null,
  meta bigint check (meta is null or meta > 0),
  observacao text,
  ordem int not null default 0
);

-- ---------- Contas fixas (modelo do que se repete todo mês) ----------
-- tipo:
--   conta        conta normal (aluguel, luz...)
--   assinatura   no cartão; entra no plano do mês em que a fatura vence
--   fatura_uber  corridas de Uber no cartão; entra no plano do mês em que a fatura vence
--   deposito     guardar dinheiro numa caixinha
create table if not exists public.contas_fixas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  nome text not null,
  tipo text not null default 'conta' check (tipo in ('conta', 'assinatura', 'fatura_uber', 'deposito')),
  valor_previsto bigint not null check (valor_previsto >= 0),
  dia smallint check (dia between 1 and 31),
  categoria_id uuid references public.categorias (id) on delete set null,
  meio text check (meio in ('pix', 'debito', 'cartao', 'boleto', 'dinheiro')),
  quem text,
  caixinha_id uuid references public.caixinhas (id) on delete set null,
  ativa boolean not null default true,
  observacao text,
  ordem int not null default 0
);

-- ---------- Dívidas ----------
-- status: a_pagar (sem data, só pra lembrar), planejada, ativa, quitada
create table if not exists public.dividas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  nome text not null,
  credor text,
  tipo text not null check (tipo in ('emprestimo', 'compra_parcelada', 'acordo', 'imposto', 'outro')),
  status text not null check (status in ('a_pagar', 'planejada', 'ativa', 'quitada')),
  valor_original bigint check (valor_original >= 0),
  valor_negociado bigint check (valor_negociado >= 0),
  total_parcelas int check (total_parcelas > 0),
  pagas_antes int not null default 0 check (pagas_antes >= 0), -- parcelas pagas antes de usar o app
  prazo date,                                                     -- data limite importante (ex.: adesão com desconto)
  quitada_em date,
  observacoes text,
  link text,
  ordem int not null default 0
);

create table if not exists public.parcelas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  divida_id uuid not null references public.dividas (id) on delete cascade,
  numero int not null check (numero > 0),
  valor bigint not null check (valor > 0),
  vencimento date not null,
  paga boolean not null default false,
  paga_em date,
  unique (divida_id, numero)
);

create table if not exists public.passos_divida (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  divida_id uuid not null references public.dividas (id) on delete cascade,
  data date,
  descricao text not null,
  feito boolean not null default false,
  ordem int not null default 0
);

-- ---------- Plano de cada mês ----------
-- fatura_mes: em qual fatura (mês de vencimento) a assinatura ou o Uber está.
create table if not exists public.itens_mes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  nome text not null,
  tipo text not null check (tipo in ('conta_fixa', 'assinatura', 'fatura_uber', 'parcela', 'avulsa', 'deposito', 'fatura_antiga')),
  valor_previsto bigint not null check (valor_previsto >= 0),
  valor_real bigint check (valor_real >= 0),
  vencimento date,
  categoria_id uuid references public.categorias (id) on delete set null,
  conta_fixa_id uuid references public.contas_fixas (id) on delete set null,
  parcela_id uuid references public.parcelas (id) on delete set null,
  caixinha_id uuid references public.caixinhas (id) on delete set null,
  fatura_mes text check (fatura_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  pago boolean not null default false,
  pago_em date,
  observacao text,
  ordem int not null default 0
);

-- Virada de mês não duplica: cada conta fixa e cada parcela aparece uma vez só.
create unique index if not exists itens_mes_conta_fixa_unica
  on public.itens_mes (user_id, mes, conta_fixa_id) where conta_fixa_id is not null;
create unique index if not exists itens_mes_parcela_unica
  on public.itens_mes (parcela_id) where parcela_id is not null;
create index if not exists itens_mes_mes_idx on public.itens_mes (user_id, mes);

-- ---------- Lançamentos (tudo que aconteceu de verdade) ----------
-- regra_cartao (só pra compras no cartão): uber, assinatura, outra
-- antes_do_app: compras do cartão anteriores ao app (contam pela "Fatura C6: compras antigas")
-- cliente_id: gerado no celular, evita lançar duas vezes quando a internet volta
create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  data date not null,
  valor bigint not null check (valor <> 0),
  descricao text,
  categoria_id uuid references public.categorias (id) on delete set null,
  meio text check (meio in ('pix', 'debito', 'cartao', 'boleto', 'dinheiro')),
  tipo text not null check (tipo in ('gasto', 'entrada', 'deposito_caixinha', 'resgate_caixinha', 'pagamento_fatura', 'ajuste')),
  item_mes_id uuid references public.itens_mes (id) on delete set null,
  caixinha_id uuid references public.caixinhas (id) on delete set null,
  fatura_mes text check (fatura_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  regra_cartao text check (regra_cartao in ('uber', 'assinatura', 'outra')),
  antes_do_app boolean not null default false,
  observacao text,
  cliente_id uuid unique,
  check (tipo = 'ajuste' or valor > 0),
  check (regra_cartao is null or meio = 'cartao')
);
create index if not exists lancamentos_data_idx on public.lancamentos (user_id, data);

-- ---------- Meses (fechamento) ----------
create table if not exists public.meses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fechado_em timestamptz,
  sobra bigint,
  destino_sobra text check (destino_sobra in ('reserva', 'proximo_mes')),
  unique (user_id, mes)
);

-- ---------- Comprar (lista de desejos) ----------
create table if not exists public.desejos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),   -- os 2 dias "esfriando" contam daqui
  nome text not null,
  preco bigint check (preco > 0),
  pra_quem text,
  link text,
  prioridade smallint not null default 2 check (prioridade between 1 and 3), -- 1 alta, 3 baixa
  plano text,
  parcelado boolean not null default false,
  comprado_em date,
  lancamento_id uuid references public.lancamentos (id) on delete set null,
  observacao text
);

-- ---------- A receber ----------
create table if not exists public.a_receber (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  quem text not null,
  telefone text,
  valor bigint not null check (valor > 0),
  motivo text,
  data date,
  recebido_em date,
  lancamento_id uuid references public.lancamentos (id) on delete set null
);

-- ---------- Saldos conferidos com o banco ----------
create table if not exists public.saldos_conferidos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  data date not null,
  saldo bigint not null,
  observacao text
);

-- ---------- Segurança ----------
-- Pra cada tabela:
--   1. liga o RLS
--   2. regra "só o dono": cada um só lê e mexe nas linhas com o próprio user_id
--   3. quem não está logado (anon) não tem acesso nenhum
--   4. quem está logado (authenticated) pode ler e escrever (sempre filtrado pela regra 2)
--   5. índice no user_id pra regra ficar rápida
do $$
declare
  t text;
begin
  foreach t in array array[
    'config', 'categorias', 'limites', 'caixinhas', 'contas_fixas',
    'dividas', 'parcelas', 'passos_divida', 'itens_mes', 'lancamentos',
    'meses', 'desejos', 'a_receber', 'saldos_conferidos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists so_o_dono on public.%I', t);
    execute format(
      'create policy so_o_dono on public.%I for all to authenticated '
      'using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end $$;

-- Avisa a API que as tabelas mudaram
notify pgrst, 'reload schema';
