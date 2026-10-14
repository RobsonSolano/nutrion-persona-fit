-- =====================================================================
-- Persona Fit — Plano "pago por fora" no painel admin (2026-10-14)
-- Spec: .specs/features/2026-10-14-painel-admin-v2/
--
-- Quem paga fora da loja (Pix, transferência) ganha origem própria:
-- subscriptions.source = 'external', com valor mensal combinado opcional
-- (monthly_amount). Libera o plano como a parceria (até period_end; null =
-- sem fim), mas conta como pagante e entra na receita estimada.
-- A ação do painel vira "plano manual" com dois tipos: partner | external.
--
-- _resolve_entitlement, grant_server_trial, _admin_users_base,
-- admin_metrics e admin_list_users são as versões de
-- 20261014120000_painel_admin.sql com 'external' acrescentado.
-- =====================================================================

alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('store_play','store_apple','stripe','server_trial','grandfather','partner','external'));

alter table public.subscriptions add column if not exists monthly_amount numeric(10,2)
  check (monthly_amount is null or monthly_amount >= 0);
comment on column public.subscriptions.monthly_amount is
  'Valor mensal combinado (R$) de quem paga por fora da loja. Só o painel escreve.';

-- ---------------------------------------------------------------------
-- Entitlement e trial
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
  v_manual_active boolean;
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
                             'via','none','store_active',false,'manual',null);
  end if;

  select role, coach_id, is_early_adopter
    into v_role, v_coach_id, v_early
    from public.profiles where id = p_uid;

  if not found then
    return json_build_object('tier','free','source','none','ai_personal',false,
                             'ai_coach',false,'student_limit',null,'trial_end',null,
                             'via','none','store_active',false,'manual',null);
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
  -- Plano manual do painel admin (parceria ou pago por fora): vale até
  -- period_end; null = sem data de fim.
  v_manual_active := coalesce(v_source in ('partner', 'external')
                              and (v_period_end is null or v_period_end > now()), false);
  v_has_tier_access := (v_trial_active or v_store_active or v_manual_active)
                       and coalesce(v_tier in ('pro','premium'), false);
  v_grandfather := coalesce(v_source = 'grandfather', false) or coalesce(v_early, false);
  v_tier_out := case when v_has_tier_access then v_tier else 'free' end;
  -- De onde vem o plano (painel admin). Uma fonte só: as mesmas flags acima.
  v_via := case when not v_has_tier_access then null
                when v_store_active then 'store'
                when v_manual_active then v_source
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
      'via', coalesce(v_via, 'none'), 'store_active', v_store_active,
      'manual', case when v_manual_active then v_source end);
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
    'store_active', v_store_active,
    -- Plano manual vigente da própria pessoa, mesmo que o efetivo venha do professor.
    'manual', case when v_manual_active then v_source end);
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
  -- Grandfather-safe: nunca sobrescreve IA-pra-sempre, assinatura de loja nem plano manual.
  if v_source in ('grandfather', 'store_play', 'store_apple', 'stripe', 'partner', 'external') then
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
-- Base e telas do painel
-- ---------------------------------------------------------------------
drop function if exists public._admin_users_base(boolean, uuid);
create function public._admin_users_base(p_include_test boolean, p_uid uuid default null)
returns table (
  id uuid, email text, full_name text, avatar_url text, role text, coach_id uuid,
  created_at timestamptz, suspended_at timestamptz, last_sign_in_at timestamptz,
  tier text, plan_kind text, store_active boolean, manual text, paying boolean, own_tier text,
  source text, status text, trial_end timestamptz, period_end timestamptz,
  note text, monthly_amount numeric, trial_consumed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.*,
         x.e ->> 'tier',
         case x.e ->> 'via' when 'none' then 'free' else x.e ->> 'via' end,
         x.store_active,
         x.e ->> 'manual',
         -- Paga = loja ativa ou pago por fora vigente (mesmo herdando plano maior).
         x.store_active or x.e ->> 'manual' = 'external',
         s.tier, s.source, s.status, s.trial_end, s.period_end, s.note, s.monthly_amount,
         coalesce(s.trial_consumed, false)
    from public._admin_people(p_include_test, p_uid) p
    cross join lateral (
      select e, coalesce((e ->> 'store_active')::boolean, false) as store_active
        from (select public._resolve_entitlement(p.id) as e) r
    ) x
    left join public.subscriptions s on s.user_id = p.id;
$$;
revoke all on function public._admin_users_base(boolean, uuid) from public;

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
        -- Quem paga: pela loja (mesmo que o professor dê um plano maior) ou por fora.
        'paying', (select count(*) from b where paying),
        'paying_by', json_build_object(
          'store', (select count(*) from b where store_active),
          'external', (select count(*) from b where manual = 'external')),
        'external_revenue', (select coalesce(sum(monthly_amount), 0) from b where manual = 'external'),
        'external_missing_amount', (select count(*) from b where manual = 'external' and monthly_amount is null),
        'store_by_plan', (select coalesce(json_agg(json_build_object('role', role, 'tier', own_tier, 'count', n)), '[]'::json)
                            from (select role, own_tier, count(*) n from b
                                   where store_active group by role, own_tier) x),
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
          'tier', p.tier, 'plan_kind', p.plan_kind, 'manual', p.manual,
          'source', p.source, 'status', p.status,
          'trial_end', p.trial_end, 'period_end', p.period_end, 'note', p.note,
          'monthly_amount', p.monthly_amount, 'store_active', p.store_active,
          'coach_id', p.coach_id, 'last_sign_in_at', p.last_sign_in_at,
          'coach_name', (select c.full_name from public.profiles c where c.id = p.coach_id),
          'students', (select count(*) from public.profiles s where s.coach_id = p.id),
          'last_activity', (select l.d from last_act l where l.user_id = p.id)
        ) order by p.created_at desc) from page p), '[]'::json)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Plano manual: parceria (não paga) ou pago por fora
