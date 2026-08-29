-- =====================================================================
-- Persona Fit — Tipos de push da contratação
--
-- enrollment_accepted / enrollment_declined: o desfecho da solicitação.
-- São CRÍTICOS (ignoram quiet hours) porque mudam o estado da conta do
-- usuário — ele passa a ser aluno, ou continua comum esperando resposta.
--
-- O push é REDUNDANTE de propósito: o aviso in-app na abertura do app
-- ([SOLI]-09) não depende de permissão de notificação, que o usuário
-- pode ter negado. O push só antecipa.
-- =====================================================================

alter type public.push_type add value if not exists 'enrollment_accepted';
alter type public.push_type add value if not exists 'enrollment_declined';

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
    'push_enrollment_declined'
  ));
