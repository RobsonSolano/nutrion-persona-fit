# Item #5 — deltas entre o plano de 2026-07-29 e a develop de 2026-08-26

A spec de design e o plano de 10 tasks estão em:

- `docs/superpowers/specs/2026-07-29-cadastro-exercicio-professor-design.md` (268 linhas)
- `docs/superpowers/plans/2026-07-29-cadastro-exercicio-professor.md` (1.429 linhas)

Foram escritos 41 commits atrás. **Continuam válidos na intenção e na
arquitetura** — este documento registra só o que a base mudou desde então, e a
única decisão de produto nova.

## 1. A Task 9 Step 2 é impossível como escrita

O plano manda resolver o `coach_id` do aluno dentro do `plan-generator` usando
"o identificador que já existe no escopo". **Não existe:**

```ts
export async function generatePlan(
  supabase, groqApiKey: string, model: string, input: PlanInput,
)
```

Sem id de usuário, e `PlanInput` não tem `id` nem `coach_id`. Verificado.

**Resolução:** campo novo em `PlanInput` (`visible_owner_id?: string | null`),
preenchido pelos dois callers, que sabem quem é o dono:

- `onboarding-plan` — o próprio usuário; `coach_id` pode ser null (autônomo)
- `coach-generate-plan` — o `caller.id` é o professor do aluno

Preferível a mudar a assinatura: mantém `generatePlan` sem noção de auth.

## 2. São 4 functions para deploy, não 5

O plano lista `coach-save-student-plan` entre as que "bundlam" os `_shared`.
Ela faz `import type { PlanOut }` — **só tipo**, apagado no bundle. O deploy de
2026-08-26 confirmou: `No change found in Function: coach-save-student-plan`.

As que importam: `coach-import-workout-ai`, `coach-save-imported-workout`,
`coach-generate-plan`, `onboarding-plan`.

## 3. `fallbackPlan.ts` foi reescrito

As linhas 92-95 que a Task 9 Step 3 aponta não existem mais. A query virou
`buildFallbackRoutines(supabase, blockLowerLimbs)`, com dois conjuntos de
sessões (full body e superior). O `.is('owner_id', null)` continua correto,
em local novo.

## 4. `fetchCatalog` ganhou parâmetro

Hoje é `fetchCatalog(supabase, modalities, restrictions?)` e aplica
`.eq('requires_lower_limbs', false)` quando há restrição. O `.or(visibilityFilter)`
da Task 9 tem de compor com isso — PostgREST faz AND entre os operadores, então
funciona, mas é ponto de atenção no review.

## 5. A policy de insert chamava função sem grant

O plano usa `public._resolve_entitlement((select auth.uid()))`. Esse é o **core
interno**: só o wrapper no-arg tem `grant execute ... to authenticated`
(`20260622000000_billing_core.sql:166`), e o comentário na própria migration
diz *"Só o wrapper no-arg é exposto ao client; o core fica interno"*.

Chamar o core daria permission denied para o professor. Dar grant no core
deixaria qualquer usuário consultar o tier de outro (ele aceita uuid).

**Resolução:** usar `public.resolve_entitlement()`. Já tem grant, é
`security definer` + `stable`, e dentro de policy resolve pelo `auth.uid()`
corrente — que é exatamente a semântica desejada.

## Decisão de produto nova: `requires_lower_limbs`

A coluna nasceu em `20260826030000` como `not null default false`, e `false`
significa **liberado**. O item #5 é o primeiro portão que permite criar
exercício fora do seed — um "Agachamento Ravi" cadastrado pelo professor
nasceria liberado e chegaria a um aluno que declarou paraplegia. O filtro
reabriria em silêncio.

**Decidido (dev, 2026-08-26):**

1. **Coluna vira nullable, sem default.** `null` = não classificado. Como o
   filtro é `.eq('requires_lower_limbs', false)` e em SQL `null = false` não é
   verdadeiro, o não classificado **já sai** dos planos com restrição sem ser
   escondido de quem não tem restrição. Falha pro lado seguro.
2. **Toggle no formulário:** "Exige uso das pernas? Sim / Não", com a legenda
   *"Quem declarou não ter função de perna não recebe este exercício."* O
   professor é treinador — é quem sabe responder. Isso **altera o layout de
   form travado** na spec de julho, deliberadamente.

Consequência para o import por IA (`coach-save-imported-workout`): nasce sem
classificação, ou seja `null` — seguro por construção, sem trabalho extra.

Consequência para o enriquecimento futuro do catálogo (300 → 500): um lote
grande classificado por padrão de nome vai errar em alguns; com a coluna
nullable, o erro para fora é "não aparece pra quem tem restrição" em vez de
"agachamento no plano do cadeirante".

## Ajuste de fato menor

A spec diz "as ~500 linhas do seed". São **270** (medido em 2026-08-26).