-- ---------------------------------------------------------------------
drop function if exists public.admin_set_partner_plan(uuid, text, timestamptz, text);
drop function if exists public.admin_revoke_partner_plan(uuid);

create or replace function public.admin_set_manual_plan(
  p_uid uuid,
  p_kind text,                       -- 'partner' | 'external'
  p_tier text,
  p_until timestamptz default null,
  p_note text default null,
  p_amount numeric default null)     -- só pra 'external'
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();

  if p_kind not in ('partner','external') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_tier not in ('pro','premium') then
    raise exception 'invalid_tier' using errcode = '22023';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'invalid_until' using errcode = '22023';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  -- Nunca sobrescreve uma assinatura paga em vigor (a loja é a fonte dela).
  if (public._resolve_entitlement(p_uid) ->> 'store_active')::boolean then
    raise exception 'has_store_subscription' using errcode = '23514';
  end if;

  insert into public.subscriptions (user_id, tier, source, status, period_end, note, monthly_amount)
  values (p_uid, p_tier, p_kind, 'active', p_until, nullif(trim(p_note), ''),
          case when p_kind = 'external' then p_amount end)
  on conflict (user_id) do update set
    tier = excluded.tier,
    source = excluded.source,
    status = 'active',
    period_end = excluded.period_end,
    note = excluded.note,
    monthly_amount = excluded.monthly_amount,
    updated_at = now();

  return public._resolve_entitlement(p_uid);
end;
$$;

create or replace function public.admin_revoke_manual_plan(p_uid uuid)
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
   where user_id = p_uid and source in ('partner', 'external');
  if not found then
    raise exception 'not_manual' using errcode = 'P0002';
  end if;

  return public._resolve_entitlement(p_uid);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_set_manual_plan(uuid, text, text, timestamptz, text, numeric)',
    'admin_revoke_manual_plan(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
