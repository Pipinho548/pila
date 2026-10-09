# Pila

App de controle financeiro pessoal. HTML, CSS e JavaScript puro, Supabase e GitHub Pages. Sem build.

## Rodar no computador

Precisa do [Node.js](https://nodejs.org) instalado.

```bash
node tools/servidor.mjs
```

Abra http://localhost:5173/pila/ no navegador.

Testes:

```bash
node --test
```

`tests/` tem os testes das regras com números inventados. Se existir a pasta `privado/` (só no seu PC),
o mesmo comando roda também os testes de aceitação com os dados reais.

## Dados iniciais

O arquivo `privado/dados-iniciais.json` tem os dados reais e nunca vai pro GitHub.
Pra importar: abra o app logado, vá em **Mais > Importar dados iniciais** e escolha esse arquivo. Só funciona com a conta vazia.

## Conectar o Supabase

Preencha `js/config.js` com a **Project URL** e a chave **anon / publishable** do seu projeto
(Supabase > Project Settings > API). Nunca coloque a chave `service_role` / `secret` aqui.

Tabelas: no Supabase, abra **SQL Editor > New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
Pode rodar de novo sem problema. Toda tabela tem RLS: sem login, nada aparece.

## Publicar

O GitHub Pages publica a branch `main` sozinho. Depois de mudar algo:

```bash
git add -A
git commit -m "o que mudou"
git push
```

Em 1 ou 2 minutos o site atualiza. Se mudou arquivo do app, aumente `VERSAO` no `sw.js` pra o iPhone pegar a versão nova.

## Dados pessoais

O repositório é público. Nenhum dado financeiro fica no código: tudo vive no Supabase, protegido por login e RLS.
A pasta `privado/`, o `dados-iniciais.json` e qualquer backup estão no `.gitignore`.

## Avisos de vencimento (iPhone)

Todo dia às 9h, se tiver conta vencendo hoje ou amanhã, chega uma notificação. Funciona no iPhone com iOS 16.4 ou mais novo, com o Pila aberto pelo ícone da tela inicial.

Peças:
- `supabase/avisos.sql`: tabela dos aparelhos (rodar no SQL Editor).
- `supabase/functions/avisos/index.ts`: função que monta e manda os avisos (Edge Functions, com "Verify JWT" desligado).
- Segredos da função `PILA_VAPID` e `PILA_SEGREDO`, e o agendamento das 9h: ficam em `privado/` (não vão pro GitHub).

## Backup

No app, vá em **Mais > Backup**:

- **Backup completo**: um arquivo `pila-backup-AAAA-MM-DD.json` com todas as tabelas. Guarde fora do celular (Google Drive, e-mail pra você mesmo).
- **Planilha do mês**: um `pila-AAAA-MM.csv` com os lançamentos do mês que está aberto na aba Mês. Abre direto no Excel.

No iPhone abre a tela de compartilhar (escolha "Salvar em Arquivos"). No computador, baixa direto.
Esses arquivos têm seus dados: não coloque na pasta do projeto sem o `.gitignore` (ele já ignora `*backup*` e `pila-*.csv`).

Faça um backup completo uma vez por mês, de preferência quando fechar o mês.

## Supabase pausou?

Projeto grátis pausa depois de uns dias sem uso. Entre em https://supabase.com/dashboard, abra o projeto e clique em **Restore project**. Os dados continuam lá.
