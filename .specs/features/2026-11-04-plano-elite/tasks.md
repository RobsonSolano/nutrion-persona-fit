# Tasks — Plano Elite (professor) + Pessoal Premium (comum)

> **Spec de origem:** `.specs/features/2026-11-04-plano-elite/spec.md` (decisões em `context.md`, mesma pasta)
> **Escopo deste plano:** só o que vive neste repositório (app): `[ELITE]-01..07` e `[PREM]-01..04`
> (app Expo + `supabase/migrations` + `supabase/functions` + `supabase/tests`).
> **Fora deste plano:** `[ELITE]-08` e a parte de painel de `[PREM]-05` (repo `../painel`), `[ELITE]-09`
> e o hotsite de `[PREM]-05` (repo `../hotsite`), `[ELITE]-10` e lojas (manual). Viram tarefas do chat
> principal depois. A parte SQL de `[ELITE]-08` (`admin_set_manual_plan` aceitar `'elite'`) mora aqui e
> está na T01. Não mexer em `.specs/features/2026-11-03-publicacao-ios`.
> **Data:** 2026-11-04 · **Branch:** `feature/plano-elite`

## Ondas

| Onda | Tarefas |
|---|---|
| 1 | T01 (banco: tier elite, limites, gates, own_tier), T02 (base TS: tipos, `tierAtLeast`, limites), T03 (edge: webhook elite + cotas de IA no servidor) |
| 2 | T04 (paywall e compra), T05 (telas de plano), T06 (busca de professores exige Pessoal Premium) |
| 3 | T07 (cotas de IA no cliente: chat e análise de prato) |

## Regras comuns a todas as tarefas

- Stack: Expo/React Native + expo-router, TypeScript, Supabase (Postgres + edge functions Deno), RevenueCat.
- Testes TS: `npx vitest run` (pega `src/lib/**/*.test.ts` e `supabase/functions/**/*.test.ts`; lógica
  pura em arquivo sem import Deno). `npm run typecheck` precisa ficar verde ao fim de cada tarefa.
- Testes SQL: `supabase/tests/*.test.sql`, transacionais (`begin` … `rollback`), terminam com
  `raise notice '<NOME>: ALL PASS'`. Rodar SÓ contra o Supabase LOCAL:
  `docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < arquivo`
  (subir com `supabase start -x vector` se o container não estiver de pé).
  **NUNCA** `supabase db push`, `--linked` ou qualquer coisa contra produção.
- Nome dos testes vitest começa pelo ID do requisito (ex.: `it('ELITE-02 premium tem limite 20', …)`).
- Textos em pt-BR com acentuação correta. Nenhum texto do app diz "ilimitado" para alunos.
- Commits: Conventional Commits pt-BR com os scopes do repo (`db`, `billing`, `paywall`, `coach`, `ia`…).
- Nenhuma tarefa é visual para o tester de navegador: o app é nativo (RevenueCat/expo-dev-client não
  rodam na web). A validação de tela é manual no aparelho, depois.

### Contrato compartilhado entre tarefas (definido aqui, não rediscutir)

- **Ordem dos tiers:** `free < pro < premium < elite`. SQL: função única `public._tier_rank(text)`
  (T01). TS do app: `src/lib/tier.ts` (T02). Edge functions: só `supabase/functions/_shared/aiQuota.ts`
  precisa da ordem (T03).
- **Limites de alunos (professor):** free 2 · pro 5 · premium 20 · elite 50. Nunca `null` para professor.
- **Erro do gate da busca (SQL → cliente):** `raise exception 'needs_upgrade:coach_discovery' using errcode = 'PT402'`.
  O PostgREST devolve HTTP 402 com `{ code: 'PT402', message: 'needs_upgrade:coach_discovery' }`; o
  cliente (T06) converte em `NeedsUpgradeError('coach_discovery')`.
- **Entitlement JSON ganha `own_tier`** (T01): o tier da assinatura PRÓPRIA da pessoa, antes de herdar do
  professor. Tipos TS: `own_tier?: Tier` e `store_active?: boolean` (opcionais: servidor antigo não manda).
- **Cotas de IA por dia:** `own_tier` premium ou elite → chat 20 / análise de prato 15; senão chat 10 / análise 8.
- **Produtos:** `nutrion_comum_pro`, `nutrion_comum_premium` (novo), `nutrion_prof_pro`,
  `nutrion_prof_premium`, `nutrion_prof_elite` (novo). Entitlements RevenueCat: `pro`, `premium`, `elite`
  (`nutrion_comum_premium` liga na `premium`, a mesma do professor Premium).
- **Feature key nova:** `'coach_discovery'` (402 / paywall do Pessoal Premium).

---

### T01 — Banco: tier `elite`, limites 20/50, gates premium-ou-acima e busca só para Pessoal Premium
**Onda:** 1 · **Visual:** não · **Depende de:** — · **Status:** finalizado

**O quê:** Uma migration nova que (1) aceita `'elite'` em `subscriptions.tier`; (2) cria `_tier_rank` como
lugar único da ordem dos tiers; (3) redefine `_resolve_entitlement` com elite reconhecido como tier pago,
`student_limit` free 2 / pro 5 / premium 20 / elite 50, `aluno_melhor_tier` com elite e o campo novo
`own_tier`; (4) `is_coach_discoverable` e a policy de cadastro de exercício aceitam premium ou acima;
(5) `admin_set_manual_plan` aceita `'elite'`; (6) `search_coaches`, `get_coach_public_profile` e
`request_coach` recusam usuário `comum` sem tier premium ou acima. Testes SQL novos e ajuste dos
existentes que quebram com a mudança.

**Arquivos:** `supabase/migrations/20261104000000_plano_elite.sql` (novo), `supabase/tests/plano_elite.test.sql` (novo), `supabase/tests/resolve_entitlement.test.sql`, `supabase/tests/request_coach_limit.test.sql`

**Da spec:**
- [ELITE]-01: ENTÃO `subscriptions.tier` aceita `'elite'` (check constraint atualizado), sem mexer nos dados
  existentes. ENTÃO a ordem dos tiers é `free < pro < premium < elite` e existe um único lugar no SQL que a define.
- [ELITE]-02: QUANDO o professor tem tier `premium`, ENTÃO `student_limit = 20`. QUANDO tem tier `elite`,
  ENTÃO `student_limit = 50`. ENTÃO nenhum tier de professor devolve `student_limit = null` (fim do
  ilimitado). Free 2 e Pro 5 não mudam. QUANDO `coach-create-student` (ou aceite de matrícula) é chamado com
  o limite atingido, ENTÃO responde `402 needs_upgrade` com `feature: 'student_limit'`, como hoje.
- [ELITE]-03: ENTÃO não existe marca de "Premium legado": o limite de 20 vale para todos os Premium,
  inclusive os atuais (consulta de 2026-11-04: nenhum professor passa de 20 alunos, máx. 11). QUANDO um
  Premium tiver mais de 20 alunos (ex.: caiu de Elite), ENTÃO vale o fluxo existente de "escolher quem fica".
