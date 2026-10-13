# Design — Exercícios em conjunto (bi-set) + descrição do catálogo

> Requisitos em `spec.md`, decisões e o porquê em `context.md`.

## Princípio

O par é **duas linhas irmãs**, não uma linha gorda nem uma tabela à parte. Assim
todo mecanismo que já existe — contagem de exercícios da rotina, mapa de imagens
por `exercise_id`, métricas de cárdio, bloqueio de exercício repetido no picker,
snapshot de nome — continua valendo sem ser tocado. O que muda é só a **leitura**:
uma função pura junta as irmãs num card.

## 1. Banco — `20260915000000_exercicios_conjuntos.sql`

```sql
alter table public.workout_routine_exercises
  add column if not exists pair_key text,
  add column if not exists pair_role text;

alter table public.workout_template_exercises
  add column if not exists pair_key text,
  add column if not exists pair_role text;

alter table public.exercises
  add column if not exists description text;

-- checks idempotentes (padrão do do $$ ... if not exists usado em cardio_metrics)
--   pair_role in ('principal','conjunto')
--   (pair_key is null) = (pair_role is null)
--   char_length(description) <= 400
-- uniques:
--   unique (routine_id, pair_key, pair_role)
--   unique (template_id, pair_key, pair_role)
```

**Por que o unique trava em 2:** cada `pair_key` só pode ter uma linha
`principal` e uma `conjunto` dentro da mesma rotina. Um terceiro exercício no par
colide com um dos dois papéis. Exercícios soltos têm `pair_key` null e o unique
os ignora (Postgres não compara nulos), então as linhas de hoje não são afetadas
— **sem backfill**.

`pair_key` é `text`, não `uuid`: ver decisão 4 em `context.md` (não há lib de
uuid no app e `expo-crypto` obrigaria APK novo).

## 2. `src/lib/conjuntos.ts` — o coração, e é lógica pura

```ts
export type PairRole = 'principal' | 'conjunto';

type Agrupavel = {
  pair_key: string | null;
  pair_role: PairRole | null;
};

export type CardConjunto<T> = { principal: T; conjunto: T | null };

/** Junta as linhas irmãs num card. Preserva a ordem de entrada. */
export function agruparConjuntos<T extends Agrupavel>(itens: T[]): CardConjunto<T>[];

/** Chave local do par. Mesmo formato do uid() do RoutineEditor — sem nativo. */
export function novaPairKey(): string;

/** Texto fixo da orientação de execução (card e olhinho). */
export const TEXTO_SERIE_CONJUNTA: string;
```

**Algoritmo** (uma passada, preservando ordem):

1. Percorre a lista na ordem recebida.
2. `pair_key` null → emite card `{ principal: item, conjunto: null }`.
3. `pair_key` preenchido → na primeira aparição da chave, cria o card e guarda a
   referência; na segunda, encaixa no card já criado (principal ou conjunto pelo
   `pair_role`).
4. O card ocupa a posição da **primeira** linha daquela chave.
5. Se a chave nunca recebe a irmã (par órfão) → o card fica com `conjunto: null`
   e a linha aparece normalmente. Nada some.
6. Se vier uma terceira linha com a chave (impossível pelo unique, mas dado velho
   ou payload adulterado) → vira card próprio em vez de ser descartada.

**Por que preservar a ordem de entrada e não ordenar por `sort_order`:** o service
já entrega ordenado, e no editor o `sort_order` só existe no submit — a verdade é
a posição no array. Uma função só serve os dois.

## 3. Tipos — `src/types/database.ts`

`RoutineExercise` e `TemplateExercise` ganham `pair_key: string | null` e
`pair_role: PairRole | null`. Como `RoutineExerciseInsert` é
`Omit<RoutineExercise, 'id'|'routine_id'>`, o insert herda os campos de graça —
e o `Draft` do editor (`RoutineExerciseInsert & { localId }`) também, então
`agruparConjuntos` roda sobre rascunho e sobre linha do banco sem adaptador.

## 4. Editor — `src/components/routine/RoutineEditor.tsx`

O array `drafts` continua **plano** (nada de aninhar), com o conjunto guardado
logo depois do seu principal. A renderização passa a mapear
`agruparConjuntos(drafts)` em vez de `drafts`.

| Ação | Comportamento |
|---|---|
| "Adicionar conjunto" (no card) | Abre o `ExercisePickerModal` marcando qual card pediu. O escolhido é inserido **logo após o principal**, com o mesmo `pair_key` (gerado com `novaPairKey()` se o principal ainda não tinha) e `pair_role: 'conjunto'`. |
| "Remover conjunto" | Tira só a linha do conjunto e zera `pair_key`/`pair_role` do principal. |
| Remover o principal | Promove: a linha do conjunto vira `pair_role: 'principal'`… e como fica sozinha, `pair_key`/`pair_role` voltam a null. |
| Picker | `addedExerciseIds` já monta a partir de `drafts`, que inclui os conjuntos — funciona sem mudança. |
| Submit | O `map((d, i) => ...)` existente já atribui `sort_order: i` na ordem do array, o que deixa o conjunto adjacente ao principal. Só passa `pair_key`/`pair_role` adiante. |

