-- =====================================================================
-- Persona Fit — Pago por fora: desde quando, recorrência e dia (2026-10-14)
-- Spec: .specs/features/2026-10-14-painel-admin-v2/
--
-- Quem paga fora da loja ganha: data de início, se é recorrente e o dia do
-- mês em que paga. Recorrente entra na receita do mês (monthly_amount =
-- valor mensal); avulso (monthly_amount = valor único) fica à parte.
--
-- _admin_users_base, admin_metrics, admin_list_users e
-- admin_set_manual_plan são as versões de 20261014180000_plano_pago_por_fora
-- com esses campos acrescentados.
-- =====================================================================

alter table public.subscriptions
  add column if not exists external_since date,
  add column if not exists external_recurring boolean,
  add column if not exists external_billing_day smallint
    check (external_billing_day is null or external_billing_day between 1 and 31);

comment on column public.subscriptions.external_since is 'Pago por fora: desde quando paga.';
comment on column public.subscriptions.external_recurring is
  'Pago por fora: true = mensal (monthly_amount é o valor do mês); false = avulso (valor único).';
comment on column public.subscriptions.external_billing_day is 'Pago por fora recorrente: dia do mês do pagamento.';

-- Quem já estava marcado como pago por fora era mensal.
update public.subscriptions set external_recurring = true
 where source = 'external' and external_recurring is null;

drop function if exists public._admin_users_base(boolean, uuid);
create function public._admin_users_base(p_include_test boolean, p_uid uuid default null)
returns table (
  id uuid, email text, full_name text, avatar_url text, role text, coach_id uuid,
  created_at timestamptz, suspended_at timestamptz, last_sign_in_at timestamptz,
  tier text, plan_kind text, store_active boolean, manual text, paying boolean, own_tier text,
  source text, status text, trial_end timestamptz, period_end timestamptz,
  note text, monthly_amount numeric, external_since date, external_recurring boolean,
  external_billing_day smallint, trial_consumed boolean)
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
         s.external_since, s.external_recurring, s.external_billing_day,
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
        -- Recorrente entra na receita do mês; avulso é pagamento único, fica à parte.
        'external_revenue', (select coalesce(sum(monthly_amount), 0) from b
                              where manual = 'external' and external_recurring),
        'external_one_off', (select coalesce(sum(monthly_amount), 0) from b
                              where manual = 'external' and not external_recurring),
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
          'external_since', p.external_since, 'external_recurring', p.external_recurring,
          'external_billing_day', p.external_billing_day,
          'coach_id', p.coach_id, 'last_sign_in_at', p.last_sign_in_at,
          'coach_name', (select c.full_name from public.profiles c where c.id = p.coach_id),
          'students', (select count(*) from public.profiles s where s.coach_id = p.id),
          'last_activity', (select l.d from last_act l where l.user_id = p.id)
        ) order by p.created_at desc) from page p), '[]'::json)
    )
  );
end;
$$;

drop function if exists public.admin_set_manual_plan(uuid, text, text, timestamptz, text, numeric);
create or replace function public.admin_set_manual_plan(
  p_uid uuid,
  p_kind text,                       -- 'partner' | 'external'
  p_tier text,
  p_until timestamptz default null,
  p_note text default null,
  p_amount numeric default null,     -- só pra 'external': mensal se recorrente, único se avulso
  p_since date default null,         -- só pra 'external': desde quando paga
  p_recurring boolean default true,  -- só pra 'external'
  p_billing_day smallint default null) -- só pra 'external' recorrente: dia do mês
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
  if p_billing_day is not null and p_billing_day not between 1 and 31 then
    raise exception 'invalid_billing_day' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_uid) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  -- Nunca sobrescreve uma assinatura paga em vigor (a loja é a fonte dela).
  if (public._resolve_entitlement(p_uid) ->> 'store_active')::boolean then
    raise exception 'has_store_subscription' using errcode = '23514';
  end if;

  insert into public.subscriptions (user_id, tier, source, status, period_end, note, monthly_amount,
                                    external_since, external_recurring, external_billing_day)
  values (p_uid, p_tier, p_kind, 'active', p_until, nullif(trim(p_note), ''),
          case when p_kind = 'external' then p_amount end,
          case when p_kind = 'external' then p_since end,
          case when p_kind = 'external' then coalesce(p_recurring, true) end,
          case when p_kind = 'external' and coalesce(p_recurring, true) then p_billing_day end)
  on conflict (user_id) do update set
    tier = excluded.tier,
    source = excluded.source,
    status = 'active',
    period_end = excluded.period_end,
    note = excluded.note,
    monthly_amount = excluded.monthly_amount,
    external_since = excluded.external_since,
    external_recurring = excluded.external_recurring,
    external_billing_day = excluded.external_billing_day,
    updated_at = now();

  return public._resolve_entitlement(p_uid);
end;
$$;

revoke all on function public.admin_set_manual_plan(uuid, text, text, timestamptz, text, numeric, date, boolean, smallint) from public, anon;
grant execute on function public.admin_set_manual_plan(uuid, text, text, timestamptz, text, numeric, date, boolean, smallint) to authenticated;
