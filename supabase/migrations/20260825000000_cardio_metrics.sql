-- =====================================================================
-- NutriOn — Métricas próprias para exercícios de cárdio (spec CAR-01..CAR-08)
--
-- Exercício de cárdio usava séries/repetições/carga, que não se aplicam:
-- "3x12 com 20 kg" não significa nada numa esteira. Passa a ter distância,
-- cadência (RPM) e tempo.
--
-- POR QUE `metric_type` E NÃO A MODALIDADE: os 10 exercícios do grupo cardio
-- (esteira, bike, elíptico, remo, natação, HIIT...) estão todos com
-- `modality = 'musculacao'` — a coluna de modalidade nasceu depois deles
-- (20260428120000) e pegaram o default. Além disso a modalidade pertence à
-- ROTINA inteira, e uma rotina de musculação com 10 min de esteira no fim é
-- caso comum. O vetor certo é o GRUPO do exercício.
--
-- POR QUE SNAPSHOT: `exercise_id` é nullable (`on delete set null`) e o
-- catálogo muda. O schema já resolveu isso uma vez guardando `exercise_name`
-- como snapshot — `metric_type` segue o mesmo princípio.
--
-- TEMPO: reusamos o `duration_min` que já existe (comentado como "usado em
-- cardio ou holds" desde 20260422120000). NÃO criamos `duration_max_min`:
-- conviver com `duration_min` (que significa MINUTOS, não mínimo) seria fonte
-- permanente de erro de leitura.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas — rotinas e templates ficam espelhados
-- ---------------------------------------------------------------------
alter table public.workout_routine_exercises
  add column if not exists metric_type text not null default 'strength',
  add column if not exists distance_min_m int,
  add column if not exists distance_max_m int,
  add column if not exists cadence_rpm int;

alter table public.workout_template_exercises
  add column if not exists metric_type text not null default 'strength',
  add column if not exists distance_min_m int,
  add column if not exists distance_max_m int,
  add column if not exists cadence_rpm int;

-- ---------------------------------------------------------------------
-- 2. Constraints (idempotentes, no padrão usado em modality)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'routine_exercises_metric_type_check'
  ) then
    alter table public.workout_routine_exercises
      add constraint routine_exercises_metric_type_check
      check (metric_type in ('strength','cardio'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'template_exercises_metric_type_check'
  ) then
    alter table public.workout_template_exercises
      add constraint template_exercises_metric_type_check
      check (metric_type in ('strength','cardio'));
  end if;

  -- Distância e cadência não podem ser negativas, e o máximo não pode ficar
  -- abaixo do mínimo (o form também valida, isto é a rede de baixo).
  if not exists (
    select 1 from pg_constraint where conname = 'routine_exercises_distance_check'
  ) then
    alter table public.workout_routine_exercises
      add constraint routine_exercises_distance_check
      check (
        (distance_min_m is null or distance_min_m >= 0)
        and (distance_max_m is null or distance_max_m >= 0)
        and (distance_min_m is null or distance_max_m is null or distance_max_m >= distance_min_m)
        and (cadence_rpm is null or cadence_rpm >= 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'template_exercises_distance_check'
  ) then
    alter table public.workout_template_exercises
      add constraint template_exercises_distance_check
      check (
        (distance_min_m is null or distance_min_m >= 0)
        and (distance_max_m is null or distance_max_m >= 0)
        and (distance_min_m is null or distance_max_m is null or distance_max_m >= distance_min_m)
        and (cadence_rpm is null or cadence_rpm >= 0)
      );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Backfill (CAR-07) — quem já está gravado e é do grupo cardio vira 'cardio'.
--    Idempotente: rodar de novo não muda nada.
-- ---------------------------------------------------------------------
update public.workout_routine_exercises re
set metric_type = 'cardio'
from public.exercises e
join public.exercise_groups g on g.id = e.group_id
where re.exercise_id = e.id
  and g.slug = 'cardio'
  and re.metric_type <> 'cardio';

update public.workout_template_exercises te
set metric_type = 'cardio'
from public.exercises e
join public.exercise_groups g on g.id = e.group_id
where te.exercise_id = e.id
  and g.slug = 'cardio'
  and te.metric_type <> 'cardio';

-- ---------------------------------------------------------------------
-- 4. Documentação das colunas
-- ---------------------------------------------------------------------
comment on column public.workout_routine_exercises.metric_type is
  'strength (séries/reps/carga) ou cardio (distância/RPM/tempo). Snapshot do grupo do exercício no momento em que foi adicionado — não depende de exercise_id continuar existindo.';
comment on column public.workout_routine_exercises.distance_min_m is
  'Distância mínima em METROS (inteiro cobre natação 100m e corrida 10000m sem decimal). Só em cardio.';
comment on column public.workout_routine_exercises.distance_max_m is
  'Distância máxima em metros. Só em cardio.';
comment on column public.workout_routine_exercises.cadence_rpm is
  'Cadência em RPM (bike ergométrica, elíptico, remo). Só em cardio; esteira e corrida não usam.';

comment on column public.workout_template_exercises.metric_type is
  'Espelha workout_routine_exercises.metric_type.';
comment on column public.workout_template_exercises.distance_min_m is
  'Espelha workout_routine_exercises.distance_min_m.';
comment on column public.workout_template_exercises.distance_max_m is
  'Espelha workout_routine_exercises.distance_max_m.';
comment on column public.workout_template_exercises.cadence_rpm is
  'Espelha workout_routine_exercises.cadence_rpm.';