O card renderiza `BlocoMetricas` uma vez para exercício solto e duas vezes para
par — cada bloco com nome, equipamento e os inputs próprios (força ou cárdio,
pela regra de `metric_type` que já existe).

## 5. Leitura — `src/components/routine/ExerciseReadRow.tsx`

A prop passa de um exercício para um card:

```ts
type ExercicioExibivel = {
  exercise: ReadableExercise;
  imageUrls: string[] | null;
  videoUrl: string | null;
};

type Props = {
  principal: ExercicioExibivel;
  conjunto: ExercicioExibivel | null;
  index: number;              // índice do CARD, não da linha
  onPreview?: () => void;
};
```

Título vira `Elevação lateral + Elevação frontal` quando há conjunto. As pílulas
de métrica viram um subcomponente renderizado por exercício. Com `conjunto`
null, o card é pixel a pixel o de hoje.

Os dois call sites (`app/rotina/[id].tsx`, `app/(coach)/templates/[id].tsx`)
passam a mapear `agruparConjuntos(...)`.

## 6. Olhinho — `src/components/routine/ExerciseImagesModal.tsx`

Props passam a aceitar o segundo exercício e a descrição:

```
principal: { nome, equipamento, imagens[], video, descricao }
conjunto:  idem | null
```

Layout (o modal já é um `ScrollView` vertical): bloco do primeiro (nome,
equipamento, carrossel, descrição) → faixa com `TEXTO_SERIE_CONJUNTA` → bloco do
segundo → rodapé de créditos/vídeo que já existe. Sem conjunto, é a tela atual
mais a linha de descrição.

**Cuidado conhecido:** o carrossel usa `useWindowDimensions().width` por slide.
Com dois carrasséis empilhados, cada um mantém seu próprio índice de página —
dois estados separados, não um compartilhado.

## 7. Edge functions

| Função | Mudança |
|---|---|
| `coach-apply-template` | Copia `pair_key`/`pair_role`, **regerando a chave por rotina** (mapa `chave antiga → crypto.randomUUID()`, disponível no Deno). Evita duas rotinas de alunos diferentes carregando a mesma string. |
| `coach-save-student-plan` | **Sem alteração.** Monta a linha a partir de payload de IA, que não gera par; coluna nullable sem default já grava null. |
| `coach-save-imported-workout` | **Sem alteração**, mesma razão. |

## 8. Descrição dos 534

**Script** `scripts/gerar-descricoes-exercicios.mjs`, no padrão dos
`scripts/audit-*.mjs` (`node --env-file=.env.local`, service role):

1. Lê os exercícios e o JSON de saída anterior, se existir.
2. Pula todo exercício que já tem `description` no banco ou entrada no JSON —
   rodar de novo não gasta cota nem sobrescreve texto revisado.
3. Chama a IA em lotes (Groq, que é o provedor do projeto por PROJECT.md),
   pedindo 2-3 linhas em PT-BR: como executar + erro comum.
4. Escreve `scripts/data/descricoes-exercicios.json` — versionado, pra revisão
   ser diffável.

**Seed** `20260915010000_descricoes_exercicios.sql`: gerado a partir do JSON
revisado, casando por `(group_id, name)` — a unique que o catálogo já tem.
Idempotente (`update ... where description is null`).

**Exibição:** `useExercises` ganha `useExerciseDescriptionMap()`, irmão de
`useExerciseImagesMap`/`useExerciseVideoMap`. Sem descrição, o olhinho mantém o
texto genérico atual.

## 9. Testes

`src/lib/conjuntos.test.ts` (vitest, padrão dos 20+ `src/lib/*.test.ts`), com o
ID do requisito no nome de cada teste: par normal vira um card, solto vira card,
par órfão não some, par não-adjacente agrupa, ordem preservada, terceira linha
com a mesma chave não é descartada, `novaPairKey` não repete em chamadas
seguidas.

O resto (componentes, migration, edge functions) é verificado por typecheck,
suite completa e validação manual no app — o projeto não tem testes de
componente.

## 10. Ordem de entrega (commits)

1. `feat(treino)`: migration das colunas do par
2. `feat(treino)`: `conjuntos.ts` + testes + tipos
3. `feat(treino)`: editor com Adicionar/Remover conjunto
4. `feat(treino)`: leitura (card agrupado) + olhinho dividido
5. `feat(treino)`: `coach-apply-template` carregando o par
6. `feat(exercicios)`: script + seed das descrições + exibição no olhinho

Depois: `/simplify` sobre o diff acumulado → suite completa → `db:push` →
`fn:deploy` de `coach-apply-template` → OTA (canal a confirmar com o dev).
