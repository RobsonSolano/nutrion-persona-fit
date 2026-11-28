# Instagram automático: guia completo

Como o @personafitapp passou a publicar sozinho 1 post no feed e 2 stories por dia, tudo de graça. Escrito
para ser replicado em outro projeto e outro Instagram. Feito em 28/11/2026.

**Resumo da arquitetura**

```
Figma (modelos e artes)  ─┐
                          ├─► script local (carga da fila) ─► Supabase Storage (bucket público, JPEG)
gerador de stories local ─┘                                 └► tabela instagram_posts (a fila)
                                                                        │
pg_cron (a cada 5 min, só se há post vencido) ─► edge function ─► Instagram Graph API ─► @perfil
                                                       └─► e-mail + push aos admins se falhar
```

- **Produção de conteúdo (manual, em lote):** artes no Figma e no gerador de stories, depois a carga da
  fila com um comando.
- **Publicação (sozinha, todo dia):** nenhuma IA envolvida. Um script previsível publica o que venceu.

## 1. O que a API do Instagram faz e não faz

| Faz | Não faz |
|---|---|
| Post de imagem, carrossel (2 a 10), story de imagem | Figurinha em story (enquete, quiz, caixinha, link) |
| Legenda com hashtags (até 2.200 caracteres e 30 hashtags) | Criar ou editar destaques |
| 100 publicações por 24h (lido da API em 28/11/2026) | Agendar: quem agenda é o nosso cron |

- **Formato das imagens:** precisam estar em **URL pública** e ser **JPEG**.
- **Carrossel:** a Meta corta todos os itens pela proporção do primeiro. Use 1080×1350 (4:5) em tudo.
- **Story:** 1080×1920 (9:16).
- **Destaques:** crie à mão no celular. **+ Novo** no perfil → escolha um story → **Editar capa** → foto da
  galeria. O círculo central é o que aparece.

## 2. Pré-requisitos (uma vez por Instagram)

1. **Instagram profissional do tipo Comercial:** Configurações → Tipo de conta e ferramentas. Conta
   "Criador" publica feed, mas a API só publica story em conta comercial.
2. **Página do Facebook** criada pelo seu Facebook pessoal (facebook.com/pages → Criar Página). Pode ser
   simples; a capa é opcional.
3. **Ligar a Página ao Instagram:** com o Facebook *usando a Página* (troque o perfil no avatar do canto
   superior direito), vá em **Configurações → Contas vinculadas → Instagram → Conectar conta**. Também dá pelo
   app do Instagram: Editar perfil → Informações públicas da empresa → Página.

## 3. App na Meta e token (passo a passo das telas)

1. **developers.facebook.com → Meus apps → Criar aplicativo.**
   - Caso de uso: filtre por **Gerenciamento de conteúdo** e marque **Gerenciar mensagens e conteúdo no
     Instagram**. Só ele.
   - Portfólio empresarial: **"Ainda não quero me conectar a um portfólio empresarial"**. ⚠️ Não escolha um
     portfólio de empresa de terceiros (no nosso caso aparecia "Nano Teste"); o app ficaria dela.
   - Requisitos: nenhum. Deixe o app em **modo de desenvolvimento**: para postar no próprio perfil não precisa
     publicar o app nem passar por revisão.
2. **Casos de uso → Personalizar.** A tela abre em **"API setup with Unified login"**, que **exige
   portfólio**. Ignore. No menu da esquerda, abra **"Configuração da API com login do Facebook"** e clique em
   **Add required content permissions** (não precisa das de mensagens).
