# Tasks — Exercícios em conjunto (bi-set) + descrição do catálogo

> Formato Nano: What / Where / Depends / Done-when / Verify.
> Rastreabilidade: cada task aponta os IDs de `spec.md` que cobre.

## T1 — Migration das colunas do par
- **What:** `pair_key text` + `pair_role text` em `workout_routine_exercises` e
  `workout_template_exercises`; checks e uniques; sem backfill.
- **Where:** `supabase/migrations/20260915000000_exercicios_conjuntos.sql`
- **Depends:** —
- **Cobre:** [CONJ]-01, [CONJ]-02, [CONJ]-03
- **Done-when:** migration idempotente no padrão `do $$ ... if not exists`; roda
  duas vezes sem erro; nenhuma linha existente alterada.
- **Verify:** `npx supabase db reset` local aplica limpo do zero (ou, sem stack
  local, revisão do SQL + `db:push` na fase de deploy).

## T2 — Tipos + `conjuntos.ts` (TDD)
- **What:** `PairRole`, campos novos em `RoutineExercise`/`TemplateExercise`,
  `agruparConjuntos()`, `novaPairKey()`, `TEXTO_SERIE_CONJUNTA`.
- **Where:** `src/types/database.ts`, `src/lib/conjuntos.ts`,
  `src/lib/conjuntos.test.ts`
- **Depends:** —
- **Cobre:** [CONJ]-04, [CONJ]-11 (texto)
- **Done-when:** testes RED antes da implementação, depois verdes. Cobre: par
  normal, exercício solto, par órfão, par não-adjacente, ordem preservada,
  terceira linha com a mesma chave, `novaPairKey` sem repetição.
- **Verify:** `npm test -- conjuntos` verde; `npm run typecheck` verde.

## T3 — Editor: Adicionar/Remover conjunto
- **What:** card agrupado no `RoutineEditor`, ações de adicionar e remover
  conjunto, promoção ao remover o principal, gravação com `pair_key`/`pair_role`.
- **Where:** `src/components/routine/RoutineEditor.tsx`
- **Depends:** T2
- **Cobre:** [CONJ]-05, [CONJ]-06, [CONJ]-07, [CONJ]-08, [CONJ]-09
- **Done-when:** as 6 telas que consomem o editor continuam compilando; bloco de
  métricas por exercício (força e cárdio); picker bloqueia os dois do par.
- **Verify:** `npm run typecheck`; validação manual no app (criar rotina com par,
  editar, remover principal, salvar e reabrir).

## T4 — Leitura: card agrupado
- **What:** `ExerciseReadRow` passa a receber `principal` + `conjunto`; título
  `A + B`; métricas por exercício; numeração por card; texto da série conjunta.
- **Where:** `src/components/routine/ExerciseReadRow.tsx`, `app/rotina/[id].tsx`,
  `app/(coach)/templates/[id].tsx`
- **Depends:** T2
- **Cobre:** [CONJ]-10, [CONJ]-11, [CONJ]-12
- **Done-when:** exercício solto renderiza igual ao de hoje; os dois call sites
  mapeiam `agruparConjuntos`.
- **Verify:** `npm run typecheck`; conferir na tela de detalhe da rotina.

## T5 — Olhinho dividido
- **What:** `ExerciseImagesModal` aceita segundo exercício e descrição; layout em
  dois blocos com a faixa de série conjunta no meio.
- **Where:** `src/components/routine/ExerciseImagesModal.tsx` + os call sites que
  abrem o preview (`RoutineEditor`, `app/rotina/[id].tsx`, `app/(coach)/templates/[id].tsx`)
- **Depends:** T2, T4
- **Cobre:** [CONJ]-13
- **Done-when:** cada carrossel mantém seu próprio índice de página; sem conjunto,
  a tela é a atual + linha de descrição.
- **Verify:** `npm run typecheck`; abrir o olhinho de um par e de um solto.

## T6 — Edge functions carregando o par
- **What:** `coach-apply-template` copia o par regerando a chave por rotina;
  `coach-save-student-plan` repassa; `coach-save-imported-workout` grava null.
- **Where:** `supabase/functions/coach-apply-template/index.ts`,
  `supabase/functions/coach-save-student-plan/index.ts`,
  `supabase/functions/coach-save-imported-workout/index.ts`
- **Depends:** T1
- **Cobre:** [CONJ]-14, [CONJ]-15, [CONJ]-16
- **Done-when:** aplicar template com par num aluno preserva o par; dois alunos
  do mesmo template têm chaves diferentes.
- **Verify:** revisão do diff + `fn:deploy` na fase de deploy; teste manual de
  aplicar template.

## T7 — Coluna de descrição + exibição
- **What:** `exercises.description` (na migration de T1), hook
  `useExerciseDescriptionMap`, descrição no olhinho com fallback.
- **Where:** `supabase/migrations/20260915000000_exercicios_conjuntos.sql`,
  `src/hooks/useExercises.ts`, `src/components/routine/ExerciseImagesModal.tsx`
- **Depends:** T1, T5
- **Cobre:** [DESC]-01, [DESC]-04
- **Done-when:** exercício sem descrição não deixa buraco na tela.
- **Verify:** `npm run typecheck`; olhinho de exercício com e sem descrição.

## T8 — Geração das 534 descrições
- **What:** script de geração idempotente + JSON versionado + migration de seed.
- **Where:** `scripts/gerar-descricoes-exercicios.mjs`,
  `scripts/data/descricoes-exercicios.json`,
  `supabase/migrations/20260915010000_descricoes_exercicios.sql`, `package.json`
- **Depends:** T7
- **Cobre:** [DESC]-02, [DESC]-03
- **Done-when:** rodar duas vezes não regera nada; JSON revisado pelo dev antes
  de virar seed.
- **Verify:** rodar o script, conferir amostra do JSON com o dev, gerar o seed.

## Gates finais (não são tasks)
`/simplify` sobre o diff acumulado → `npm test` completo → `npm run typecheck` →
docs (`.specs/project/STATE.md` + PROJECT.md se a contagem do catálogo mudar) →
commit via `nano-commit`.
