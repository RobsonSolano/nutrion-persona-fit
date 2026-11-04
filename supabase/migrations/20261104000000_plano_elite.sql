-- =====================================================================
-- Plano Elite (professor) + Pessoal Premium (comum) — 2026-11-04
--
-- Spec: .specs/features/2026-11-04-plano-elite  ([ELITE]-01..04, [ELITE]-08,
--       [PREM]-02 servidor, [PREM]-03 base de dados)
--
-- O que muda:
--   1. subscriptions.tier aceita 'elite' (sem tocar nos dados existentes).
--   2. _tier_rank(text): ÚNICO lugar da ordem free < pro < premium < elite.
--   3. _resolve_entitlement: elite é tier pago; student_limit free 2 / pro 5 /
--      premium 20 / elite 50 (fim do ilimitado); aluno herda o melhor tier
--      (com elite); novo campo own_tier (tier da própria assinatura, antes
--      de herdar do professor).
--      Redefine a versão de 20261014180000.
--   4. is_coach_discoverable e a policy exercises_insert_premium_coach
--      aceitam premium OU ACIMA. Redefinem 20261013030000 / 20260826050000.
--   5. admin_set_manual_plan aceita 'elite'. Redefine 20261014200000.
--   6. _require_coach_discovery: usuário 'comum' sem premium não busca, não
--      vê perfil e não pede matrícula. Chamado em search_coaches
--      (20261013030000), get_coach_public_profile (20261013150000) e
--      request_coach (20261013110000). cancel_my_enrollment_request,
--      list_my_enrollment_requests e mark_enrollment_seen NÃO levam o gate:
--      quem perdeu o plano ainda cancela o que já abriu.
--
-- Idempotente: pode rodar duas vezes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Check constraint do tier
-- ---------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
alter table public.subscriptions
  add constraint subscriptions_tier_check check (tier in ('free','pro','premium','elite'));

-- ---------------------------------------------------------------------
-- 2. Ordem dos tiers — lugar único. Desconhecido/null = 0.
--    NÃO revogar de public: a policy de exercício roda como authenticated.
-- ---------------------------------------------------------------------
create or replace function public._tier_rank(p_tier text)
returns int
language sql
immutable
parallel safe
as $$
  select case p_tier
           when 'pro' then 1
           when 'premium' then 2
           when 'elite' then 3
           else 0
         end;
$$;

comment on function public._tier_rank(text) is
  'Ordem dos tiers: free 0 < pro 1 < premium 2 < elite 3. Todo gate "premium ou acima" compara por aqui.';