3. **developers.facebook.com/tools/explorer** (Explorador da Graph API):
   - App da Meta: o seu app.
   - Usuário ou Página: **Obter token de acesso do usuário**.
   - Permissões: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`,
     `business_management`.
   - **Generate Access Token** → na janela da Meta, marque **só a Página** do projeto e o Instagram dela.
     Se marcar todas as suas páginas, o app ganha acesso a elas (dá para conferir em Facebook →
     Configurações → Integrações comerciais, mas lá não se escolhe página: teria que refazer a autorização).
4. **Configurações do app → Básico:** copie o ID do app e a Chave secreta.
5. No `.env.local` do projeto (fora do git):
   ```
   META_APP_ID=...
   META_APP_SECRET="..."
   INSTAGRAM_SHORT_TOKEN="..."   # o do Explorador, vale ~1 hora
   ```
6. Rode `node --env-file=.env.local scripts/instagram-token.mjs <usuario_do_instagram>`. Ele troca pelo
   **token de Página, que não expira**, confere os escopos, lê o perfil (sem publicar) e grava
   `INSTAGRAM_USER_ID`, `FACEBOOK_PAGE_ID` e `INSTAGRAM_ACCESS_TOKEN` no `.env.local`.

## 4. Supabase (o motor)

Arquivos deste repositório para copiar:

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20261128120000_instagram_posts.sql` | Tabela da fila, CHECKs, um por dia + slot, RLS |
| `supabase/migrations/20261128120200_instagram_publish_a_cada_5min.sql` | pg_cron a cada 5 min, só com post vencido |
| `supabase/functions/cron-instagram-publish/` | Edge function que publica |
| `supabase/functions/_shared/instagram.ts` (+ teste) | Chamadas da Graph API, testáveis |
| `supabase/functions/_shared/adminAlert.ts` | Aviso por e-mail (Gmail SMTP) e push aos admins |
| `scripts/instagram-fila.mjs`, `scripts/lib/instagramFila.mjs` (+ teste) | Carga da fila |
| `scripts/instagram-token.mjs` | Troca de token (seção 3) |

**Passos no projeto novo:**

1. **Bucket público** `instagram`, só `image/jpeg`, até 8 MB. Crie pelo painel ou com o service role
   (`storage.createBucket('instagram', { public: true, ... })`).
2. Ajuste nas migrations a URL da function (`https://<ref>.supabase.co/functions/v1/cron-instagram-publish`).
   Garanta o segredo `CRON_SECRET` no **Vault** e também como secret das functions.
3. Em `supabase/config.toml`, coloque `[functions.cron-instagram-publish] verify_jwt = false`. Sem isso, o
   gateway responde 401 ao pg_cron, que não manda JWT.
4. Rode `supabase db push`.
5. Rode `supabase secrets set --env-file <arquivo com INSTAGRAM_USER_ID e INSTAGRAM_ACCESS_TOKEN>`. Para o
   aviso por e-mail, também `GMAIL_USER` e `GMAIL_APP_PASSWORD`. Os admins vêm da tabela `admin_users`;
   adapte em `adminAlert.ts` se o projeto não tiver uma.
6. Rode `supabase functions deploy cron-instagram-publish`.
7. Confira que chamar a function sem o header `X-Cron-Secret` responde **403**.

**Regras da publicação**

- **Horários:** cada linha tem o seu `scheduled_for`. O padrão do script é story 1 às 10h, feed às 12h e story
  2 às 19h (Brasília), e o post sai até 5 minutos depois do horário.
- **Duplicidade:** a troca para `publishing` é atômica, então duas execuções não publicam o mesmo post.
- **Atraso:** linha vencida há mais de 6 horas vira `skipped` e não é publicada fora de hora.
- **Erro:** se a Meta recusar, a linha vira `failed` com o motivo. Não há nova tentativa automática.
- **Aviso:** um e-mail + push por execução, listando os problemas daquela rodada.

## 5. Conteúdo

- **Modelos no Figma:** feed de produto, feed de frase, carrossel (capa, slide, slide com print, CTA), story
  e capas de destaque, todos como componentes com textos editáveis. Para uma arte nova, duplique uma
  instância e edite o texto.
- **Exportação:** pela **API REST do Figma**, nunca pelo MCP. O MCP em assento de visualização tem uma cota
  mensal pequena e bloqueia no meio do trabalho, como aconteceu em 28/11. O token pessoal fica em Settings →
  Security → Personal access tokens, só com o escopo **`file_content:read`**, e vale no máximo 90 dias. Só a
  carga da fila usa esse token: se ele vencer, nada para de publicar.
- **Stories por código:** `nutrion-brand/instagram/ferramentas/render-story.swift` (macOS) gera stories no
  mesmo visual. Use `post <arte.jpg> <saida.jpg>` para "Post novo no feed" com a arte do dia em miniatura, e
  `dica <TAG> <frase> <apoio> <saida.jpg>` para um story de texto.
