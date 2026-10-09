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

## Backup

No app, vá em **Mais > Backup**:

- **Backup completo**: um arquivo `pila-backup-AAAA-MM-DD.json` com todas as tabelas. Guarde fora do celular (Google Drive, e-mail pra você mesmo).
- **Planilha do mês**: um `pila-AAAA-MM.csv` com os lançamentos do mês que está aberto na aba Mês. Abre direto no Excel.

No iPhone abre a tela de compartilhar (escolha "Salvar em Arquivos"). No computador, baixa direto.
Esses arquivos têm seus dados: não coloque na pasta do projeto sem o `.gitignore` (ele já ignora `*backup*` e `pila-*.csv`).

Faça um backup completo uma vez por mês, de preferência quando fechar o mês.

## Supabase pausou?

Projeto grátis pausa depois de uns dias sem uso. Entre em https://supabase.com/dashboard, abra o projeto e clique em **Restore project**. Os dados continuam lá.