- [ELITE]-04: QUANDO o professor é `elite`, ENTÃO aparece na busca de professores (mesmas demais regras:
  opt-in, CREF, perfil completo) e pode cadastrar exercícios próprios. QUANDO um aluno é vinculado a um
  professor `elite`, ENTÃO herda o melhor tier (regra `aluno_melhor_tier` estendida para `elite`). ENTÃO todo
  gate que hoje compara `tier === 'premium'` (app e SQL) passa a aceitar premium **ou acima**, via helper único.
- [ELITE]-08 (parte SQL): ENTÃO `set_manual_plan` aceita `p_tier = 'elite'` (o texto "Escolha Pro, Premium
  ou Elite" é do painel, fora daqui; o banco segue devolvendo `invalid_tier`).
- [PREM]-02 (servidor): QUANDO chama `search_coaches`, `get_coach_public_profile` ou `request_coach` sem o
  plano, ENTÃO o servidor recusa com erro `needs_upgrade` / `coach_discovery` (o gate não pode ser só
  visual). QUANDO o usuário já é `aluno` ou `professor`, ENTÃO o comportamento atual não muda. QUANDO a
  assinatura Premium do comum expira, ENTÃO solicitações já abertas continuam valendo (o gate é para buscar
  e pedir, não para cancelar o que já existe).
- [PREM]-03 (base de dados): QUANDO o usuário tem **assinatura própria** com tier `premium` ou acima (comum
  Premium, professor Premium ou Elite) → cota maior; aluno que só herda do professor fica na cota normal.
  O entitlement precisa expor isso (`own_tier`).

**Ler antes:**
- `supabase/migrations/20261014180000_plano_pago_por_fora.sql` linhas 28-145: versão MAIS RECENTE de
  `_resolve_entitlement` (a `20261014200000` não a redefine). Copiar inteira e alterar: linha 88
  (`v_tier in ('pro','premium')` → incluir elite via `_tier_rank`), linhas 97-117 (ramo do aluno: melhor
  tier com elite, `v_own_tier` já existe), linhas 128-133 (`student_limit`), e os dois `json_build_object`
  finais + os dois retornos antecipados de "sem perfil" (linhas 58-70) para incluir `'own_tier'`.
- `supabase/migrations/20261014200000_pago_por_fora_recorrencia.sql` linhas 223-289: versão MAIS RECENTE de
  `admin_set_manual_plan` (9 parâmetros), da assinatura `create or replace function public.admin_set_manual_plan(`
  (linha 223) até o revoke/grant (linhas 288-289). Copiar o bloco inteiro (cabeçalho, corpo, revoke e grant) e
  trocar só a linha 245 (`p_tier not in ('pro','premium')`). O `drop function if exists` da linha 222 é da
  assinatura antiga de 6 parâmetros: não repetir.
- `supabase/migrations/20261013030000_coach_discovery_rpcs.sql` linhas 26-68 (`is_coach_discoverable`,
  trocar a linha 46), 73-133 (`search_coaches`, `language sql`, RETURNS TABLE), 319-325 (grants).
- `supabase/migrations/20261013150000_avaliacao_comentario.sql` linhas 111-160: versão MAIS RECENTE de
  `get_coach_public_profile` (plpgsql).
- `supabase/migrations/20261013110000_request_coach_limite_abertas.sql`: versão MAIS RECENTE de
  `request_coach(uuid, text, text)` e o grant da última linha.
- `supabase/migrations/20260826050000_coach_custom_exercises.sql` linhas 90-109: policy
  `exercises_insert_premium_coach` (usa o wrapper `resolve_entitlement()`; ler o comentário do porquê).
- `supabase/migrations/20260622000000_billing_core.sql` linha 16 (check inline de `tier` → nome padrão
  `subscriptions_tier_check`; confirme com `\d public.subscriptions` no local) e linhas 149-166 (wrapper
  `resolve_entitlement()` e grants: o core é revogado de public).
- `supabase/migrations/20260723000000_student_suspension.sql` linhas 21-84: `sync_coach_student_access`
  (com limite 20 deixa de cair no ramo "null = todos ativos"; é o que dá o "escolher quem fica" do [ELITE]-03).
- `supabase/tests/resolve_entitlement.test.sql`: padrão de seed com `session_replication_role = replica` e
  o loop de asserções (uid, campo, esperado); a linha 71 espera `student_limit '<null>'` para premium →
  passa a `'20'`.
- `supabase/tests/request_coach_limit.test.sql` linhas 20-60: o comum `ffffffff-…-000000000010` chama
  `request_coach` via `set_config('request.jwt.claims', …)`; sem assinatura ele vai tomar o gate novo →
  semear uma `subscriptions` premium (`store_play`, `active`, `period_end` futuro) para ele.
- `supabase/tests/coach_enrollment.test.sql`: chama `search_coaches()` SEM `request.jwt.claims`
  (auth.uid() null) — tem de continuar passando sem alteração.
- `supabase/tests/painel_admin.test.sql` linhas 18-40: helpers `_t_err` (captura `sqlerrm`) e `_t_as`
  (troca de usuário) — bom modelo para o teste novo.

**Pronto quando:**
- `subscriptions_tier_check` aceita `free|pro|premium|elite`; nenhum `update` em dados existentes.
- `_tier_rank(text)` devolve 0/1/2/3 para free/pro/premium/elite (desconhecido/null → 0) e é o ÚNICO lugar
  da ordem: todas as comparações de tier da migration usam `_tier_rank(x) >= _tier_rank('premium')` (ou 'pro').
- `_resolve_entitlement`: professor free 2, pro 5, premium 20, elite 50, grandfather 2 (nunca null para
  professor); elite com loja/parceria/por fora/trial vale como tier pago (não cai para free); aluno de
  professor elite fica `tier = 'elite'` com `via = 'inherited'`; aluno com premium próprio e professor elite
  fica elite; JSON tem `own_tier` (= tier efetivo para não-aluno; para aluno = tier próprio antes de herdar,
  ex.: aluno sem assinatura de professor elite → `own_tier = 'free'`, `tier = 'elite'`).
- `is_coach_discoverable` aceita premium e elite; policy `exercises_insert_premium_coach` recriada com
  premium ou acima.
- `admin_set_manual_plan(..., p_tier => 'elite')` grava e devolve o entitlement com `tier = 'elite'`;
  `p_tier = 'free'` ou `'xpto'` segue `invalid_tier`.
- Gate da busca: helper `_require_coach_discovery(uuid)` que, para `role = 'comum'` com
  `_tier_rank(tier) < _tier_rank('premium')`, faz `raise exception 'needs_upgrade:coach_discovery' using errcode = 'PT402'`;
  chamado no início de `search_coaches`, `get_coach_public_profile` e `request_coach` (nesta, depois das
  checagens de role, para `already_student`/`invalid_role` não mudarem). Aluno e professor passam como hoje;
  `auth.uid()` null passa (os testes antigos dependem disso; o grant já é só `authenticated`).
- `cancel_my_enrollment_request`, `list_my_enrollment_requests` e `mark_enrollment_seen` NÃO recebem o gate.
- `supabase/tests/plano_elite.test.sql` cobre, com mensagens citando o ID: ELITE-01 (insert com `'elite'`
  passa; `_tier_rank` em ordem), ELITE-02 (limites 2/5/20/50), ELITE-03 (professor premium com 25 alunos:
  `sync_coach_student_access` deixa 20 ativos e 5 suspensos), ELITE-04 (elite encontrável; aluno herda
  elite; policy de exercício aceita elite — pode checar `pg_policies.with_check` contendo `_tier_rank`),
  ELITE-08 (`admin_set_manual_plan` com elite), PREM-02 (comum free e comum pro tomam `PT402` nas 3 RPCs;
  comum premium busca, vê perfil e pede; aluno e professor sem mudança; comum que perdeu o premium com
  solicitação aberta ainda cancela via `cancel_my_enrollment_request`), PREM-03 (`own_tier` de: comum
  premium, professor elite, aluno de professor elite sem assinatura própria, comum em trial).
  Termina com `PLANO_ELITE: ALL PASS`.
- Todos os `supabase/tests/*.test.sql` passam depois da migration aplicada no local.

**Verificar:**
```
docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261104000000_plano_elite.sql
for f in supabase/tests/*.test.sql; do echo "== $f"; docker exec -i supabase_db_nutrion psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" 2>&1 | grep -E "ALL PASS|ERROR" ; done
```
Rodar a migration duas vezes seguidas sem erro (idempotente). Nunca contra produção.

**Notas:**
- Migration idempotente: `drop constraint if exists` + `add constraint`; `create or replace function`;
  `drop policy if exists` + `create policy`. Cabeçalho no padrão do repo (bloco de comentário com spec e o
  que redefine a partir de qual migration).
- NÃO revogar `_tier_rank` de public: a policy de exercício roda como `authenticated` e chama a função.
  `_require_coach_discovery` pode ser revogada de public/anon/authenticated (só roda dentro das RPCs
  security definer).
- `search_coaches` é `language sql` com `RETURNS TABLE (coach_id …)`. Caminho mais simples: manter `sql`
  e pôr como primeira instrução `select public._require_coach_discovery(auth.uid());` (função SQL com
  várias instruções devolve a última). Se converter para plpgsql, os nomes do RETURNS TABLE viram variáveis
  e `where coach_id = c.id` dentro do lateral fica ambíguo: qualificar colunas ou usar
  `#variable_conflict use_column`.
- `request_coach` hoje devolve erros como JSON `{ok:false,error}`; o gate é `raise` (mesmo contrato das
  outras duas RPCs). A ordem fica: unauthorized → telefone → role (aluno/professor como hoje) → gate → resto.
- Edge functions `coach-create-student` (linha 156) e `coach-respond-enrollment` (linha 195) já fazem
  `student_limit !== null && count >= limit → needsUpgrade('student_limit')`: com limite numérico elas
  funcionam sem mudança. Não precisa tocar nelas.
- Professor `grandfather` continua `free` (D3) com limite 2.
- `admin_set_manual_plan` aceita `elite` para qualquer role (o painel decide o que oferecer).
- Commit sugerido: `feat(db): tier elite, limites 20/50 e busca de professores só no Pessoal Premium`.

---

### T02 — Base de tiers no app: tipo `elite`, helper `tierAtLeast` e limites sem "ilimitado"
**Onda:** 1 · **Visual:** não · **Depende de:** — · **Status:** finalizado

**O quê:** Atualiza os tipos de billing do cliente (`Tier` com `elite`, `own_tier`, `store_active`, feature
`coach_discovery`), cria `src/lib/tier.ts` como lugar único da ordem dos tiers no app (`tierAtLeast`,
rótulos e "há plano acima"), troca o gate de exercícios próprios para premium ou acima e tira o
"ilimitado" de `studentLimit`/`downgrade` (comentários e testes). Registra a ideia de franquia no STATE.md.

**Arquivos:** `src/types/billing.ts`, `src/lib/tier.ts` (novo), `src/lib/tier.test.ts` (novo), `src/hooks/useExercises.ts`, `src/lib/studentLimit.ts`, `src/lib/studentLimit.test.ts`, `src/lib/downgrade.ts`, `src/lib/downgrade.test.ts`, `.specs/project/STATE.md`

**Da spec:**
- [ELITE]-04: QUANDO o professor é `elite`, ENTÃO … pode cadastrar exercícios próprios. ENTÃO todo gate que
  hoje compara `tier === 'premium'` (app e SQL) passa a aceitar premium **ou acima**, via helper único
  (ex.: `tierAtLeast(tier, 'premium')`).
- [ELITE]-02: free 2 · pro 5 · premium 20 · elite 50; nenhum tier de professor devolve `student_limit = null`.
- [ELITE]-03: QUANDO um Premium tiver mais de 20 alunos (ex.: caiu de Elite), ENTÃO vale o fluxo existente de
  "escolher quem fica" (`needsStudentChoice`) e o paywall oferece o Elite.
- [ELITE]-07 / [PREM]-04 (base): telas mostram "Elite"/"Premium" e só oferecem upgrade quando há plano acima.
- Fora do escopo: "Franquia de alunos extras (R$ 2/aluno) e oferta para academias — registrar em `STATE.md`."

**Ler antes:**
- `src/types/billing.ts` (inteiro, 33 linhas): `Tier`, `Entitlement`, `FeatureKey`.
- `src/hooks/useExercises.ts` linhas 132-152: `useCanCreateExercise` com `entitlement.tier === 'premium'`
  (manter o "fecha por padrão" enquanto não resolveu; atualizar o comentário).
- `src/lib/studentLimit.ts` + `src/lib/studentLimit.test.ts` (o caso "null (premium ilimitado)").
- `src/lib/downgrade.ts` + `src/lib/downgrade.test.ts` (o caso "limite null (premium ilimitado)").
- `src/lib/purchaseSelection.ts` linha 15: `export type Role = 'aluno' | 'comum' | 'professor'` — use em
  `tier.ts` (`import type { Role }`) em vez de redeclarar.
- `.specs/project/STATE.md` linhas 1-10: formato das entradas (`### Título (data)` + parágrafos).
- `.specs/features/2026-11-04-plano-elite/context.md` seção "Ideias para depois": texto da franquia e B2B.

**Pronto quando:**
- `Tier = 'free' | 'pro' | 'premium' | 'elite'`; `Entitlement` ganha `own_tier?: Tier` e
  `store_active?: boolean` (comentário: `student_limit` null só para comum/aluno); `FeatureKey` ganha
  `'coach_discovery'`.
- `src/lib/tier.ts` exporta: `TIER_ORDER`, `tierRank(t)`, `tierAtLeast(tier, min)` (tier
  `null`/`undefined`/desconhecido = free), `TIER_LABEL: Record<Tier, string>` (Free/Pro/Premium/Elite),
  `topTierFor(role)` (professor → `elite`, comum → `premium`, aluno/indefinido → `null`) e
  `hasPlanAbove(role, tier)` (true só quando há tier comprável acima do atual para o role).
- `useCanCreateExercise` usa `tierAtLeast(entitlement.tier, 'premium')`.
- `grep -rn "=== 'premium'" src app` não acha mais o gate de `useExercises` (os demais saem nas T04-T06).
- Testes: `tier.test.ts` com `ELITE-01 ordem free<pro<premium<elite`, `ELITE-04 tierAtLeast(elite, premium)`,
  `ELITE-07 hasPlanAbove` (professor premium → true, elite → false; comum pro → true, premium → false;
  aluno → false); `studentLimit.test.ts` e `downgrade.test.ts` sem o texto "ilimitado" e com casos
  `ELITE-02` (20 e 50 bloqueiam no limite) e `ELITE-03` (premium com 25 alunos e limite 20 → precisa escolher).
- STATE.md ganha a entrada "Plano Elite e Pessoal Premium (2026-11-04)" com as ideias para depois
  (franquia ~R$ 2/aluno acima de 50, oferta para academias separada do Elite, limite num lugar só em
  `_resolve_entitlement`).
- `npm run typecheck` e `npx vitest run` verdes.

**Verificar:** `npx vitest run src/lib/tier.test.ts src/lib/studentLimit.test.ts src/lib/downgrade.test.ts && npm run typecheck && npx vitest run`

**Notas:**
- Não mudar a assinatura de `isStudentLimitReached`/`needsStudentChoice` (`number | null` continua, comum e
  aluno ainda recebem null); só comentários e testes.
- Componentes (`CoachPlanBadge`, `SubscriptionCard`) e `purchaseSelection` NÃO são desta tarefa (T04/T05
  usam o `tier.ts` daqui). O `Tier` com `elite` não deve quebrar o typecheck deles (usam `Record<string, string>`
  e `'pro' | 'premium'` próprios); se quebrar, ajuste mínimo de tipo só no arquivo desta tarefa.
- Commit sugerido: `feat(billing): tier elite no cliente e helper tierAtLeast`.

---

### T03 — Edge functions: webhook entende `elite` e cotas de IA 20/15 para assinatura própria premium+
**Onda:** 1 · **Visual:** não · **Depende de:** — · **Status:** finalizado

**O quê:** O webhook do RevenueCat grava `tier = 'elite'` quando a entitlement `elite` vem no evento
(prioridade elite > premium > pro). As cotas diárias do `chat-ai` saem das constantes fixas e passam a vir de
um helper puro compartilhado que lê `own_tier`: premium/elite próprio → chat 20 e análise de prato 15;
senão chat 10 e análise 8. A mensagem e o `limit` do 429 mostram a cota do usuário.

**Arquivos:** `supabase/functions/revenuecat-webhook/mapEvent.ts`, `supabase/functions/revenuecat-webhook/mapEvent.test.ts`, `supabase/functions/_shared/aiQuota.ts` (novo), `supabase/functions/_shared/aiQuota.test.ts` (novo), `supabase/functions/_shared/entitlement.ts`, `supabase/functions/chat-ai/index.ts`

**Da spec:**
- [ELITE]-05: QUANDO o evento traz a entitlement `elite`, ENTÃO `subscriptions.tier = 'elite'` (prioridade
  `elite > premium > pro`). ENTÃO os demais mapeamentos de status (trial, cancelamento, expiração, problema
  de cobrança) não mudam.
- [PREM]-01: `nutrion_comum_premium` liga na entitlement `premium` do RevenueCat (o webhook já mapeia para
  `tier = 'premium'`).
- [PREM]-03: QUANDO o usuário tem **assinatura própria** com tier `premium` ou acima (comum Premium,
  professor Premium ou Elite), ENTÃO as cotas diárias são **chat 20** e **análise de prato 15**. QUANDO não
  tem (free, Pro, trial, aluno que só herda do professor), ENTÃO seguem **chat 10** e **análise 8**. ENTÃO as
  cotas ficam num lugar só (helper compartilhado das edge functions), e a mensagem de limite mostra o número
  da cota do usuário.
- Pedido do dev: "se hoje chat for 10, aí vira 20; se sanity check for 8 vira 15".

**Ler antes:**
- `supabase/functions/revenuecat-webhook/mapEvent.ts` (inteiro): `SubState.tier` e a linha 22 (`baseTier`).
- `supabase/functions/revenuecat-webhook/mapEvent.test.ts`: helper `ev(type, extra)` e o estilo dos casos.
- `supabase/functions/revenuecat-webhook/index.ts` linha 41: grava `mapped.state.tier` (não precisa mudar).
- `supabase/functions/_shared/entitlement.ts` (inteiro): tipo `Entitlement` das edges (tier + comentário
  `student_limit` "null = ilimitado").
- `supabase/functions/chat-ai/index.ts` linhas 61-62 (constantes `DAILY_USER_MESSAGE_LIMIT = 10`,
  `DAILY_SANITY_CHECK_LIMIT = 8`), 190-193 (`const ent = await getEntitlement(supabase)`), 240-287 (as duas
  checagens de cota e os JSON 429 com `detail` e `limit`).
- `supabase/functions/chat-ai/sanityMath.ts` + `sanityMath.test.ts`: exemplo de módulo puro ao lado da edge
  importado pelo `index.ts` com extensão `.ts` e testado no vitest.

**Pronto quando:**
- `mapEvent.ts`: `tier: 'free' | 'pro' | 'premium' | 'elite'`; `baseTier` = elite se `entitlement_ids`
  contém `elite`, senão premium se contém `premium`, senão pro. Casos novos em `mapEvent.test.ts`:
  `ELITE-05 elite → tier elite`, `ELITE-05 elite+premium → elite`, `ELITE-05 CANCELLATION de elite mantém
  elite/canceled`, `ELITE-05 EXPIRATION → free`. Casos antigos intactos.
- `_shared/aiQuota.ts` (TS puro, sem import Deno nem `@supabase`): exporta `AI_QUOTA_BASE = { chat: 10, sanity: 8 }`,
  `AI_QUOTA_PREMIUM = { chat: 20, sanity: 15 }` e `dailyAiQuota(ent: { own_tier?: string | null })` →
  `{ chat, sanity }`. `own_tier` premium/elite → premium; qualquer outro, ausente ou null → base.
- `aiQuota.test.ts`: `PREM-03` para own_tier free/pro/premium/elite/undefined e para o aluno que herda
  (`{ tier: 'elite', own_tier: 'free' }` → 10/8).
- `_shared/entitlement.ts`: `tier` com `'elite'`, campo `own_tier?: 'free' | 'pro' | 'premium' | 'elite'`,
  comentário de `student_limit` sem "ilimitado" (null só para comum/aluno).
- `chat-ai/index.ts`: constantes removidas; `const quota = dailyAiQuota(ent)` logo depois do gate de
  `ai_personal`; as comparações usam `quota.chat` / `quota.sanity`; `detail` e `limit` dos dois 429 usam o
  mesmo número (ex.: "Você atingiu o limite de 20 mensagens hoje. Volta amanhã!").
- `npx vitest run` e `npm run typecheck` verdes.

**Verificar:** `npx vitest run supabase/functions/revenuecat-webhook/mapEvent.test.ts supabase/functions/_shared/aiQuota.test.ts && npx vitest run && npm run typecheck`
(o `tsconfig` exclui `supabase/`, então o typecheck do Deno não roda aqui; conferir os imports `.ts` relativos
no `index.ts` à mão. Se o Deno estiver instalado: `deno check supabase/functions/chat-ai/index.ts`).

**Notas:**
- Sem `own_tier` no JSON (servidor antes da T01 subir) o helper cai em 10/8: falha para o lado barato.
- A ordem dos tiers aqui é só "premium ou elite" dentro do `aiQuota.ts`; não criar outro helper de tier
  nas edges.
- Ordem de deploy (para o roteiro da entrega, não executar): a migration com o check `elite` tem de subir
  antes do webhook novo, senão o upsert com `tier = 'elite'` falha no check constraint.
- Não fazer deploy de função nem mexer em `package.json` (`fn:deploy`).
- Commit sugerido: `feat(billing): webhook com elite e cotas de IA maiores no premium`.

---

### T04 — Paywall e compra: Elite para professor, Pessoal Premium para comum, sem "ilimitado"
**Onda:** 2 · **Visual:** não · **Depende de:** T02 · **Status:** finalizado

**O quê:** O paywall passa a oferecer a escada completa. Professor free vê Pro, Premium e Elite; pro vê
Premium e Elite; premium vê só Elite; elite não vê planos e, se estourou o limite, vê que o Elite é o maior
plano com atalho para o suporte. Comum free vê Pro e Premium; comum pro vê Premium; comum premium não vê
planos. O plano "Recomendado" segue o produto sugerido para a feature. A troca de plano (premium → elite,
pro → premium do comum) substitui o produto antigo só quando há assinatura de loja ativa. Textos sem
"ilimitado" e com a feature `coach_discovery`.

**Arquivos:** `src/lib/purchaseSelection.ts`, `src/lib/purchaseSelection.test.ts`, `src/lib/paywallContent.ts`, `src/lib/paywallContent.test.ts`, `app/paywall.tsx`

**Da spec:**
- [ELITE]-06: QUANDO professor free abre o paywall, ENTÃO vê **Pro, Premium e Elite**; pro vê Premium e Elite;
  premium vê só Elite; elite não vê planos. QUANDO estoura o limite sendo pro, ENTÃO o produto sugerido é
  Premium; sendo premium, é Elite. QUANDO estoura o limite sendo elite, ENTÃO o paywall não oferece compra e
  mostra que o Elite é o maior plano, com atalho para o suporte do app. QUANDO troca premium → elite na Play,
  ENTÃO é troca de plano (substitui o produto antigo, sem cobrança dupla), como já é pro → premium. ENTÃO os
  textos dizem: Pro "Até 5 alunos" · Premium "Até 20 alunos" · Elite "Até 50 alunos"; nenhum texto do app diz
  "ilimitado" para alunos.
- [ELITE]-03: … e o paywall oferece o Elite (Premium acima de 20 alunos).
- [PREM]-01: produto `nutrion_comum_premium` (R$ 29,90/mês), entitlement `premium`. O Pessoal Premium inclui
  tudo do Pessoal Pro + busca de professores + cotas de IA maiores.
- [PREM]-02: paywall do Pessoal Premium (`feature: 'coach_discovery'`).
- [PREM]-04: QUANDO comum free abre o paywall, ENTÃO vê **Pro e Premium**; comum Pro vê Premium; comum
  Premium não vê planos. QUANDO troca Pro → Premium na Play, ENTÃO é troca de plano (substitui o produto
  antigo, sem cobrança dupla). ENTÃO os textos do Premium pessoal dizem: "Tudo do Pro", "Encontre um
  professor no app", "20 mensagens e 15 análises de prato por dia" (Pro: "10 mensagens e 8 análises por dia").
- Tabela de planos: Professor Pro R$ 15,90 (5 alunos) · Premium R$ 29,90 (20, busca, exercícios próprios) ·
  Elite R$ 49,90 (50, busca, exercícios próprios). Comum Pro R$ 15,90 (chat 10, prato 8) · Premium R$ 29,90
  (chat 20, prato 15, busca de professores). Preço exibido vem do RevenueCat, não de texto fixo.

**Ler antes:**
- `src/lib/purchaseSelection.ts` (inteiro): `ProductId`, `selectProductId` (hoje sem uso fora dos testes),
  `findPackage`, `Plan`, `availablePlans`.
- `src/lib/purchaseSelection.test.ts`: casos de `selectProductId` (linhas 17-95) e `availablePlans`
  (124-153) a atualizar; nomes antigos citam "ilimitado" e "20 alunos" do Pro — corrigir.
- `src/lib/paywallContent.ts` (inteiro): `PERSONAL` (bullet "Chat IA ilimitado"), `STUDENT_LIMIT` (bullet
  "Premium: alunos ilimitados"), `paywallContent(feature)` e `planContent(tier, role)`.
- `src/lib/paywallContent.test.ts`: estrutura dos testes atuais.
- `src/lib/tier.ts` (da T02): `tierAtLeast`, `hasPlanAbove`, `TIER_LABEL`.
- `src/types/billing.ts` (da T02): `Entitlement.store_active`, `FeatureKey` com `coach_discovery`.
- `app/paywall.tsx`: linhas 50-55 (header/role/currentTier/plans), 58-62 (`refreshEntitlement(targetTier?:
  'pro' | 'premium')`), 93-108 (oldProductId: hoje "currentTier !== 'free'" e falha fechado se não acha o
  produto), 196-203 (card "Tudo certo!" quando `plans.length === 0`), 214-262 (cards; `c.highlight` vira
  "Recomendado").
- `src/services/billing.ts` linhas 67-99: `getActiveProductId` e `purchasePackage(pkg, { oldProductId })`
  (já faz a troca com proração; não precisa mudar).
- Rotas de suporte: `app/suporte/index.tsx` (lista) e `app/suporte/nova.tsx` (nova mensagem, sem params
  obrigatórios); hoje o perfil navega com `router.push('/suporte' as Href)`.

**Pronto quando:**
- `ProductId` inclui `nutrion_comum_premium` e `nutrion_prof_elite`; `Plan.tier` é `'pro' | 'premium' | 'elite'`.
- `availablePlans`: professor free → [pro, premium, elite]; pro → [premium, elite]; premium → [elite];
  elite → []; comum free → [comum_pro, comum_premium]; comum pro → [comum_premium]; comum premium/elite → [];
  aluno/indefinido → []. Para todo role×tier, `availablePlans(...).length > 0 === hasPlanAbove(role, tier)`
  (teste que amarra as duas regras).
- `selectProductId`: professor free → prof_pro; pro + `student_limit` → prof_premium; premium +
  `student_limit` → prof_elite; elite → null; comum free → comum_pro, exceto `coach_discovery` → comum_premium;
  comum pro → comum_premium; comum premium+ → null; aluno → null.
- Paywall marca "Recomendado" no plano cujo `productId` é o de `selectProductId({ role, feature, currentTier })`
  (se for null, nenhum destaque ou o último da lista, o que ficar mais simples e coerente).
- Troca de plano: `oldProductId` só é buscado quando `entitlement.store_active` é true; sem loja ativa
  (trial do servidor, parceria, pago por fora) é compra normal. O "falha fechado" continua valendo quando
  `store_active` é true e o produto atual não é confirmado.
- `refreshEntitlement` aceita `'elite'`.
- Card de "sem planos" (`plans.length === 0`), regra única: quando `role === 'professor'`,
  `currentTier === 'elite'` e `feature === 'student_limit'`, mostra o card do maior plano (o Elite é o maior
  plano, até 50 alunos) com o botão "Falar com o suporte" que leva a `/suporte/nova`. Em qualquer outro caso
  sem planos (professor elite sem feature ou com outra feature, comum premium, aluno), mostra o "Tudo certo!"
  atual.
- `paywallContent`: nova entrada `coach_discovery` (título do tipo "Encontre um professor", plano "Plano
  Pessoal Premium"); `STUDENT_LIMIT` com "Pro: até 5 alunos", "Premium: até 20 alunos", "Elite: até 50
  alunos"; `PERSONAL` sem "ilimitado".
- `planContent(tier, role)`: professor Pro "Até 5 alunos" + IA de professor; Premium "Até 20 alunos" + "Tudo do
  Pro" + aparecer na busca + exercícios próprios; Elite "Até 50 alunos" + "Tudo do Premium"; comum Pro
  "10 mensagens e 8 análises por dia" + análise de prato por foto; comum Premium "Tudo do Pro", "Encontre um
  professor no app", "20 mensagens e 15 análises de prato por dia".
- `grep -rni "ilimitad" src/lib/paywallContent.ts src/lib/purchaseSelection.ts app/paywall.tsx` vazio.
- Testes nomeados `ELITE-06 …`, `PREM-04 …`, `PREM-02 …` (coach_discovery). `npx vitest run` e
  `npm run typecheck` verdes.

**Verificar:** `npx vitest run src/lib/purchaseSelection.test.ts src/lib/paywallContent.test.ts && npx vitest run && npm run typecheck`
Validação de tela fica para o aparelho (RevenueCat não roda na web).

**Notas:**
- `findPackage` já casa `productId:basePlan` (Google); não mudar.
- Os produtos novos só aparecem quando existirem na Play + offering do RevenueCat ([ELITE]-10/[PREM]-05,
  manual). Sem package o botão fica desabilitado (comportamento atual, `disabled={busy || !pkg}`); não tratar
  como erro.
- Comum vira Premium pela mesma entitlement `premium` do professor; o `pollUntil` espera `tier === 'premium'`.
- Não mexer em `src/services/billing.ts`.
- Commit sugerido: `feat(paywall): planos Elite e Pessoal Premium com troca de plano`.

---

### T05 — Telas de plano: badge e "Minha assinatura" com Elite, X/50 e upgrade só se houver plano acima
**Onda:** 2 · **Visual:** não · **Depende de:** T02 · **Status:** finalizado

**O quê:** `CoachPlanBadge` (home do professor) e `SubscriptionCard` (perfil do comum e do professor)
passam a mostrar Elite e Premium do comum, o contador `X/limite` sempre que houver limite (Elite `X/50`), sem
"Alunos ilimitados", e só oferecem "Fazer upgrade" quando existe plano acima. O texto do perfil público do
professor passa a dizer que Premium ou Elite aparecem na busca.

**Arquivos:** `src/components/CoachPlanBadge.tsx`, `src/components/SubscriptionCard.tsx`, `app/(coach)/(painel)/perfil.tsx`

**Da spec:**
- [ELITE]-07: ENTÃO `CoachPlanBadge`, `SubscriptionCard` e perfil mostram "Elite", contador `X/50`, e só
  oferecem upgrade quando há plano acima.
- [PREM]-04: ENTÃO `SubscriptionCard` e perfil do comum mostram "Premium" e só oferecem upgrade quando há plano acima.
- [ELITE]-06: nenhum texto do app diz "ilimitado" para alunos.
- [ELITE]-04: aparecer na busca vale para premium ou acima.

**Ler antes:**
- `src/components/CoachPlanBadge.tsx` (inteiro): `TIER_LABEL` local, `isPremium`, `canUpgrade = !isPremium`,
  `upgradeFeature`, texto "Alunos ilimitados" (linha 56).
- `src/components/SubscriptionCard.tsx` (inteiro): `TIER_LABEL` local, `canUpgrade` (linha 47, "comum só
  chega a Pro"), `upgradeFeature()` (linhas 52-55), coroa só para premium (linha 99), "Alunos ilimitados."
  (linha 117).
- `app/(coach)/(painel)/perfil.tsx` linhas 242-246: texto "Só professores com plano Premium aparecem na busca."
- `src/lib/tier.ts` (da T02): `TIER_LABEL`, `tierAtLeast`, `hasPlanAbove`.
- `src/lib/paywall.ts`: `openPaywall(feature)`.

**Pronto quando:**
- Os dois componentes usam `TIER_LABEL` de `src/lib/tier.ts` (sem mapa local) e mostram "Plano Elite" para
  elite.
- `CoachPlanBadge`: coroa para premium ou acima (`tierAtLeast(tier, 'premium')`); contador
  `${count}/${limit} alunos` também para premium (20) e elite (50), com "· limite atingido" no teto; sem
  "Alunos ilimitados" (se o limite vier null por servidor antigo, não mostrar contador); botão de upgrade só
  com `hasPlanAbove('professor', tier)`; feature do upgrade: free → `coach_generate_plan`, pro e premium →
  `student_limit` (o paywall da T04 sugere Premium e Elite respectivamente).
- `SubscriptionCard`: `canUpgrade = hasPlanAbove(role, tier)` (professor até elite, comum até premium);
  `upgradeFeature()` do comum: free → `chat`, pro → `coach_discovery`; professor igual ao badge; coroa para
  premium ou acima; professor mostra "Até N alunos." (sem "(s)" quando der: "Até 1 aluno."/"Até 20 alunos.")
  e nada de "Alunos ilimitados.".
- Perfil do professor: "Só professores com plano Premium ou Elite aparecem na busca."
- `grep -rni "ilimitad" src/components app/\(coach\)` vazio; `grep -n "=== 'premium'" src/components` vazio.
- `npm run typecheck` e `npx vitest run` verdes.

**Verificar:** `npm run typecheck && npx vitest run`
Roteiro manual no aparelho (depois): professor elite na home vê "Plano Elite · X/50 alunos" sem botão de
upgrade; professor premium vê "X/20" e "Fazer upgrade"; comum pro no Perfil vê "Plano Pro" com upgrade; comum
premium vê "Plano Premium" com coroa e sem upgrade.

**Notas:**
- Componentes RN não têm teste vitest (vitest só pega `src/lib`); a regra testável já está em `tier.ts` (T02).
- Não mexer no paywall nem em `purchaseSelection` (T04, mesma onda).
- Commit sugerido: `feat(coach): telas de plano com Elite e Pessoal Premium`.

---

### T06 — Busca de professores exige Pessoal Premium (tela + erro do servidor)
**Onda:** 2 · **Visual:** não · **Depende de:** T01, T02 · **Status:** finalizado

**O quê:** Usuário `comum` sem tier premium ou acima que abre "Encontrar professor" (lista ou perfil público)
vê o paywall do Pessoal Premium (`coach_discovery`) em vez do conteúdo, e as consultas nem disparam. Se o
servidor recusar (402 `PT402` / `needs_upgrade:coach_discovery`) em busca, perfil ou pedido, o app abre o
mesmo paywall em vez de mostrar erro. Aluno e professor seguem como hoje.

**Arquivos:** `src/lib/needsUpgrade.ts`, `src/lib/needsUpgrade.test.ts`, `src/services/enrollment.ts`, `src/hooks/useEnrollment.ts`, `app/encontrar-professor/index.tsx`, `app/encontrar-professor/[id].tsx`

**Da spec:**
- [PREM]-02: QUANDO um usuário `comum` sem tier `premium` ou acima abre "Encontrar professor" (lista ou
  perfil), ENTÃO vê o paywall do Pessoal Premium (`feature: 'coach_discovery'`) em vez da lista. QUANDO chama
  `search_coaches`, `get_coach_public_profile` ou `request_coach` sem o plano, ENTÃO o servidor recusa com
  erro `needs_upgrade` / `coach_discovery` (o gate não pode ser só visual). QUANDO o usuário já é `aluno` ou
  `professor`, ENTÃO o comportamento atual não muda. QUANDO a assinatura Premium do comum expira, ENTÃO
  solicitações já abertas continuam valendo (o gate é para buscar e pedir, não para cancelar o que já existe).
- context.md: "Busca de professores (comum) — Exige Pessoal Premium R$ 29,90; bloqueia ver lista **e** pedir
  matrícula. Hoje é grátis para qualquer comum."
- [ELITE]-04: todo `tier === 'premium'` do app vira premium ou acima via `tierAtLeast`.

**Ler antes:**
- Contrato do erro (T01): `raise exception 'needs_upgrade:coach_discovery' using errcode = 'PT402'` → o
  `error` do `supabase.rpc` chega com `code: 'PT402'` e `message: 'needs_upgrade:coach_discovery'`.
- `src/lib/needsUpgrade.ts` (inteiro): `NeedsUpgradeError`, `parseNeedsUpgrade`, `needsUpgradeFromInvokeError`
  (modelo para o novo `needsUpgradeFromRpcError`).
- `src/lib/needsUpgrade.test.ts`: estilo dos casos.
- `src/lib/paywall.ts`: `openPaywall(feature)` e `handleNeedsUpgrade(err)`.
- `src/services/enrollment.ts` linhas 88-142: `searchCoaches`, `getCoachPublicProfile`, `requestCoach`
  (todas fazem `if (error) throw error`).
- `src/hooks/useEnrollment.ts` linhas 40-56: `useCoachSearch(filters, enabled = true)` já tem `enabled`;
  `useCoachPublicProfile(coachId)` não tem.
- `app/encontrar-professor/index.tsx`: linha 33 (`useCoachSearch(filtros)`), 198-213 (`EmptyState` com
  "Só professores com plano Premium…").
- `app/encontrar-professor/[id].tsx`: linhas 39-73 (hooks, `role`, `jaEhAluno`, `temAssinaturaPropria`
  com `=== 'pro' || === 'premium'`), 74-94 (`enviar()` → `alert.showError(err)`), 276-295 (aviso de
  assinatura própria).
- `src/hooks/useEntitlement.ts` (C6: enquanto não resolveu, não bloquear; o servidor é a autoridade).
- `src/lib/tier.ts` (da T02): `tierAtLeast`.

**Pronto quando:**
- `needsUpgradeFromRpcError(error)` em `src/lib/needsUpgrade.ts`: devolve `NeedsUpgradeError(feature)` quando
  `code === 'PT402'` ou a mensagem começa com `needs_upgrade:` (feature = o que vem depois dos dois pontos);
  qualquer outro erro → null. Testes `PREM-02 …` (PT402, só mensagem, erro comum → null, null/undefined → null).
- `searchCoaches`, `getCoachPublicProfile` e `requestCoach` lançam o `NeedsUpgradeError` quando for o caso
  (demais erros seguem como hoje).
- Tela da lista e do perfil: `locked = role === 'comum' && entitlement resolvido && !tierAtLeast(tier, 'premium')`.
  Com `locked`, a query não dispara (`enabled: false`) e a tela troca para o paywall
  (`router.replace({ pathname: '/paywall', params: { feature: 'coach_discovery' } })`), de modo que voltar
  do paywall não cai numa lista vazia. Erro `NeedsUpgradeError` vindo da query ou do `enviar()` faz o mesmo
  (via `handleNeedsUpgrade`) em vez de alerta de erro.
- `useCoachPublicProfile(coachId, enabled = true)`.
- Aluno e professor: nenhuma mudança de comportamento (aluno ainda abre o perfil do próprio professor para
  avaliar; professor ainda pré-visualiza o próprio perfil).
- `temAssinaturaPropria` usa `tierAtLeast(entQ.data?.tier, 'pro')`.
- `EmptyState`: "Só professores com plano Premium ou Elite e perfil público aparecem na busca."
- `grep -n "=== 'premium'" app/encontrar-professor` vazio. `npx vitest run` e `npm run typecheck` verdes.

**Verificar:** `npx vitest run src/lib/needsUpgrade.test.ts && npx vitest run && npm run typecheck`
Roteiro manual no aparelho (depois, com a migration da T01 no local): comum free toca "Encontrar professor"
no Perfil → abre o paywall com Pro e Premium e o cabeçalho da busca; comum premium vê a lista e pede
matrícula; aluno abre o perfil do professor e avalia normalmente.

**Notas:**
- `minhas-solicitacoes.tsx` e o cancelamento não passam pelo gate (solicitação aberta continua valendo);
  não mexer neles.
- O conteúdo do paywall para `coach_discovery` (título, bullets, plano sugerido) é da T04, na mesma onda; aqui
  só se abre o paywall com essa feature.
- O botão "Encontrar professor" do Perfil do comum (`app/(tabs)/perfil.tsx` linha 200) continua levando à
  rota; o gate fica na tela. Não mexer em `perfil.tsx`.
- Commit sugerido: `feat(coach): busca de professores exige Pessoal Premium`.

---

### T07 — Cota de IA no app: chat 20 e análise de prato 15 para assinatura própria premium+
**Onda:** 3 · **Visual:** não · **Depende de:** T02, T03 · **Status:** pendente

**O quê:** Os dois checks proativos de cota do app deixam as constantes fixas e passam a usar a mesma regra
do servidor (`own_tier` premium/elite → chat 20 e análise de prato 15; senão chat 10 e análise 8):
(1) o chat (contador `X/limite hoje`, "Você tem N mensagens por dia", bloqueio do envio e das sugestões e o
aviso "Você usou as N mensagens de hoje"); (2) a análise de prato (badge `usados/limite` e bloqueio antes de
tentar). Enquanto o entitlement não carregou, nenhum dos dois bloqueia (o servidor é a autoridade). Um teste
garante que o espelho do cliente bate com o helper das edge functions.

**Arquivos:** `src/lib/aiQuota.ts` (novo), `src/lib/aiQuota.test.ts` (novo), `src/services/aiUsage.ts`, `src/hooks/useAiUsage.ts`, `src/services/chatMessages.ts`, `src/hooks/useChat.ts`

**Da spec:**
- [PREM]-03: QUANDO o usuário tem **assinatura própria** com tier `premium` ou acima (comum Premium,
  professor Premium ou Elite), ENTÃO as cotas diárias são **chat 20** e **análise de prato 15**. QUANDO não
  tem (free, Pro, trial, aluno que só herda do professor), ENTÃO seguem **chat 10** e **análise 8**. ENTÃO as
  cotas ficam num lugar só (helper compartilhado das edge functions), e a mensagem de limite mostra o número
  da cota do usuário.
- Pedido do dev: "se hoje chat for 10, aí vira 20; se sanity check for 8 vira 15".

**Ler antes:**
- `supabase/functions/_shared/aiQuota.ts` (da T03): `AI_QUOTA_BASE`, `AI_QUOTA_PREMIUM`, `dailyAiQuota`.
- `src/services/aiUsage.ts` (inteiro): `DAILY_SANITY_CHECK_LIMIT = 8` "espelha o servidor" e
  `DAILY_ONBOARDING_LIMIT` (não muda).
- `src/hooks/useAiUsage.ts` (inteiro): `useDailySanityUsage()` devolve `limit`, `remaining`, `limitReached`
  a partir de `DAILY_SANITY_CHECK_LIMIT`.
- `src/services/chatMessages.ts` linha 3: `export const DAILY_USER_MESSAGE_LIMIT = 10` (único consumidor:
  `useChat.ts`; `MAX_MESSAGE_CHARS` e `HISTORY_VISIBLE_LIMIT` não mudam).
- `src/hooks/useChat.ts`: linhas 5-12 (import de `DAILY_USER_MESSAGE_LIMIT`), 25 (reexport
  `export { DAILY_USER_MESSAGE_LIMIT, MAX_MESSAGE_CHARS }`), 115-117 (`dailyCount`, `remaining`,
  `limitReached` com a constante), 148 (`sendMessage` sai cedo com `limitReached`), 240 (deps do
  `useCallback`), 329-331 (`dailyLimit: DAILY_USER_MESSAGE_LIMIT`, `remaining`, `limitReached` devolvidos).
- `app/(tabs)/chat.tsx` (só leitura, não muda): linhas 36-48 (desestrutura `dailyCount`, `dailyLimit`,
  `remaining`, `limitReached` do `useChat()`), 67 e 79 (`handleSend`/`handleSuggestion` param com
  `limitReached`), 109-113 (`cotaColor` usa `remaining <= 3`), 150 (`{dailyCount}/{dailyLimit} hoje`),
  173 ("Você tem {dailyLimit} mensagens por dia"), 185 (sugestões `disabled={limitReached}`), 224 e 230
  (aviso "Limite diário atingido" / "Você usou as {dailyLimit} mensagens de hoje"). Tudo lê do hook, então
  mudar o hook basta.
- `src/hooks/useEntitlement.ts` linhas 11-30: `useEntitlement()` e o comentário C6 ("enquanto o entitlement
  não resolveu, NÃO bloquear — o 402 do servidor é a autoridade. Por isso `data ? !data.x : false`").
- `app/sanity-check.tsx` linhas 44-52 e 113-118: usa `sanityUsage.limit` e `err.limit` do 429 (não precisa
  mudar; confirma que lê o limite do hook).
- `src/types/billing.ts` (da T02): `Entitlement.own_tier`.

**Pronto quando:**
- `src/lib/aiQuota.ts` (puro): `dailyAiQuota(ent)` com a mesma regra e os mesmos números do servidor
  (constantes próprias, sem importar de `supabase/`, porque o `tsconfig` exclui a pasta), e
  `quotaState(used: number, limit: number, resolved: boolean)` → `{ limit, remaining, limitReached }`, com
  `limitReached = resolved && used >= limit` (sem entitlement resolvido, nunca bloqueia).
- `src/lib/aiQuota.test.ts`: `PREM-03` para own_tier free/pro/premium/elite/undefined nos dois campos
  (chat 10/10/20/20/10, sanity 8/8/15/15/8) e o aluno que herda (`{ tier: 'elite', own_tier: 'free' }` →
  chat 10, sanity 8); `PREM-03 chat premium não bloqueia na 11ª` (`quotaState(10, 20, true).limitReached`
  false; `quotaState(20, 20, true)` true; `quotaState(10, 10, true)` true); `PREM-03 sem entitlement não
  bloqueia` (`quotaState(8, 8, false).limitReached` e `quotaState(10, 10, false).limitReached` false); mais
  um teste que importa `../../supabase/functions/_shared/aiQuota` e compara os dois helpers para todos os
  tiers (o vitest resolve o caminho relativo).
- `useDailySanityUsage()`: `ent = useEntitlement().data`; `limit = dailyAiQuota(ent ?? {}).sanity`;
  `remaining`/`limitReached` via `quotaState(used, limit, !!ent)`.
- `useChat()`: `ent = useEntitlement().data`; `dailyLimit = dailyAiQuota(ent ?? {}).chat`;
  `remaining`/`limitReached` via `quotaState(dailyCount, dailyLimit, !!ent)`; devolve `dailyLimit` com esse
  valor (não mais a constante). Com o entitlement ainda carregando, `limitReached` é false no chat e na
  análise de prato (o servidor é a autoridade; o contador mostra o limite base até resolver).
- `DAILY_USER_MESSAGE_LIMIT` sai de `chatMessages.ts` e do reexport de `useChat.ts`, e
  `DAILY_SANITY_CHECK_LIMIT` sai de `aiUsage.ts` (ou viram o valor base reexportado de `src/lib/aiQuota.ts`),
  sem deixar consumidor quebrado (`grep -rn "DAILY_USER_MESSAGE_LIMIT\|DAILY_SANITY_CHECK_LIMIT" src app`
  só acha o helper ou nada).
- `npx vitest run` e `npm run typecheck` verdes.

**Verificar:** `npx vitest run src/lib/aiQuota.test.ts && npx vitest run && npm run typecheck`
Roteiro manual no aparelho (depois, com T01 e T03 no local): comum premium manda a 11ª mensagem do chat no
dia sem bloqueio e o contador mostra `11/20 hoje` (o texto vazio diz "Você tem 20 mensagens por dia"); comum
pro trava na 11ª com "Você usou as 10 mensagens de hoje"; comum premium faz a 9ª análise de prato sem
bloqueio e o badge mostra `/15`; comum pro bloqueia na 9ª com "Você já usou suas 8 análises de prato de hoje".

**Notas:**
- `app/(tabs)/chat.tsx` e `app/sanity-check.tsx` não mudam: leem `dailyLimit`/`limit`, `remaining` e
  `limitReached` dos hooks. Se o typecheck apontar consumidor da constante removida fora dos arquivos desta
  tarefa, reexportar o valor base em vez de editar o consumidor.
- `useChat` já importa `useAuth` de `./useAuth`; importar `useEntitlement` de `./useEntitlement` no mesmo
  estilo. As deps do `useCallback` do `sendMessage` (linha 240) já têm `limitReached`; não precisam mudar.
- A mensagem do 429 do servidor (T03) segue sendo a autoridade quando o cliente deixa passar.
- Commit sugerido: `feat(ia): cotas de chat e análise de prato do premium no app`.
