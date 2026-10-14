-- =====================================================================
-- Persona Fit — Painel admin v2 (2026-10-14)
-- Spec: .specs/features/2026-10-14-painel-admin-v2/
--
-- 1. Parceria: nova origem `partner` em subscriptions (+ `note`). Vale até
--    period_end (null = sem fim) e volta a free sozinha quando vence.
-- 2. _resolve_entitlement e grant_server_trial passam a conhecer `partner`, e o
--    entitlement passa a dizer de onde vem o plano (`via`) e se há loja ativa
--    (`store_active`) — chaves novas, os consumidores atuais ignoram.
--    O resto das duas funções é idêntico às versões anteriores
--    (20261013020000_entitlement_aluno_melhor_tier.sql e
--    20260622010000_server_trial.sql).
-- 3. Funções admin_* que o painel chama. Todas checam is_admin(auth.uid())
--    antes de qualquer coisa: estão no mesmo banco do app e qualquer usuário
--    logado consegue chamá-las com a anon key.
--
-- Datas: o "dia" de created_at é o dia em São Paulo, não em UTC.
-- Contas de teste (robôs da Play, @nutrion.test, @example.com, +review)
-- ficam fora por padrão (p_include_test).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. subscriptions: origem partner + observação
-- ---------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('store_play','store_apple','stripe','server_trial','grandfather','partner'));

alter table public.subscriptions add column if not exists note text;
comment on column public.subscriptions.note is
  'Observação do admin (parceria): motivo, combinado, prazo. Só o painel escreve.';

