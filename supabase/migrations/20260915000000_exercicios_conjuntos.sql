-- =====================================================================
-- NutriOn — Exercícios em conjunto / bi-set (spec CONJ-01..CONJ-03, DESC-01)
--
-- Aluno com 30-40 min não termina o treino executando um exercício depois do
-- outro. A saída é a série conjunta: uma série de Elevação lateral emendada
-- direto numa de Elevação frontal, descansando só no fim do par. Hoje o app
-- não tem como expressar isso — o professor cadastra dois exercícios soltos e
-- o aluno não sabe que deviam ser alternados.
--
-- POR QUE DUAS LINHAS IRMÃS E NÃO UMA TABELA AUXILIAR: `replaceRoutineExercises`
-- (src/services/routines.ts) APAGA todas as linhas da rotina e reinsere a cada
-- save. Os `id` de workout_routine_exercises não sobrevivem a uma edição, então
-- qualquer tabela que aponte pra eles morreria no primeiro "Editar treino".
-- Com o par marcado na própria linha, tudo que já existe continua funcionando
-- sem ser tocado: contagem de exercícios da rotina, mapa de imagens por
-- exercise_id, métricas de cárdio, bloqueio de repetido no picker.
--
-- POR QUE `text` E NÃO `uuid`: a chave é gerada no cliente (os dois lados do par
-- entram no mesmo insert em lote, então o banco não pode gerar). E src/services/
-- exercises.ts:69 registra que não há lib de uuid no projeto e que expo-crypto é
-- módulo nativo — usar obrigaria a gerar APK novo. O RoutineEditor já produz
-- chave local no formato `${Date.now()}-${random36}`; reusar mantém tudo OTA.
--
-- SEM BACKFILL: pair_key null = exercício solto, que é 100% das linhas de hoje.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas do par — rotinas e templates ficam espelhados
-- ---------------------------------------------------------------------
alter table public.workout_routine_exercises
  add column if not exists pair_key text,
  add column if not exists pair_role text;

alter table public.workout_template_exercises
  add column if not exists pair_key text,
  add column if not exists pair_role text;

-- ---------------------------------------------------------------------
-- 2. Descrição breve do exercício (DESC-01)
--    Preenchida pelo seed 20260915010000. Sem ela, o olhinho cai no texto
--    genérico que já existe.
-- ---------------------------------------------------------------------
alter table public.exercises
  add column if not exists description text;

-- ---------------------------------------------------------------------
-- 3. Constraints (idempotentes, no padrão usado em cardio_metrics)
-- ---------------------------------------------------------------------
do $$
begin
  -- Papel válido.
  if not exists (
    select 1 from pg_constraint where conname = 'routine_exercises_pair_role_check'
  ) then
    alter table public.workout_routine_exercises
      add constraint routine_exercises_pair_role_check
      check (pair_role is null or pair_role in ('principal','conjunto'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'template_exercises_pair_role_check'
  ) then
    alter table public.workout_template_exercises
      add constraint template_exercises_pair_role_check
      check (pair_role is null or pair_role in ('principal','conjunto'));
  end if;

  -- Nunca meio preenchido: ou é par (chave + papel), ou é solto (os dois nulos).
  if not exists (
    select 1 from pg_constraint where conname = 'routine_exercises_pair_complete_check'
  ) then
    alter table public.workout_routine_exercises
      add constraint routine_exercises_pair_complete_check
      check ((pair_key is null) = (pair_role is null));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'template_exercises_pair_complete_check'
  ) then
    alter table public.workout_template_exercises
      add constraint template_exercises_pair_complete_check
      check ((pair_key is null) = (pair_role is null));
  end if;

  -- Descrição curta: é um parágrafo de apoio no olhinho, não um artigo.
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_description_len_check'
  ) then
    alter table public.exercises
      add constraint exercises_description_len_check
      check (description is null or char_length(description) <= 400);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Máximo 1 principal + 1 conjunto por par (CONJ-02)
--
-- Cada pair_key só pode ter UM 'principal' e UM 'conjunto' dentro da mesma
-- rotina — um terceiro exercício colide com um dos dois papéis e o banco
-- recusa. Não é regra só do app.
--
-- Exercício solto tem pair_key null e o Postgres não compara nulos em unique,
-- então quantos soltos a rotina quiser continuam válidos.
-- ---------------------------------------------------------------------
create unique index if not exists routine_exercises_pair_unique
  on public.workout_routine_exercises (routine_id, pair_key, pair_role);

create unique index if not exists template_exercises_pair_unique
  on public.workout_template_exercises (template_id, pair_key, pair_role);

-- ---------------------------------------------------------------------
-- 5. Documentação das colunas
-- ---------------------------------------------------------------------
comment on column public.workout_routine_exercises.pair_key is
  'Chave que liga as duas linhas de uma série conjunta (bi-set). Null = exercício solto. Texto e não uuid: gerada no cliente, que não tem lib de uuid (ver src/services/exercises.ts:69).';
comment on column public.workout_routine_exercises.pair_role is
  'principal ou conjunto. O principal é o primeiro exercício do par; o conjunto é emendado logo depois, sem descanso entre eles.';

comment on column public.workout_template_exercises.pair_key is
  'Espelha workout_routine_exercises.pair_key. A chave é REGERADA quando o template vira rotina de aluno (coach-apply-template), pra duas rotinas não carregarem a mesma string.';
comment on column public.workout_template_exercises.pair_role is
  'Espelha workout_routine_exercises.pair_role.';

comment on column public.exercises.description is
  'Descrição breve (2-3 linhas, PT-BR): como executar e o erro comum. Exibida no olhinho. Null = cai no texto genérico do modal.';
