# Tasks · Publicação automática no Instagram

Spec: `spec.md` desta pasta. Branch: `feature/instagram-autopost`.

## T1 · Lógica da Graph API (`_shared/instagram.ts`) [TDD]
- **What:** validação de legenda, decisão por linha (publicar / pular por atraso / esperar), publicação
  de imagem, carrossel e story (containers → status FINISHED → publish → permalink), erros da Meta.
- **Where:** `supabase/functions/_shared/instagram.ts` + `instagram.test.ts`
- **Depends:** —
- **Done when:** testes IG-01 (legenda/itens) e IG-02 (decisão, publicação, erro, timeout) verdes.
- **Verify:** `npx vitest run supabase/functions/_shared/instagram.test.ts`

## T2 · Tabela `instagram_posts` (migration) + teste SQL
- **What:** tabela, checks (kind/slot/status, carrossel 2–10, story sem legenda), índice único
  (dia BRT + slot), RLS sem policies, `updated_at` automático, função `claim` atômica.
- **Where:** `supabase/migrations/20261128120000_instagram_posts.sql`,
  `supabase/tests/instagram_posts.test.sql`
- **Depends:** —
- **Done when:** teste SQL passa no banco local.

## T3 · Aviso aos admins compartilhado
- **What:** mover `emailAdmins` do `cron-ai-quota-alert` para `_shared/adminAlert.ts` (sem mudar
  comportamento) e criar `alertAdmins` (e-mail + push) para a nova function.
- **Where:** `supabase/functions/_shared/adminAlert.ts`, `cron-ai-quota-alert/index.ts`
- **Depends:** —
- **Done when:** `cron-ai-quota-alert` usa o shared; `deno check` limpo nas duas functions.

## T4 · Edge function `cron-instagram-publish`
- **What:** valida `X-Cron-Secret`, busca linhas vencidas, faz `claim`, publica pelo T1, grava o
  resultado, avisa admins em falha/atraso.
- **Where:** `supabase/functions/cron-instagram-publish/{index.ts,deno.json}`, `supabase/config.toml`
- **Depends:** T1, T2, T3
- **Done when:** `deno check` limpo; teste manual com uma linha real (story) após o deploy.

## T5 · Agendamento (migration de cron)
- **What:** `nutrion-instagram-publish`, `*/15 * * * *`, segredo do Vault (padrão `nutrion-*`).
- **Where:** `supabase/migrations/20261128120100_agenda_instagram_publish.sql`
- **Depends:** T4

## T6 · Script de carga da fila
- **What:** lê `scripts/data/instagram/<arquivo>.json`, exporta do Figma (REST, jpg, 1x), sobe no
  bucket, faz upsert por dia + slot sem tocar linha publicada; para cedo sem `FIGMA_TOKEN`.
- **Where:** `scripts/instagram-fila.mjs`, `scripts/data/instagram/2026-11-29.json`, `package.json`
- **Depends:** T2
- **Done when:** rodar duas vezes não duplica; dry-run lista o que faria.

## T7 · Produção (com ok do dev)
- `supabase db push`, `supabase secrets set INSTAGRAM_USER_ID INSTAGRAM_ACCESS_TOKEN`,
  `supabase functions deploy cron-instagram-publish`, carga da fila, 1 story real de teste.