- **Onde guardar:** artes e manifestos ficam fora do repositório do app, em `nutrion-brand/instagram/<período>/`.

**Manifesto** (um por lote):

```json
{
  "figmaFileKey": "XjSn4KQQQlzkOTy1gE3SrC",
  "posts": [
    { "date": "2026-11-30", "slot": "story-1", "kind": "story", "figma": ["11:105"] },
    { "date": "2026-11-30", "slot": "feed", "kind": "image", "figma": ["11:91"], "caption": "Legenda #tag" },
    { "date": "2026-12-01", "slot": "feed", "kind": "carousel", "figma": ["11:124", "11:138"], "caption": "..." },
    { "date": "2026-11-30", "slot": "story-2", "kind": "story", "files": ["2026-11-30-story-post.jpg"], "time": "20:30" }
  ]
}
```

- **Fontes da arte:** `figma` (ids das artes, exportadas na hora) ou `files` (JPEG local, caminho relativo ao
  manifesto).
- **Horário:** `time` é opcional e sobrepõe o horário padrão do slot.
- **Validação:** o script barra antes de subir qualquer coisa os casos de carrossel fora de 2 a 10, story com
  legenda, mais de 2.200 caracteres, mais de 30 hashtags e dia + slot repetido.

## 6. Operação semanal

1. Produza a semana no Figma (ou peça para o Claude gerar a partir dos modelos).
2. Gere os stories (`render-story`).
3. Escreva o manifesto e confira com `npm run instagram:fila -- <manifesto> --dry-run`.
4. Carregue com `npm run instagram:fila -- <manifesto>`. Rodar de novo só atualiza o que ainda está
   `pending`; post já publicado nunca é tocado.
5. Acompanhe a fila no painel do Supabase (tabela `instagram_posts`: status, permalink e erro) e pelos
   avisos por e-mail.

## 7. Pegadinhas que encontramos

- **Unified login:** a tela "API setup with Unified login" exige portfólio empresarial. O caminho sem
  portfólio é a configuração com **login do Facebook**, que exige uma Página ligada ao Instagram.
- **Token:** o token do Explorador dura cerca de 1 hora. O de Página, derivado do token longo, não expira.
- **Escopo do token:** a autorização no Explorador pode dar acesso a **todas** as suas páginas. Guarde só o
  token da Página do projeto e nunca o do usuário.
- **Arquivo do Figma no plano da empresa:** draft criado logado com o e-mail da empresa conta na cota do plano
  da empresa. Para ficar no pessoal, use **File → Save local copy** (.fig) e importe na conta pessoal (Drafts).
  Os IDs das artes se mantêm.
- **Legenda:** copie para a legenda só o que o app realmente faz hoje. Ex.: "iPhone em breve" enquanto o app
  não está na App Store.
- **zsh:** variável chamada `path` sobrescreve o `PATH` e quebra o terminal. Use outro nome em loops.
- **Download do S3 do Figma:** às vezes a conexão cai. O script tenta 3 vezes.

## 8. Custos

Tudo grátis no volume de 1 post + 2 stories por dia:

- API do Instagram e app da Meta: grátis.
- Supabase: cabe no plano grátis. São cerca de 90 chamadas de função por mês e poucos MB de imagem.
- Figma: plano grátis, exportando pela API REST.

## 9. Checklist para replicar

- [ ] Instagram comercial + Página do Facebook ligada
- [ ] App na Meta (sem portfólio), permissões de conteúdo, token pelo Explorador
- [ ] `scripts/instagram-token.mjs` → token de Página sem expiração no `.env.local`
- [ ] Bucket público `instagram` (JPEG)
- [ ] Migrations (tabela + cron) com a URL do projeto novo e `CRON_SECRET` no Vault
- [ ] `verify_jwt = false` da function no `config.toml`
- [ ] Secrets `INSTAGRAM_USER_ID` e `INSTAGRAM_ACCESS_TOKEN` (+ Gmail para os avisos)
- [ ] Deploy da function e teste do 403 sem segredo
- [ ] Modelos no Figma + `FIGMA_TOKEN` (`file_content:read`) na conta dona do arquivo
- [ ] Primeiro manifesto com um story para hoje, para ver o ciclo inteiro
- [ ] Capas dos destaques à mão no celular