-- ---------------------------------------------------------------------
-- 3. Entitlement
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
    return json_build_object('tier','free','own_tier','free','source','none','ai_personal',false,
                             'ai_coach',false,'student_limit',null,'trial_end',null,
                             'via','none','store_active',false,'manual',null);
  end if;

  select role, coach_id, is_early_adopter
    into v_role, v_coach_id, v_early
    from public.profiles where id = p_uid;

  if not found then
    return json_build_object('tier','free','own_tier','free','source','none','ai_personal',false,
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
                       and public._tier_rank(v_tier) >= public._tier_rank('pro');
  v_grandfather := coalesce(v_source = 'grandfather', false) or coalesce(v_early, false);
  v_tier_out := case when v_has_tier_access then v_tier else 'free' end;
  -- De onde vem o plano (painel admin). Uma fonte só: as mesmas flags acima.
  v_via := case when not v_has_tier_access then null
                when v_store_active then 'store'
                when v_manual_active then v_source
                else 'trial' end;
  -- Tier da própria assinatura, antes de qualquer herança do professor.
  v_own_tier := v_tier_out;

  if v_role = 'aluno' then
    if v_coach_id is null then
      v_ai_personal := false;
    else
      -- Uma chamada só: o mesmo resultado alimenta a IA herdada e o tier.
      v_coach_ent := public._resolve_entitlement(v_coach_id);
      v_ai_personal := coalesce((v_coach_ent ->> 'ai_personal')::boolean, false);
      v_coach_tier := v_coach_ent ->> 'tier';
      -- Melhor dos dois: o aluno nunca perde o que já pagou, e nunca fica
      -- abaixo do que o professor oferece.
      if public._tier_rank(v_coach_tier) > public._tier_rank(v_tier_out) then
        v_tier_out := v_coach_tier;
      end if;
      -- Herdado só quando o plano do professor é maior que o próprio.
      if v_tier_out <> v_own_tier then
        v_via := 'inherited';
      end if;
    end if;
    return json_build_object(
      'tier', v_tier_out, 'own_tier', v_own_tier, 'source', coalesce(v_source,'none'),
      'ai_personal', v_ai_personal, 'ai_coach', false,
      'student_limit', null, 'trial_end', v_trial_end,
      'via', coalesce(v_via, 'none'), 'store_active', v_store_active,
      'manual', case when v_manual_active then v_source end);
  end if;

  v_ai_personal := v_has_tier_access or v_grandfather;

  if v_role = 'professor' then
    v_ai_coach := v_has_tier_access;  -- D3: grandfather/early NÃO concede coach
    -- Nenhum tier de professor é ilimitado. free/grandfather = 2.
    v_student_limit := case
                         when public._tier_rank(v_tier_out) >= public._tier_rank('elite') then 50
                         when public._tier_rank(v_tier_out) >= public._tier_rank('premium') then 20
                         when public._tier_rank(v_tier_out) >= public._tier_rank('pro') then 5
                         else 2 end;
  else
    v_ai_coach := false;
    v_student_limit := null;
  end if;

  return json_build_object(
    'tier', v_tier_out, 'own_tier', v_own_tier, 'source', coalesce(v_source,'none'),
    'ai_personal', v_ai_personal, 'ai_coach', v_ai_coach,
    'student_limit', v_student_limit, 'trial_end', v_trial_end,
    'via', coalesce(v_via, case when v_grandfather then 'grandfather' end, 'none'),
    'store_active', v_store_active,
    -- Plano manual vigente da própria pessoa, mesmo que o efetivo venha do professor.
    'manual', case when v_manual_active then v_source end);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Descoberta e exercício próprio: premium ou acima
-- ---------------------------------------------------------------------
create or replace function public.is_coach_discoverable(
  p_coach_id uuid,
  p_viewer_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_ok boolean;
begin
  select c.is_public
         and public.is_valid_credential(c.cref)
         and c.state_uf is not null
         and c.city is not null
         and c.service_mode is not null
         and array_length(c.specialties, 1) >= 1
         and p.role = 'professor'
         and public._tier_rank(public._resolve_entitlement(c.id) ->> 'tier')
             >= public._tier_rank('premium')
    into v_ok
    from public.coaches c
    join public.profiles p on p.id = c.id
   where c.id = p_coach_id;

  if not coalesce(v_ok, false) then
    return false;
  end if;

  if p_viewer_id is not null and exists (
    select 1 from public.coach_blocks
     where coach_id = p_coach_id and user_id = p_viewer_id
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_coach_discoverable(uuid, uuid) is
  'Regra única de quem aparece na busca: opt-in + premium ou acima + CREF válido + perfil completo + não bloqueou o viewer.';

-- Usa o wrapper `resolve_entitlement()` e NÃO o `_resolve_entitlement(uuid)`
-- interno: só o wrapper tem `grant execute ... to authenticated`
-- (20260622000000), e ele já resolve pelo auth.uid().
drop policy if exists "exercises_insert_premium_coach" on public.exercises;
create policy "exercises_insert_premium_coach" on public.exercises
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'professor'
    )
    and public._tier_rank(public.resolve_entitlement() ->> 'tier') >= public._tier_rank('premium')
  );

-- ---------------------------------------------------------------------
-- 5. admin_set_manual_plan aceita elite (resto igual a 20261014200000)
-- ---------------------------------------------------------------------
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
  if p_tier not in ('pro','premium','elite') then
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

-- ---------------------------------------------------------------------
-- 6. Gate da busca de professores ([PREM]-02)
--    Só 'comum' sem premium é barrado. Aluno e professor passam como hoje;
--    auth.uid() null passa (o grant já é só authenticated). O gate é do
--    servidor: a UI não é a fronteira de segurança.
-- ---------------------------------------------------------------------
create or replace function public._require_coach_discovery(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_role text;
begin
  if p_uid is null then
    return;
  end if;

  select role into v_role from public.profiles where id = p_uid;

  if v_role = 'comum'
     and public._tier_rank(public._resolve_entitlement(p_uid) ->> 'tier')
         < public._tier_rank('premium') then
    raise exception 'needs_upgrade:coach_discovery' using errcode = 'PT402';
  end if;
end;
$$;

-- Só roda por dentro das RPCs security definer.
revoke all on function public._require_coach_discovery(uuid) from public, anon, authenticated;

-- search_coaches: igual a 20261013030000, com o gate como primeira instrução
-- (função SQL com várias instruções devolve a última).
create or replace function public.search_coaches(
  p_uf text default null,
  p_city text default null,
  p_specialties text[] default null,
  p_service_mode text default null,
  p_query text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  coach_id uuid,
  full_name text,
  avatar_url text,
  bio text,
  state_uf text,
  city text,
  specialties text[],
  service_mode text,
  rating_avg numeric,
  rating_count int
)
language sql
security definer
set search_path = public
stable
as $$
  select public._require_coach_discovery(auth.uid());

  select c.id,
         p.full_name,
         p.avatar_url,
         c.bio,
         c.state_uf,
         c.city,
         c.specialties,
         c.service_mode,
         round(coalesce(r.avg_stars, 0)::numeric, 1),
         coalesce(r.total, 0)::int
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join lateral (
      select avg(stars)::numeric as avg_stars, count(*)::int as total
        from public.coach_ratings where coach_id = c.id
    ) r on true
   where public.is_coach_discoverable(c.id, auth.uid())
     and (p_uf is null or c.state_uf = upper(p_uf))
     and (p_city is null or c.city = p_city)
     and (p_service_mode is null or c.service_mode = p_service_mode
          or (p_service_mode in ('online','presencial') and c.service_mode = 'hibrido'))
     and (p_specialties is null or c.specialties && p_specialties)
     and (p_query is null or p.full_name ilike '%' || p_query || '%')
   order by coalesce(r.avg_stars, 0) desc, coalesce(r.total, 0) desc, p.full_name asc
   limit least(coalesce(p_limit, 30), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_coaches(text, text, text[], text, text, int, int) is
  'Busca pública de professores. Só colunas públicas — a RLS de profiles NÃO é afrouxada. Híbrido aparece nos filtros online e presencial. Usuário comum precisa de premium ou acima (needs_upgrade:coach_discovery).';

-- get_coach_public_profile: igual a 20261013150000, com o gate no início.
create or replace function public.get_coach_public_profile(p_coach_id uuid)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row json;
  v_uid uuid := auth.uid();
begin
  perform public._require_coach_discovery(v_uid);

  if not public.is_coach_discoverable(p_coach_id, v_uid) then
    return null;
  end if;

  select json_build_object(
           'coach_id', c.id,
           'full_name', p.full_name,
           'avatar_url', p.avatar_url,
           'bio', c.bio,
           'cref', c.cref,
           'state_uf', c.state_uf,
           'city', c.city,
           'specialties', c.specialties,
           'service_mode', c.service_mode,
           'rating_avg', round(coalesce(r.avg_stars, 0)::numeric, 1),
           'rating_count', coalesce(r.total, 0),
           'my_rating', (select stars from public.coach_ratings
                          where coach_id = c.id and student_id = v_uid),
           'my_comment', (select comment from public.coach_ratings
                           where coach_id = c.id and student_id = v_uid),
           'can_rate', public.can_rate_coach(v_uid, c.id),
           'open_request_status', (select status from public.coach_enrollment_requests
                                    where coach_id = c.id and student_id = v_uid
                                      and status in ('pendente','andamento')
                                    limit 1)
         )
    into v_row
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join lateral (
      select avg(stars)::numeric as avg_stars, count(*)::int as total
        from public.coach_ratings where coach_id = c.id
    ) r on true
   where c.id = p_coach_id;

  return v_row;
end;
$$;

-- request_coach: igual a 20261013110000. O gate vem depois das checagens de
-- role (already_student / invalid_role não mudam) e é um raise, como nas
-- outras duas RPCs.
create or replace function public.request_coach(
  p_coach_id uuid,
  p_message text default null,
  p_contact_phone text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_phone text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- O professor precisa de um jeito de responder fora do app: sem canal de
  -- contato a solicitação morre na fila.
  v_phone := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  if v_phone !~ '^[0-9]{10,13}$' then
    return json_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  select role into v_role from public.profiles where id = v_uid;

  if v_role = 'aluno' then
    return json_build_object('ok', false, 'error', 'already_student');
  end if;
  if v_role <> 'comum' then
    return json_build_object('ok', false, 'error', 'invalid_role');
  end if;

  -- Pessoal Premium ou acima ([PREM]-02).
  perform public._require_coach_discovery(v_uid);

  if not public.is_coach_discoverable(p_coach_id, v_uid) then
    return json_build_object('ok', false, 'error', 'coach_unavailable');
  end if;

  if exists (
    select 1 from public.coach_enrollment_requests
     where student_id = v_uid and coach_id = p_coach_id
       and status in ('pendente','andamento')
  ) then
    return json_build_object('ok', false, 'error', 'already_requested');
  end if;

  if (
    select count(*) from public.coach_enrollment_requests
     where student_id = v_uid and status in ('pendente','andamento')
  ) >= 5 then
    return json_build_object('ok', false, 'error', 'too_many_open');
  end if;

  insert into public.coach_enrollment_requests
    (student_id, coach_id, message, contact_phone)
  values (v_uid, p_coach_id, nullif(btrim(coalesce(p_message, '')), ''), v_phone)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.request_coach(uuid, text, text) to authenticated;
