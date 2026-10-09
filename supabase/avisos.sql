-- Pila: aparelhos que recebem aviso de vencimento
--
-- Como usar: Supabase > SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo sem estragar nada.
-- (O agendamento das 9h fica num arquivo separado, que não vai pro GitHub porque tem a senha.)

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text
);

alter table public.push_inscricoes enable row level security;
drop policy if exists so_o_dono on public.push_inscricoes;
create policy so_o_dono on public.push_inscricoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_inscricoes from anon, public;
grant select, insert, update, delete on public.push_inscricoes to authenticated;
create index if not exists push_inscricoes_user_id_idx on public.push_inscricoes (user_id);

notify pgrst, 'reload schema';
