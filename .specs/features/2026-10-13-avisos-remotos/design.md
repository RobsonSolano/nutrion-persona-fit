# Avisos remotos + atualização pela loja — Design

## Banco (uma migration)

**`app_config`** — linha única (`id boolean primary key default true check (id)`):
`min_version text`, `recommended_version text`, `update_title text`, `update_message text`,
`android_store_url text`, `updated_at`. Leitura pra `anon` e `authenticated` (a checagem roda
deslogado, [ATU]-05); escrita só pelo painel (service role). Nasce com a linha criada e versões
nulas — nada aparece até alguém preencher ([ATU]-04).

**`announcements`** — `id`, `title`, `body`, `audience` (`todos|comum|aluno|professor`),
`cta_label`, `cta_url`, `starts_at default now()`, `ends_at`, `active default true`, `created_at`.
Sem policy de leitura direta: o app lê pela RPC, que já filtra por público ([AVI]-06).

**`announcement_views`** — `(user_id, announcement_id)` PK, `seen_at`. RLS: só a própria linha.

**RPCs (security definer, `authenticated`):**
- `my_pending_announcements()` — ativos, dentro do período, do público do usuário (ou `todos`),
  sem view dele; ordem `starts_at, created_at` ([AVI]-01, -03, -04).
- `mark_announcement_seen(p_id)` — grava a view de `auth.uid()`; idempotente ([AVI]-02).

## App

**Lógica pura — `src/lib/appVersion.ts`:**
- `compareVersions(a, b)` → -1/0/1, numérico por partes, ignora sufixo ([ATU]-07).
- `updateRequirement(installed, min, recommended)` → `'blocked' | 'recommended' | 'none'`
  ([ATU]-01, -02, -04). Mínima > recomendada: vale a mínima.

**Versão instalada:** `Updates.runtimeVersion ?? Constants.expoConfig?.version`.

**`useUpdateRequirement()`** — lê `app_config` (react-query, cache de 1h, sem retry agressivo) e
devolve o requisito + config. Erro/sem rede → `'none'` ([ATU]-06).

**`UpdateGate`** (raiz, `app/_layout.tsx`, vale deslogado):
- `blocked` → `ConfirmModal` não-dispensável, só "Atualizar agora" (abre a loja).
- `recommended` → "Atualizar" + "Depois"; "Depois" guarda em estado de sessão ([ATU]-03).
- Textos e link vêm do `app_config`, com padrões ([ATU]-08).

**`AnnouncementGate`** (montado nas duas áreas: abas do aluno/comum e painel do professor):
mostra o primeiro aviso pendente; fechar ou tocar no botão marca como visto. Rota interna (`/…`)
via router, externa via `Linking` ([AVI]-05). Usa `useSeenGate`.

**Ordem de modais ([MOD]):** os gates de vínculo e o de aviso retornam `null` quando
`useUpdateRequirement() === 'blocked'`; o `AnnouncementGate` também espera não haver aviso de
vínculo pendente (mesmas queries em cache — sem ida extra ao servidor). O modal de OTA some quando
bloqueado (atualizar o JS não resolve binário velho).