-- ---------------------------------------------------------------------
-- 2. Entitlement e trial conhecem partner
-- ---------------------------------------------------------------------
create or replace function public._resolve_entitlement(p_uid uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_coach_id uuid;
  v_early boolean;
  v_tier text;
  v_source text;
  v_status text;
  v_trial_end timestamptz;
  v_period_end timestamptz;
  v_trial_active boolean;
  v_store_active boolean;
  v_partner_active boolean;
  v_has_tier_access boolean;
  v_grandfather boolean;
  v_tier_out text;
  v_ai_personal boolean;
  v_ai_coach boolean;
  v_student_limit int;
  v_coach_ent json;
  v_coach_tier text;
  v_own_tier text;
  v_via text;
begin
  if p_uid is null then
    return json_build_object('tier','free','source','none','ai_personal',false,
                             'ai_coach',false,'student_limit',null,'trial_end',null,
                             'via','none','store_active',false);
  end if;

  select role, coach_id, is_early_adopter
    into v_role, v_coach_id, v_early
    from public.profiles where id = p_uid;

  if not found then
    return json_build_object('tier','free','source','none','ai_personal',false,
                             'ai_coach',false,'student_limit',null,'trial_end',null,
                             'via','none','store_active',false);
  end if;

  select tier, source, status, trial_end, period_end
    into v_tier, v_source, v_status, v_trial_end, v_period_end
    from public.subscriptions where user_id = p_uid;

  v_trial_active := coalesce(v_source = 'server_trial' and v_trial_end > now(), false);
  v_store_active := coalesce(
    v_source in ('store_play','store_apple','stripe') and (
      v_status in ('active','in_trial')
      or (v_status = 'canceled' and coalesce(v_period_end > now(), false))
    ), false);
  -- Parceria (painel admin): vale até period_end; null = sem data de fim.
  v_partner_active := coalesce(v_source = 'partner'
                               and (v_period_end is null or v_period_end > now()), false);
  v_has_tier_access := (v_trial_active or v_store_active or v_partner_active)
                       and coalesce(v_tier in ('pro','premium'), false);
  v_grandfather := coalesce(v_source = 'grandfather', false) or coalesce(v_early, false);
  v_tier_out := case when v_has_tier_access then v_tier else 'free' end;
  -- De onde vem o plano (painel admin). Uma fonte só: as mesmas flags acima.
  v_via := case when not v_has_tier_access then null
                when v_store_active then 'store'
                when v_partner_active then 'partner'
                else 'trial' end;

  if v_role = 'aluno' then
    if v_coach_id is null then
      v_ai_personal := false;
    else
      -- Uma chamada só: o mesmo resultado alimenta a IA herdada e o tier.
      v_coach_ent := public._resolve_entitlement(v_coach_id);
      v_ai_personal := coalesce((v_coach_ent ->> 'ai_personal')::boolean, false);
      v_coach_tier := v_coach_ent ->> 'tier';
      v_own_tier := v_tier_out;
      -- Melhor dos dois: o aluno nunca perde o que já pagou, e nunca fica
      -- abaixo do que o professor oferece.
      if v_coach_tier = 'premium' or v_tier_out = 'premium' then
        v_tier_out := 'premium';
      elsif v_coach_tier = 'pro' or v_tier_out = 'pro' then
        v_tier_out := 'pro';
      end if;
      -- Herdado só quando o plano do professor é maior que o próprio.
      if v_tier_out <> v_own_tier then
        v_via := 'inherited';
      end if;
    end if;
    return json_build_object(
      'tier', v_tier_out, 'source', coalesce(v_source,'none'),
      'ai_personal', v_ai_personal, 'ai_coach', false,
      'student_limit', null, 'trial_end', v_trial_end,
      'via', coalesce(v_via, 'none'), 'store_active', v_store_active);
  end if;

  v_ai_personal := v_has_tier_access or v_grandfather;

  if v_role = 'professor' then
    v_ai_coach := v_has_tier_access;  -- D3: grandfather/early NÃO concede coach
    v_student_limit := case v_tier_out
                         when 'premium' then null
                         when 'pro' then 5
                         else 2 end;          -- free/grandfather = 2
  else
    v_ai_coach := false;
    v_student_limit := null;
  end if;

  return json_build_object(
    'tier', v_tier_out, 'source', coalesce(v_source,'none'),
    'ai_personal', v_ai_personal, 'ai_coach', v_ai_coach,
    'student_limit', v_student_limit, 'trial_end', v_trial_end,
    'via', coalesce(v_via, case when v_grandfather then 'grandfather' end, 'none'),
    'store_active', v_store_active);
end;
$$;

create or replace function public.grant_server_trial(p_uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_source text;
  v_consumed boolean;
begin
  if p_uid is null then
    return 'skipped_null';
  end if;

  select role into v_role from public.profiles where id = p_uid;
  if not found then
    return 'skipped_no_profile';
  end if;
  -- Trial pessoal é de comum. Professor = oferta da loja (#5); aluno herda do coach.
  if v_role <> 'comum' then
    return 'skipped_role';
  end if;

  select source, trial_consumed
    into v_source, v_consumed
    from public.subscriptions where user_id = p_uid;

  -- Anti-abuso: 1 trial de servidor por vida.
  if coalesce(v_consumed, false) then
    return 'skipped_consumed';
  end if;
  -- Grandfather-safe: nunca sobrescreve IA-pra-sempre, assinatura de loja nem parceria.
  if v_source in ('grandfather', 'store_play', 'store_apple', 'stripe', 'partner') then
    return 'skipped_source';
  end if;

  insert into public.subscriptions
    (user_id, tier, source, status, trial_end, trial_consumed)
  values
    (p_uid, 'pro', 'server_trial', 'in_trial', now() + interval '7 days', true)
  on conflict (user_id) do update set
    tier = 'pro',
    source = 'server_trial',
    status = 'in_trial',
    trial_end = now() + interval '7 days',
    trial_consumed = true,
    updated_at = now();

  return 'granted';
end;
$$;
-- ---------------------------------------------------------------------
-- 3. Helpers internos (não expostos ao client)
-- ---------------------------------------------------------------------
create or replace function public._admin_assert()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Período longo demais derruba o banco (uma data digitada pela metade vira
-- o ano 0002). 400 dias cobre "último ano" com folga.
create or replace function public._admin_check_period(p_from date, p_to date)
returns void
language plpgsql
immutable
as $$
begin
  if p_from is not null and p_to is not null and p_to - p_from > 400 then
    raise exception 'period_too_long' using errcode = '22023';
  end if;
end;
$$;

create or replace function public._sp_date(p_ts timestamptz)
returns date
language sql
immutable
as $$ select (p_ts at time zone 'America/Sao_Paulo')::date; $$;

-- Início do dia em São Paulo, como instante (pra comparar com created_at).
create or replace function public._sp_start(p_day date)
returns timestamptz
language sql
immutable
as $$ select p_day::timestamp at time zone 'America/Sao_Paulo'; $$;

create or replace function public._is_test_email(p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_email ilike '%@nutrion.test'
    or p_email ilike '%@example.com'
    or p_email ilike '%@cloudtestlabaccounts.com'
    or p_email ilike '%+review@%', false);
$$;

-- Quem é quem, sem plano: pra telas que só precisam de nome/e-mail/papel.
create or replace function public._admin_people(p_include_test boolean, p_uid uuid default null)
returns table (
  id uuid, email text, full_name text, avatar_url text, role text, coach_id uuid,
  created_at timestamptz, suspended_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, u.email::text, p.full_name, p.avatar_url, p.role, p.coach_id,
         p.created_at, p.suspended_at, u.last_sign_in_at
    from public.profiles p
    join auth.users u on u.id = p.id
   where (p_uid is null or p.id = p_uid)
     and (p_include_test or not public._is_test_email(u.email));
$$;

-- Pessoas + plano de hoje, pelo próprio _resolve_entitlement (uma chamada por
-- pessoa): tier efetivo, de onde vem (via) e se paga pela loja.
create or replace function public._admin_users_base(p_include_test boolean, p_uid uuid default null)
returns table (
  id uuid, email text, full_name text, avatar_url text, role text, coach_id uuid,
  created_at timestamptz, suspended_at timestamptz, last_sign_in_at timestamptz,
  tier text, plan_kind text, paying boolean, own_tier text,
  source text, status text, trial_end timestamptz, period_end timestamptz,
  note text, trial_consumed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.*,
         x.e ->> 'tier',
         case x.e ->> 'via' when 'none' then 'free' else x.e ->> 'via' end,
         coalesce((x.e ->> 'store_active')::boolean, false),
         s.tier, s.source, s.status, s.trial_end, s.period_end, s.note,
         coalesce(s.trial_consumed, false)
    from public._admin_people(p_include_test, p_uid) p
    cross join lateral (select public._resolve_entitlement(p.id) as e) x
    left join public.subscriptions s on s.user_id = p.id;
$$;

-- Atividade = registrou refeição, treino, água ou falou com o chat.
-- p_user_ids restringe a quem interessa (página da lista, ficha).
create or replace function public._admin_activity(p_from date, p_to date, p_user_ids uuid[] default null)
returns table (user_id uuid, d date)
language sql
stable
security definer
set search_path = public
as $$
  select f.user_id, public._sp_date(f.created_at) from public.food_logs f
   where f.created_at >= public._sp_start(p_from) and f.created_at < public._sp_start(p_to + 1)
     and (p_user_ids is null or f.user_id = any(p_user_ids))
  union all
  select w.user_id, public._sp_date(w.created_at) from public.workout_logs w
   where w.created_at >= public._sp_start(p_from) and w.created_at < public._sp_start(p_to + 1)
     and (p_user_ids is null or w.user_id = any(p_user_ids))
  union all
  select ws.user_id, ws.day from public.workout_sessions ws
   where ws.day between p_from and p_to and (p_user_ids is null or ws.user_id = any(p_user_ids))
  union all
  select wl.user_id, wl.day from public.water_logs wl
   where wl.day between p_from and p_to and wl.volume_ml > 0
     and (p_user_ids is null or wl.user_id = any(p_user_ids))
  union all
  select m.user_id, public._sp_date(m.created_at) from public.chat_messages m
   where m.role = 'user'
     and m.created_at >= public._sp_start(p_from) and m.created_at < public._sp_start(p_to + 1)
     and (p_user_ids is null or m.user_id = any(p_user_ids));
$$;

revoke all on function public._admin_assert() from public;
revoke all on function public._admin_people(boolean, uuid) from public;
revoke all on function public._admin_users_base(boolean, uuid) from public;
revoke all on function public._admin_activity(date, date, uuid[]) from public;

-- ---------------------------------------------------------------------
-- 4. Dashboard
-- ---------------------------------------------------------------------
create or replace function public.admin_metrics(
  p_from date, p_to date, p_tier text default null, p_include_test boolean default false)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();
  perform public._admin_check_period(p_from, p_to);

  return (
    with b as (
      select * from public._admin_users_base(p_include_test) b
       where p_tier is null or b.tier = p_tier
    ),
    act as (
      select distinct a.user_id, a.d
        from public._admin_activity(least(p_from, p_to - 29), p_to) a
        join b on b.id = a.user_id
    ),
    ai as (
      select l.user_id, l.feature, l.status
        from public.ai_usage_log l
        join b on b.id = l.user_id
       where l.day between p_from and p_to
    )
    select json_build_object(
      'base', json_build_object(
        'total', (select count(*) from b),
        'by_role', (select coalesce(json_object_agg(role, n), '{}'::json)
                      from (select role, count(*) n from b group by role) x),
        'signups', (select count(*) from b where public._sp_date(created_at) between p_from and p_to),
        'deletions', (select count(*) from public.account_deletion_log
                       where deleted_at >= public._sp_start(p_from)
                         and deleted_at < public._sp_start(p_to + 1)),
        'suspended', (select count(*) from b where suspended_at is not null)
      ),
      'plans', json_build_object(
        'by_tier', (select coalesce(json_object_agg(tier, n), '{}'::json)
                      from (select tier, count(*) n from b group by tier) x),
        'by_kind', (select coalesce(json_object_agg(plan_kind, n), '{}'::json)
                      from (select plan_kind, count(*) n from b group by plan_kind) x),
        -- Quem paga pela loja, mesmo que o professor dê um plano maior.
        'paying', (select count(*) from b where paying),
        'store_by_plan', (select coalesce(json_agg(json_build_object('role', role, 'tier', own_tier, 'count', n)), '[]'::json)
                            from (select role, own_tier, count(*) n from b
                                   where paying group by role, own_tier) x),
        'trial_started', (select count(*) from b where trial_consumed),
        'trial_converted', (select count(*) from b where trial_consumed and paying)
      ),
      'engagement', json_build_object(
        'dau', (select count(distinct user_id) from act where d = p_to),
        'wau', (select count(distinct user_id) from act where d between p_to - 6 and p_to),
        'mau', (select count(distinct user_id) from act where d between p_to - 29 and p_to),
        'active_period', (select count(distinct user_id) from act where d between p_from and p_to)
      ),
      'ai', json_build_object(
        'total', (select count(*) from ai),
        'errors', (select count(*) from ai where status = 'error'),
        'users', (select count(distinct user_id) from ai),
        'by_feature', (select coalesce(json_object_agg(feature, n), '{}'::json)
                         from (select feature, count(*) n from ai group by feature) x),
        'top_users', (select coalesce(json_agg(t), '[]'::json) from (
                        select b.id, b.full_name, b.email, count(*) as total
                          from ai join b on b.id = ai.user_id
                         group by b.id, b.full_name, b.email
                         order by count(*) desc limit 5) t)
      ),
      'coaches', json_build_object(
        'total', (select count(*) from b where role = 'professor'),
        'top', (select coalesce(json_agg(t), '[]'::json) from (
                  select c.id, c.full_name, c.email, c.tier, c.plan_kind,
                         (select count(*) from public.profiles s where s.coach_id = c.id) as students
                    from b c where c.role = 'professor'
                   order by students desc, c.full_name limit 5) t),
        'enrollments', (select coalesce(json_object_agg(status, n), '{}'::json) from (
                          select r.status, count(*) n from public.coach_enrollment_requests r
                           where r.created_at >= public._sp_start(p_from)
                             and r.created_at < public._sp_start(p_to + 1)
                           group by r.status) x),
        'ratings', (select json_build_object('avg', round(avg(stars)::numeric, 2), 'count', count(*))
                      from public.coach_ratings)
      )
    )
  );
end;
$$;

create or replace function public.admin_timeseries(
  p_from date, p_to date, p_include_test boolean default false)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();
  perform public._admin_check_period(p_from, p_to);

  return (
    with b as (select id, created_at from public._admin_people(p_include_test)),
    days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
    signups as (select public._sp_date(created_at) as d, count(*) n from b group by 1),
    act as (select a.d, count(distinct a.user_id) n
              from public._admin_activity(p_from, p_to) a join b on b.id = a.user_id
             group by a.d),
    ai_f as (select l.day as d, l.feature, count(*) n
               from public.ai_usage_log l join b on b.id = l.user_id
              where l.day between p_from and p_to
              group by l.day, l.feature),
    ai as (select d, sum(n)::int as total, json_object_agg(feature, n) as by_feature
             from ai_f group by d)
    select coalesce(json_agg(json_build_object(
             'day', days.d,
             'signups', coalesce(signups.n, 0),
             'active', coalesce(act.n, 0),
             'ai', coalesce(ai.total, 0),
             'ai_by_feature', coalesce(ai.by_feature, '{}'::json)
           ) order by days.d), '[]'::json)
      from days
      left join signups using (d)
      left join act using (d)
      left join ai using (d)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Usuários
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_role text default null,
  p_tier text default null,
  p_kind text default null,          -- plan_kind, ou 'not_free'
  p_coach_id uuid default null,
  p_search text default null,
  p_include_test boolean default false,
  p_limit int default 50,
  p_offset int default 0)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_today date := public._sp_date(now());
begin
  perform public._admin_assert();

  return (
    with f as (
      select b.* from public._admin_users_base(p_include_test) b
       where (p_role is null or b.role = p_role)
         and (p_tier is null or b.tier = p_tier)
         and (p_kind is null or b.plan_kind = p_kind
              or (p_kind = 'not_free' and b.plan_kind not in ('free','grandfather')))
         and (p_coach_id is null or b.coach_id = p_coach_id)
         and (p_search is null or p_search = ''
              or b.full_name ilike '%' || p_search || '%'
              or b.email ilike '%' || p_search || '%')
    ),
    page as (
      select f.* from f order by f.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
    ),
    last_act as (
      select a.user_id, max(a.d) as d
        from public._admin_activity(v_today - 365, v_today, array(select page.id from page)) a
       group by a.user_id
    )
    select json_build_object(
      'total', (select count(*) from f),
      'users', coalesce((select json_agg(json_build_object(
          'id', p.id, 'email', p.email, 'full_name', p.full_name,
          'role', p.role, 'created_at', p.created_at, 'suspended_at', p.suspended_at,
          'tier', p.tier, 'plan_kind', p.plan_kind, 'paying', p.paying,
          'source', p.source, 'status', p.status,
          'trial_end', p.trial_end, 'period_end', p.period_end, 'note', p.note,
          'coach_id', p.coach_id, 'last_sign_in_at', p.last_sign_in_at,
          'coach_name', (select c.full_name from public.profiles c where c.id = p.coach_id),
          'students', (select count(*) from public.profiles s where s.coach_id = p.id),
          'last_activity', (select l.d from last_act l where l.user_id = p.id)
        ) order by p.created_at desc) from page p), '[]'::json)
    )
  );
end;
$$;

-- Professores pro filtro "alunos de" (leve: sem plano nem atividade).
create or replace function public.admin_coach_options()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();
  return (
    select coalesce(json_agg(json_build_object(
             'id', c.id, 'name', coalesce(nullif(c.full_name, ''), c.email),
             'students', (select count(*) from public.profiles s where s.coach_id = c.id))
           order by coalesce(nullif(c.full_name, ''), c.email)), '[]'::json)
      from public._admin_people(true) c
     where c.role = 'professor'
  );
end;
$$;

create or replace function public.admin_user_detail(p_uid uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_today date := public._sp_date(now());
begin
  perform public._admin_assert();

  return json_build_object(
    'user', (select row_to_json(b) from public._admin_users_base(true, p_uid) b),
    'profile', (select json_build_object(
                  'user_number', p.user_number, 'is_early_adopter', p.is_early_adopter,
                  'sex', p.sex, 'birth_year', p.birth_year, 'goal_type', p.goal_type,
                  'weight_kg', p.weight_kg, 'height_cm', p.height_cm, 'goal_weight_kg', p.goal_weight_kg,
                  'daily_calorie_goal', p.daily_calorie_goal, 'protein_goal_g', p.protein_goal_g,
                  'water_goal_ml', p.water_goal_ml, 'coach_linked_at', p.coach_linked_at,
                  'has_push', p.expo_push_token is not null)
                  from public.profiles p where p.id = p_uid),
    'coach', (select json_build_object('id', c.id, 'full_name', c.full_name)
                from public.profiles p join public.profiles c on c.id = p.coach_id
               where p.id = p_uid),
    'students', (select coalesce(json_agg(json_build_object(
                   'id', s.id, 'full_name', s.full_name, 'linked_at', s.coach_linked_at)
                   order by s.full_name), '[]'::json)
                   from public.profiles s where s.coach_id = p_uid),
    'counts', json_build_object(
      'food_logs', (select count(*) from public.food_logs where user_id = p_uid),
      'workout_sessions', (select count(*) from public.workout_sessions where user_id = p_uid),
      'water_days', (select count(*) from public.water_logs where user_id = p_uid and volume_ml > 0),
      'chat_messages', (select count(*) from public.chat_messages where user_id = p_uid and role = 'user'),
      'ai_by_feature', (select coalesce(json_object_agg(feature, n), '{}'::json) from (
                          select feature, count(*) n from public.ai_usage_log
                           where user_id = p_uid group by feature) x)
    ),
    'last_activity', (select max(a.d) from public._admin_activity(v_today - 365, v_today, array[p_uid]) a)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Uso da IA: só contadores (nunca o conteúdo das conversas)
-- ai_usage_log guarda cada chamada com status (success | error |
-- quota_exceeded) e error_code; push_history guarda cada push.
-- ---------------------------------------------------------------------

-- coach-import-workout-ai grava feature 'coach_import_workout', que nunca
-- entrou na lista: o insert falhava calado e as importações não eram contadas.
alter table public.ai_usage_log drop constraint if exists ai_usage_log_feature_check;
alter table public.ai_usage_log add constraint ai_usage_log_feature_check
  check (feature in (
    'chat', 'sanity_check', 'onboarding_plan', 'coach_plan', 'coach_import_workout',
    'push_inactivity', 'push_streak', 'push_workout', 'push_weekly_summary',
    'push_coach_alert', 'push_plan_update', 'push_goal_achieved', 'push_protein',
    'push_workout_check', 'push_streak_warning', 'push_account_deleted',
    'push_coach_unlinked', 'push_enrollment_accepted', 'push_enrollment_declined',
    'push_student_left_coach'));

create or replace function public.admin_ai_usage(
  p_from date, p_to date, p_include_test boolean default false)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();
  perform public._admin_check_period(p_from, p_to);

  return (
    with b as (select id, full_name, email from public._admin_people(p_include_test)),
    l as (
      select l.user_id, l.feature, l.day, l.created_at, l.duration_ms, l.tokens, l.error_code,
             coalesce(l.status, 'unknown') as status
        from public.ai_usage_log l
        join b on b.id = l.user_id
       where l.day between p_from and p_to
    ),
    ph as (
      select h.status, h.skip_reason, h.ai_generated
        from public.push_history h
        join b on b.id = h.user_id
       where h.sent_at >= public._sp_start(p_from) and h.sent_at < public._sp_start(p_to + 1)
    ),
    days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
    per_day as (
      select day as d,
             count(*) filter (where status = 'success') as success,
             count(*) filter (where status = 'error') as error,
             count(*) filter (where status = 'quota_exceeded') as quota
        from l group by day
    )
    select json_build_object(
      'by_feature', (select coalesce(json_agg(x order by x.total desc), '[]'::json) from (
          select feature, count(*) as total,
                 count(*) filter (where status = 'success') as success,
                 count(*) filter (where status = 'error') as error,
                 count(*) filter (where status = 'quota_exceeded') as quota,
                 count(*) filter (where status = 'unknown') as unknown,
                 round(avg(duration_ms))::int as avg_ms,
                 sum(tokens)::bigint as tokens,
                 count(distinct user_id) as users
            from l group by feature) x),
      'daily', (select coalesce(json_agg(json_build_object(
                   'day', days.d,
                   'success', coalesce(per_day.success, 0),
                   'error', coalesce(per_day.error, 0),
                   'quota', coalesce(per_day.quota, 0)) order by days.d), '[]'::json)
                  from days left join per_day using (d)),
      -- Erros e ressalvas: status error, ou sucesso que veio com código
      -- (ex.: sanity_fallback_groq_down = respondeu pelo plano B).
      'codes', (select coalesce(json_agg(x order by x.count desc), '[]'::json) from (
          select feature, status, error_code as code, count(*) as count, max(created_at) as last_at
            from l where status = 'error' or error_code is not null
           group by feature, status, error_code) x),
      'top_users', (select coalesce(json_agg(x order by x.total desc), '[]'::json) from (
          select b.id, b.full_name, b.email, count(*) as total,
                 count(*) filter (where l.status = 'error') as errors
            from l join b on b.id = l.user_id
           group by b.id, b.full_name, b.email
           order by count(*) desc limit 10) x),
      'push', json_build_object(
        'sent', (select count(*) from ph where status = 'sent'),
        'sent_ai', (select count(*) from ph where status = 'sent' and ai_generated),
        'failed', (select count(*) from ph where status = 'failed'),
        'skipped', (select count(*) from ph where status = 'skipped'),
        'skip_reasons', (select coalesce(json_object_agg(skip_reason, n), '{}'::json) from (
                           select skip_reason, count(*) n from ph
                            where status = 'skipped' group by skip_reason) x)
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Exclusões de conta (com o motivo, quando a pessoa escreveu)
-- ---------------------------------------------------------------------
create or replace function public.admin_deletions(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();
  perform public._admin_check_period(p_from, p_to);
  return (
    select coalesce(json_agg(json_build_object(
             'id', d.id, 'deleted_at', d.deleted_at, 'role', d.role,
             'account_age_days', d.account_age_days, 'reason', d.deletion_reason,
             'coach_name', (select c.full_name from public.profiles c where c.id = d.was_linked_to_coach_id))
           order by d.deleted_at desc), '[]'::json)
      from public.account_deletion_log d
     where d.deleted_at >= public._sp_start(p_from) and d.deleted_at < public._sp_start(p_to + 1)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Parceria
-- ---------------------------------------------------------------------
create or replace function public.admin_set_partner_plan(
  p_uid uuid, p_tier text, p_until timestamptz default null, p_note text default null)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();

  if p_tier not in ('pro','premium') then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'invalid_until' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  -- Nunca sobrescreve uma assinatura paga em vigor (a loja é a fonte dela).
  if (public._resolve_entitlement(p_uid) ->> 'store_active')::boolean then
    raise exception 'has_store_subscription' using errcode = '23514';
  end if;

  insert into public.subscriptions (user_id, tier, source, status, period_end, note)
  values (p_uid, p_tier, 'partner', 'active', p_until, nullif(trim(p_note), ''))
  on conflict (user_id) do update set
    tier = excluded.tier,
    source = 'partner',
    status = 'active',
    period_end = excluded.period_end,
    note = excluded.note,
    updated_at = now();

  return public._resolve_entitlement(p_uid);
end;
$$;

create or replace function public.admin_revoke_partner_plan(p_uid uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();

  update public.subscriptions
     set tier = 'free', status = 'expired', period_end = now(), updated_at = now()
   where user_id = p_uid and source = 'partner';
  if not found then
    raise exception 'not_partner' using errcode = 'P0002';
  end if;

  return public._resolve_entitlement(p_uid);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Permissões: só authenticated chama (e a função barra quem não é admin)
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'admin_metrics(date, date, text, boolean)',
    'admin_timeseries(date, date, boolean)',
    'admin_list_users(text, text, text, uuid, text, boolean, int, int)',
    'admin_coach_options()',
    'admin_user_detail(uuid)',
    'admin_ai_usage(date, date, boolean)',
    'admin_deletions(date, date)',
    'admin_set_partner_plan(uuid, text, timestamptz, text)',
    'admin_revoke_partner_plan(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
