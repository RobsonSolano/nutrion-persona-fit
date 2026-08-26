# Spec — Métricas próprias para exercícios de cárdio

**Data:** 2026-08-25 · **Escopo:** Medium · **Origem:** BACKLOG.md item #4 da leva de 2026-08-25

## Problema

Exercício de cárdio hoje usa os mesmos campos da musculação — **séries, repetições e carga** — que
não se aplicam. Prescrever "3 séries de 12 repetições com 20 kg" para uma esteira não significa
nada. O que falta é **distância**, **cadência (RPM)** e **tempo**.

## Descobertas que definem o design

1. **Já existe grupo "Cardio" no catálogo** (`exercise_groups.slug = 'cardio'`, 🏃) com 10
   exercícios: Esteira (corrida), Esteira (caminhada), Bicicleta ergométrica, Bicicleta (ao ar
   livre), Elíptico, Escada/Stair, Remo ergômetro, Pular corda, Natação e HIIT.
2. **A modalidade NÃO serve para decidir o formato.** Os 10 exercícios acima estão com
   `modality = 'musculacao'` (o default — a coluna nasceu depois deles, em
   `20260428120000_modality_in_exercises_and_routines.sql`). Além disso, a modalidade pertence à
   **rotina inteira** no `RoutineEditor`, e trocá-la apaga os exercícios já adicionados. Uma rotina
   de musculação com 10 min de esteira no fim é caso comum e legítimo.
3. **`duration_min` já existe** em `workout_routine_exercises` e `workout_template_exercises`, com o
   comentário literal *"usado em cardio ou holds"*, e já é exibido pro aluno
   (`ExerciseReadRow.tsx:77` renderiza `${duration_min} min`).
4. **Armadilha de nomenclatura:** `duration_min` significa "duração em MINUTOS", enquanto
   `weight_min_kg`/`weight_max_kg` usam `min`/`max` como mínimo/máximo. Os dois padrões convivem
   hoje no mesmo tipo.

## Requisitos

| ID | Requisito |
|---|---|
| **CAR-01** | Exercício da rotina ganha `metric_type` (`'strength'` \| `'cardio'`), gravado como **snapshot** no momento em que é adicionado — mesmo princípio de `exercise_name`, que o schema já guarda para "não perder se o catálogo for editado/removido". |
| **CAR-02** | O `metric_type` é derivado do **grupo** do exercício escolhido (`slug = 'cardio'`), não da modalidade da rotina. |
| **CAR-03** | Campos novos de cárdio: `distance_min_m`, `distance_max_m` (metros) e `cadence_rpm`. Todos opcionais — esteira usa distância e tempo, bike usa RPM e tempo, natação usa distância. |
| **CAR-04** | **`duration_min` é reusado como o tempo do exercício.** NÃO será criado `duration_max_min`: conviver com `duration_min` (que significa minutos) seria fonte permanente de erro de leitura. O campo já existe, já é exibido, e o professor usa como teto. |
| **CAR-05** | O form mostra **os campos do tipo certo**: cárdio → distância, RPM e tempo; força → séries, repetições e carga. Sem campos que não se aplicam. |
| **CAR-06** | A exibição pro aluno (`ExerciseReadRow`) mostra as métricas de cárdio quando houver, no lugar de séries/reps/carga. |
| **CAR-07** | **Backfill:** exercícios já gravados cujo `exercise_id` pertence ao grupo cardio recebem `metric_type = 'cardio'`; o resto fica `'strength'` (o default). Nada quebra para quem já tem rotina. |
| **CAR-08** | Vale para **rotinas e templates** — as duas tabelas (`workout_routine_exercises`, `workout_template_exercises`) têm o mesmo conjunto de campos hoje e continuam espelhadas. |

## Critérios de aceite

- **QUANDO** o professor adiciona "Esteira (corrida)" a uma rotina **ENTÃO** o form oferece
  distância, RPM e tempo — e não séries/repetições/carga. *(CAR-02, CAR-05)*
- **QUANDO** adiciona "Supino reto" **ENTÃO** o form segue igual ao de hoje. *(CAR-05)*
- **QUANDO** o exercício de cárdio é salvo com distância 3000–5000 m e 30 min **ENTÃO** o aluno vê
  essas métricas na tela de treino. *(CAR-06)*
- **QUANDO** a rotina é de modalidade `musculacao` mas o exercício é do grupo cardio **ENTÃO** ele
  ainda recebe o formato de cárdio — a modalidade da rotina não interfere. *(CAR-02)*
- **QUANDO** a migration roda sobre uma base com rotinas existentes **ENTÃO** exercícios do grupo
  cardio viram `metric_type='cardio'` e os demais `'strength'`, sem perda de dado. *(CAR-07)*
- **QUANDO** o exercício foi removido do catálogo (`exercise_id` nulo) **ENTÃO** o `metric_type`
  gravado no snapshot continua valendo. *(CAR-01)*

## Decisões de design

1. **Snapshot em vez de join.** Poderíamos descobrir o tipo com um join
   `routine_exercise → exercises → exercise_groups` a cada leitura, mas `exercise_id` é nullable
   (`on delete set null`) e o catálogo muda. O schema já resolveu esse problema uma vez com
   `exercise_name` como snapshot — seguimos o mesmo caminho.
2. **Distância em metros, não km.** Inteiro em metros evita decimal no banco e cobre tanto natação
   (100 m) quanto corrida (10.000 m). A UI converte para exibição.
3. **`metric_type` como texto com check**, no padrão de `modality` (que usa
   `check (modality in (...))`), em vez de enum do Postgres — consistente com o schema atual e mais
   fácil de estender.

## Fora de escopo

- Adicionar modalidades novas (ex. `ciclismo`) à lista existente.
- Pace/ritmo calculado (min/km), zonas de frequência cardíaca, inclinação de esteira.
- Registrar execução de cárdio pelo aluno com essas métricas (`workout_sessions` guarda a duração da
  sessão inteira — semântica diferente, não confundir).
- Gerador de plano por IA (`onboarding-plan`, `coach-generate-plan`) produzir métricas de cárdio.
- **Importação de treino por IA** (`ImportWorkoutPreview` → `coach-save-imported-workout`): o payload
  não carrega `metric_type`, então o insert cai no default `'strength'` do banco. Se o treino
  importado tiver esteira ou corrida, entra com o formato de força. Limitação conhecida e aceita —
  o professor pode corrigir editando a rotina.

## Risco conhecido

`RoutineEditor.tsx` é o arquivo mais pesado que a feature toca e concentra o form inteiro de
montagem de rotina. A mudança de campos por tipo mexe na área mais sensível dele.
