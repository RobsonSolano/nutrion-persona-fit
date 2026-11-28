# Publicação automática no Instagram (@personafitapp)

**Status:** implementada e em produção (28/11/2026) · **Escopo:** Large (banco + edge function + cron + script local) · **Criada em:** 28/11/2026

## Por quê

O @personafitapp precisa de 1 post no feed e 2 stories por dia. As artes já saem do Figma em lote
(modelos e trilha semanal na página "Mídias sociais"). Postar à mão todo dia não escala; a ideia é
produzir em lote e deixar a publicação diária sozinha.

## Já feito (fora desta feature)

- App da Meta "PersonaFit Publisher" (conta pessoal, sem portfólio da Nano), Página do Facebook
  PersonaFit ligada ao @personafitapp, token de Página **sem expiração** com
  `instagram_content_publish`. Valores em `.env.local`: `INSTAGRAM_USER_ID`, `FACEBOOK_PAGE_ID`,
  `INSTAGRAM_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET`.
- Bucket público `instagram` no Storage (só JPEG, até 8 MB).
- Primeiro post publicado em 28/11/2026 (carrossel "Seu plano pronto em 60 segundos").

## Limites da API que moldam o desenho

- A API publica imagem, carrossel (2 a 10 itens) e story de imagem. A imagem precisa estar em URL
  pública e ser JPEG.
- **Não** coloca figurinha (enquete, quiz, caixinha, link) em story. Decisão do dev (28/11): por
  enquanto, nada de enquete; todo story é arte pronta, publicada automaticamente.
- Não tem agendamento nativo: quem agenda somos nós.
- Limite: 100 publicações por 24h (lido da própria API em 28/11/2026).

## Requisitos

### IG-01 · Fila de publicações
Uma tabela guarda cada publicação: quando sai (`scheduled_for`), em qual espaço do dia (`slot`:
`feed`, `story-1`, `story-2`), o que é (imagem, carrossel ou story), os arquivos no bucket (na
ordem), a legenda e o estado.

- QUANDO uma linha é inserida, ENTÃO ela começa `pending`.
- QUANDO já existe uma linha para o mesmo dia (horário de Brasília) e o mesmo `slot`, ENTÃO a nova
  é recusada.
- QUANDO um carrossel tem menos de 2 ou mais de 10 imagens, ENTÃO a linha é recusada.
- QUANDO um story tem legenda, ENTÃO a linha é recusada (story não tem legenda).
- QUANDO alguém sem service role tenta ler ou escrever, ENTÃO é bloqueado (RLS sem policies).

### IG-02 · Publicação automática
Uma edge function roda a cada 5 minutos (só quando há post vencido) e publica o que já venceu.

- QUANDO há linha `pending` com `scheduled_for` no passado, ENTÃO ela é publicada pela Graph
  API e fica `published`, com o id da mídia e o link do post.
- QUANDO a mesma linha é pega por duas execuções ao mesmo tempo, ENTÃO só uma publica (a troca para
  `publishing` é atômica).
- QUANDO a linha venceu há mais de 6 horas, ENTÃO ela não é publicada: fica `skipped` e os admins são
  avisados (evita post fora de hora depois de uma pane longa).
- QUANDO a Meta devolve erro ou o container não fica pronto, ENTÃO a linha fica `failed` com o motivo,
  e os admins recebem aviso. Não há nova tentativa automática.
- QUANDO a chamada não traz o `X-Cron-Secret` certo, ENTÃO responde 403 e não faz nada.

### IG-03 · (retirado em 28/11) Story manual com figurinha
Fora por decisão do dev: sem enquete por enquanto. Se voltar, entra como modo `manual` com aviso.

### IG-04 · Horários
- Stories às **10h** e às **19h**, feed às **12h**, horário de Brasília. O horário é dado da linha
  (`scheduled_for`), não da function: dá para postar em outro horário só mudando a linha.

### IG-05 · Carga da fila a partir do Figma
Um script local lê um arquivo de programação (dia → feed e story, com os ids das artes no Figma,
legenda), exporta as artes em JPEG pela API REST do Figma, sobe no bucket e cria as linhas.

- QUANDO o script roda de novo com o mesmo arquivo, ENTÃO não duplica linhas nem arquivos (chave:
  dia + slot).
- QUANDO o `FIGMA_TOKEN` não existe, ENTÃO o script para antes de mexer em qualquer coisa e diz o
  que falta.
- QUANDO uma linha já foi publicada, ENTÃO o script não altera essa linha.

## Fora do escopo

- Reels e vídeo.
- Destaques (a API não permite).
- Responder comentários e mensagens.
- Gerar artes novas: continua sendo feito por mim no Figma, em lote.

## Desenho

**Tabela `instagram_posts`** (migration nova):
`id`, `scheduled_for timestamptz`, `slot` (`feed`|`story`), `kind` (`image`|`carousel`|`story`),
`media_paths text[]`, `caption text null`, `status`
(`pending`|`publishing`|`published`|`failed`|`skipped`), `ig_media_id`, `permalink`, `error`,
`published_at`, `created_at`, `updated_at`. Único em (dia de `scheduled_for` em BRT, `slot`).
Checks dos requisitos IG-01. RLS ligado, sem policies.

**`supabase/functions/_shared/instagram.ts`** (lógica pura, testada no vitest com `fetch` injetado):
monta e publica containers (imagem, carrossel com filhos, story), espera o status `FINISHED`,
decide o que fazer com cada linha (publicar ou pular por atraso), valida legenda
(até 2.200 caracteres e 30 hashtags).

**`supabase/functions/cron-instagram-publish/index.ts`**: mesmo padrão do `cron-ai-quota-alert`
(`X-Cron-Secret`, `verify_jwt = false`). Falha e atraso avisam os admins por push + e-mail,
reaproveitando o envio de e-mail do alerta de IA (movido para `_shared/adminAlert.ts`). Secrets novos no Supabase: `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`.

**Cron**: migration no padrão `nutrion-*` (segredo lido do Vault): `nutrion-instagram-publish`, a cada 5 min (o `net.http_post` só sai quando há linha pendente vencida),


**`scripts/instagram-fila.mjs`** + `scripts/data/instagram/AAAA-MM-DD.json` (programação):
exporta pela API REST do Figma (`format=jpg`, `scale=1`), sobe em
`instagram/posts/<data>-<slot>/<n>.jpg` e faz upsert na fila.

## Programação inicial (proposta)

Feed: a Semana 1 do Figma remapeada para os dias reais (o post de domingo fala de planejar a semana).
Stories: as artes de pergunta da Semana 1 saem (eram enquete); entram 2 stories de arte pronta por
dia, a produzir (story do post do dia + story de produto/dica).

| Data | Feed (12h) |
|---|---|
| sáb 28/11 | ✅ carrossel SEG (já publicado) |
| dom 29/11 | frase DOM |
| seg 30/11 | prato com IA (TER) |
| ter 01/12 | carrossel proteína (QUA) |
| qua 02/12 | frase consistência (QUI) |
| qui 03/12 | carrossel professores (SEX) |
| sex 04/12 | painel do aluno (SÁB) |

A Semana 2 precisa estar na fila antes de sáb 05/12.

## Dependências do dev

1. `FIGMA_TOKEN` no `.env.local` (token pessoal, só leitura de arquivo).
2. Ok para os passos que mexem em produção: `supabase db push` (tabela + cron),
   `supabase secrets set` e deploy da function.
