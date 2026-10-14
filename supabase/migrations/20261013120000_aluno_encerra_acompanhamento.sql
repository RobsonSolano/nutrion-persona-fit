-- =====================================================================
-- Aluno encerra o acompanhamento sozinho ([TRAN]-10, [TRAN]-11) — 2026-10-13
--
-- coach_unlink_notices passa a registrar os dois lados do desvínculo:
--   initiated_by = 'coach'   → aviso pro ex-aluno (seen_by_student_at)
--   initiated_by = 'student' → aviso pro professor, com o motivo
--                              (seen_by_coach_at)
-- Quem iniciou já sabe: a edge function grava o próprio lado como visto.
-- A escrita continua só pelas edge functions (service role).
-- =====================================================================

alter table public.coach_unlink_notices
  add column if not exists initiated_by text not null default 'coach',
  add column if not exists reason text,
  add column if not exists student_name text,
  add column if not exists seen_by_coach_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_unlink_notices_initiated_by_check') then
    alter table public.coach_unlink_notices
      add constraint coach_unlink_notices_initiated_by_check
      check (initiated_by in ('coach', 'student'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_unlink_notices_reason_len_check') then
    alter table public.coach_unlink_notices
      add constraint coach_unlink_notices_reason_len_check
      check (reason is null or char_length(reason) <= 500);
  end if;
end $$;

-- Os desvínculos feitos pelo professor antes desta migration: ele mesmo fez.
update public.coach_unlink_notices
   set seen_by_coach_at = created_at
 where initiated_by = 'coach' and seen_by_coach_at is null;

comment on table public.coach_unlink_notices is
  'Desvínculos professor↔aluno e quem iniciou. Vira aviso na abertura do app pro outro lado até ele ver.';
comment on column public.coach_unlink_notices.student_name is
  'Snapshot do nome do aluno: depois do desvínculo o professor perde acesso ao perfil dele pela RLS.';
comment on column public.coach_unlink_notices.reason is
  'Motivo escrito pelo aluno ao encerrar ([TRAN]-10). O professor lê.';

create index if not exists coach_unlink_notices_coach_unseen_idx
  on public.coach_unlink_notices (coach_id)
  where seen_by_coach_at is null;

drop policy if exists "unlink_notices_select_own" on public.coach_unlink_notices;
create policy "unlink_notices_select_own" on public.coach_unlink_notices
  for select using (
    (select auth.uid()) = student_id or (select auth.uid()) = coach_id
  );

-- Marca o lado de quem chama: aluno → seen_by_student_at, professor →
-- seen_by_coach_at.
create or replace function public.mark_unlink_notice_seen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coach_unlink_notices
     set seen_by_student_at = coalesce(seen_by_student_at,
           case when student_id = auth.uid() then now() end),
         seen_by_coach_at = coalesce(seen_by_coach_at,
           case when coach_id = auth.uid() then now() end)
   where id = p_id and auth.uid() in (student_id, coach_id);
$$;

grant execute on function public.mark_unlink_notice_seen(uuid) to authenticated;

-- Push pro professor quando o aluno sai.
alter type public.push_type add value if not exists 'student_left_coach';

alter table public.ai_usage_log
  drop constraint if exists ai_usage_log_feature_check;
alter table public.ai_usage_log
  add constraint ai_usage_log_feature_check
  check (feature in (
    'chat',
    'sanity_check',
    'onboarding_plan',
    'coach_plan',
    'push_inactivity',
    'push_streak',
    'push_workout',
    'push_weekly_summary',
    'push_coach_alert',
    'push_plan_update',
    'push_goal_achieved',
    'push_protein',
    'push_workout_check',
    'push_streak_warning',
    'push_account_deleted',
    'push_coach_unlinked',
    'push_enrollment_accepted',
    'push_enrollment_declined',
    'push_student_left_coach'
  ));
