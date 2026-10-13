-- Pila pra mais de uma pessoa: cada um com o nome do próprio banco e as próprias regras de ouro.
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.

alter table public.config add column if not exists banco text not null default 'C6';
alter table public.config add column if not exists regras_de_ouro text;

-- Avisa a API que a tabela mudou
notify pgrst, 'reload schema';
