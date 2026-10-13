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

## Aviso das 9h (iPhone)

Todo dia às 9h chega uma notificação com quanto dá pra gastar hoje e por dia (a mesma conta da tela Hoje) e as contas vencendo hoje ou amanhã. Funciona no iPhone com iOS 16.4 ou mais novo, com o Pila aberto pelo ícone da tela inicial.

A função usa as contas do próprio app (`js/calc.js`) numa versão fixa, pelo jsDelivr. Mudou alguma regra no `calc.js`? Troque o commit no começo de `supabase/functions/avisos/index.ts` e publique a função de novo.

Peças:
- `supabase/avisos.sql`: tabela dos aparelhos (rodar no SQL Editor).
- `supabase/functions/avisos/index.ts`: função que monta e manda os avisos (Edge Functions, com "Verify JWT" desligado).
- Segredos da função `PILA_VAPID` e `PILA_SEGREDO`, e o agendamento das 9h: ficam em `privado/` (não vão pro GitHub).

## Extrato do C6

Em **Mais > Extrato do C6**, escolha o extrato exportado no app do C6 (PDF é o melhor; OFX também serve).
O arquivo é lido no próprio celular e não é enviado pra lugar nenhum. O app mostra:

- **Falta lançar**: o que está no banco e não está no app. Gasto vem com a categoria sugerida; Pix que bate com uma conta do plano marca a conta como paga.
- **Já estão no app**: bate por valor e data (até 3 dias de diferença), inclusive um Pix que você lançou em duas partes no mesmo dia.
- **Ficam de fora**: transferência entre contas suas, pagamento da fatura, CDB e Pix que voltou.
- O que é de antes do último saldo conferido não aparece.

Importar o mesmo extrato de novo não duplica nada. A categoria que você escolher fica lembrada pra próxima vez.
O leitor de PDF (pdf.js) vem do jsDelivr na primeira vez e fica guardado no celular.

## Lançar por frase ou print (IA)

Na folha de Lançar, **Escrever ou mandar print**: você escreve ("32 no mercado no pix e 15 de Uber") ou manda um print (fatura, comprovante, extrato). O Claude Sonnet 5.5 lê e monta a lista; você confere, ajusta a categoria e toca em Lançar. O que já parece estar no app vem desmarcado.

Peças:
- `supabase/functions/ia/index.ts`: função que chama a API da Anthropic (só com você logado).
- Segredo da função `ANTHROPIC_API_KEY` (console.anthropic.com > API Keys). Ponha um limite de gasto mensal no Console.
- Custo: centavos por uso; uns US$ 1,50 por mês com uso diário.

## Backup

No app, vá em **Mais > Backup**:

- **Backup completo**: um arquivo `pila-backup-AAAA-MM-DD.json` com todas as tabelas. Guarde fora do celular (Google Drive, e-mail pra você mesmo).
- **Planilha do mês**: um `pila-AAAA-MM.csv` com os lançamentos do mês que está aberto na aba Mês. Abre direto no Excel.

No iPhone abre a tela de compartilhar (escolha "Salvar em Arquivos"). No computador, baixa direto.
Esses arquivos têm seus dados: não coloque na pasta do projeto sem o `.gitignore` (ele já ignora `*backup*` e `pila-*.csv`).

Faça um backup completo uma vez por mês, de preferência quando fechar o mês.

## Supabase pausou?

Projeto grátis pausa depois de uns dias sem uso. Entre em https://supabase.com/dashboard, abra o projeto e clique em **Restore project**. Os dados continuam lá.
