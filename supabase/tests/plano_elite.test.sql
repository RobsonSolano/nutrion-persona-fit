-- =====================================================================
-- Teste do Plano Elite e do Pessoal Premium (2026-11-04)
-- Cobre [ELITE]-01..04, [ELITE]-08 (parte SQL), [PREM]-02 (servidor) e
-- [PREM]-03 (base de dados: own_tier).
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/plano_elite.test.sql
-- Saída esperada ao final: NOTICE "PLANO_ELITE: ALL PASS".
--
-- Dados do teste: prefixo de UUID 0e11e000-..., e-mails/nomes com "onda1".
-- =====================================================================
begin;

-- Mensagem + código do erro que o comando levanta (null se não levantar).
create function public._t_err_e1(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate || ':' || sqlerrm;
end;
$$;

create function public._t_as_e1(p_uid text)
returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '' else
      format('{"sub":"%s","role":"authenticated"}', p_uid) end, true);
$$;

set local session_replication_role = replica;

-- Pessoas:
--  01 comum free | 02 comum pro (loja) | 03 comum premium (loja) | 04 comum trial pro
--  05 prof free | 06 prof pro | 07 prof premium | 08 prof elite (loja)
--  09 aluno do elite, sem assinatura | 10 aluno do elite com premium próprio
--  11 comum que perdeu o premium (loja vencida), com solicitação aberta
--  12 prof elite por fora (external) | 13 prof trial elite | 14 admin
--  15 aluno do prof free, sem nada | 16 comum "elite" por parceria
insert into auth.users (id, email)
select ('0e11e000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'usuario' || n || '-onda1@teste.local'
  from generate_series(1, 16) n;

insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('0e11e000-0000-0000-0000-000000000001', 'comum',     null, 9801, 'Comum Free onda1'),
  ('0e11e000-0000-0000-0000-000000000002', 'comum',     null, 9802, 'Comum Pro onda1'),
  ('0e11e000-0000-0000-0000-000000000003', 'comum',     null, 9803, 'Comum Premium onda1'),
  ('0e11e000-0000-0000-0000-000000000004', 'comum',     null, 9804, 'Comum Trial onda1'),
  ('0e11e000-0000-0000-0000-000000000005', 'professor', null, 9805, 'Prof Free onda1'),
  ('0e11e000-0000-0000-0000-000000000006', 'professor', null, 9806, 'Prof Pro onda1'),
  ('0e11e000-0000-0000-0000-000000000007', 'professor', null, 9807, 'Prof Premium onda1'),
  ('0e11e000-0000-0000-0000-000000000008', 'professor', null, 9808, 'Prof Elite onda1'),
  ('0e11e000-0000-0000-0000-000000000009', 'aluno', '0e11e000-0000-0000-0000-000000000008', 9809, 'Aluno Do Elite onda1'),
  ('0e11e000-0000-0000-0000-000000000010', 'aluno', '0e11e000-0000-0000-0000-000000000008', 9810, 'Aluno Premium Proprio onda1'),
  ('0e11e000-0000-0000-0000-000000000011', 'comum',     null, 9811, 'Comum Perdeu Premium onda1'),
  ('0e11e000-0000-0000-0000-000000000012', 'professor', null, 9812, 'Prof Elite Por Fora onda1'),
  ('0e11e000-0000-0000-0000-000000000013', 'professor', null, 9813, 'Prof Trial Elite onda1'),
  ('0e11e000-0000-0000-0000-000000000014', 'comum',     null, 9814, 'Admin onda1'),
  ('0e11e000-0000-0000-0000-000000000015', 'aluno', '0e11e000-0000-0000-0000-000000000005', 9815, 'Aluno Do Free onda1'),
  ('0e11e000-0000-0000-0000-000000000016', 'comum',     null, 9816, 'Comum Parceria Elite onda1');

-- 25 alunos do professor premium (07) para o [ELITE]-03.
insert into auth.users (id, email)
select ('0e11e000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'lote' || n || '-onda1@teste.local'
  from generate_series(1, 25) n;
insert into public.profiles (id, role, coach_id, user_number, full_name)
select ('0e11e000-0000-0000-0001-0000000000' || lpad(n::text, 2, '0'))::uuid,
       'aluno', '0e11e000-0000-0000-0000-000000000007', 9900 + n, 'Aluno Lote ' || n || ' onda1'
  from generate_series(1, 25) n;

insert into public.coaches (id, cref, bio, is_public, state_uf, city, specialties, service_mode) values
  ('0e11e000-0000-0000-0000-000000000005', '045831-G/SP', 'bio', true, 'SP', 'Campinas', '{musculacao}', 'online'),
  ('0e11e000-0000-0000-0000-000000000006', '045832-G/SP', 'bio', true, 'SP', 'Campinas', '{musculacao}', 'online'),
  ('0e11e000-0000-0000-0000-000000000007', '045833-G/SP', 'bio', true, 'SP', 'Campinas', '{musculacao}', 'online'),
  ('0e11e000-0000-0000-0000-000000000008', '045834-G/SP', 'bio', true, 'SP', 'Campinas', '{musculacao}', 'online');

insert into public.admin_users (id, full_name) values
  ('0e11e000-0000-0000-0000-000000000014', 'Admin onda1');

insert into public.subscriptions (user_id, tier, source, status, trial_end, period_end) values
  ('0e11e000-0000-0000-0000-000000000002', 'pro',     'store_play',   'active',   null, now() + interval '20 days'),
  ('0e11e000-0000-0000-0000-000000000003', 'premium', 'store_play',   'active',   null, now() + interval '20 days'),
  ('0e11e000-0000-0000-0000-000000000004', 'pro',     'server_trial', 'in_trial', now() + interval '7 days', null),
  ('0e11e000-0000-0000-0000-000000000006', 'pro',     'store_play',   'active',   null, now() + interval '20 days'),
  ('0e11e000-0000-0000-0000-000000000007', 'premium', 'store_play',   'active',   null, now() + interval '20 days'),
  ('0e11e000-0000-0000-0000-000000000008', 'elite',   'store_play',   'active',   null, now() + interval '20 days'),
  ('0e11e000-0000-0000-0000-000000000010', 'premium', 'store_play',   'active',   null, now() + interval '20 days'),
  ('0e11e000-0000-0000-0000-000000000011', 'premium', 'store_play',   'canceled', null, now() - interval '1 day'),
  ('0e11e000-0000-0000-0000-000000000012', 'elite',   'external',     'active',   null, null),
  ('0e11e000-0000-0000-0000-000000000013', 'elite',   'server_trial', 'in_trial', now() + interval '7 days', null),
  ('0e11e000-0000-0000-0000-000000000016', 'elite',   'partner',      'active',   null, null);

-- Solicitação aberta do usuário 11 (já sem o premium) para o professor 08.
insert into public.coach_enrollment_requests (id, student_id, coach_id, status, contact_phone) values
  ('0e11e000-0000-0000-0002-000000000001', '0e11e000-0000-0000-0000-000000000011',
   '0e11e000-0000-0000-0000-000000000008', 'pendente', '11999998888');

set local session_replication_role = origin;

do $$
declare
  rec record;
  actual text;
  fail int := 0;
  r json;
  n int;
  e text;
begin
  -- ---------------------------------------------------------------
  -- ELITE-01: check constraint e ordem dos tiers
  -- ---------------------------------------------------------------
  assert pg_get_constraintdef((select oid from pg_constraint
           where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_tier_check'))
         like '%elite%', 'ELITE-01: subscriptions_tier_check deveria aceitar elite';
  assert (select count(*) from public.subscriptions
           where user_id = '0e11e000-0000-0000-0000-000000000008' and tier = 'elite') = 1,
         'ELITE-01: insert de assinatura elite deveria passar';
  assert public._tier_rank('free') = 0 and public._tier_rank('pro') = 1
     and public._tier_rank('premium') = 2 and public._tier_rank('elite') = 3,
         'ELITE-01: _tier_rank deveria dar 0/1/2/3';
  assert public._tier_rank('xpto') = 0 and public._tier_rank(null) = 0,
         'ELITE-01: tier desconhecido ou null deveria dar 0';

  -- ---------------------------------------------------------------
  -- ELITE-02 / ELITE-04 / PREM-03: entitlement
  -- ---------------------------------------------------------------
  for rec in select * from (values
    -- limites: nunca null para professor
    ('0e11e000-0000-0000-0000-000000000005'::uuid, 'student_limit', '2',  'ELITE-02: free = 2'),
    ('0e11e000-0000-0000-0000-000000000006'::uuid, 'student_limit', '5',  'ELITE-02: pro = 5'),
    ('0e11e000-0000-0000-0000-000000000007'::uuid, 'student_limit', '20', 'ELITE-02: premium = 20'),
    ('0e11e000-0000-0000-0000-000000000008'::uuid, 'student_limit', '50', 'ELITE-02: elite = 50'),
    -- elite por fora / trial / parceria vale como tier pago
    ('0e11e000-0000-0000-0000-000000000012'::uuid, 'tier', 'elite', 'ELITE-04: elite por fora'),
    ('0e11e000-0000-0000-0000-000000000012'::uuid, 'student_limit', '50', 'ELITE-02: elite por fora = 50'),
    ('0e11e000-0000-0000-0000-000000000013'::uuid, 'tier', 'elite', 'ELITE-04: elite em trial'),
    ('0e11e000-0000-0000-0000-000000000013'::uuid, 'student_limit', '50', 'ELITE-02: elite em trial = 50'),
    ('0e11e000-0000-0000-0000-000000000016'::uuid, 'tier', 'elite', 'ELITE-04: elite por parceria'),
    ('0e11e000-0000-0000-0000-000000000008'::uuid, 'ai_coach', 'true', 'ELITE-04: elite tem IA do professor'),
    -- aluno herda o melhor tier
    ('0e11e000-0000-0000-0000-000000000009'::uuid, 'tier', 'elite', 'ELITE-04: aluno herda elite'),
    ('0e11e000-0000-0000-0000-000000000009'::uuid, 'via', 'inherited', 'ELITE-04: via inherited'),
    ('0e11e000-0000-0000-0000-000000000010'::uuid, 'tier', 'elite', 'ELITE-04: aluno premium + prof elite = elite'),
    ('0e11e000-0000-0000-0000-000000000015'::uuid, 'tier', 'free', 'ELITE-04: aluno de prof free segue free'),
    -- own_tier
    ('0e11e000-0000-0000-0000-000000000003'::uuid, 'own_tier', 'premium', 'PREM-03: comum premium'),
    ('0e11e000-0000-0000-0000-000000000008'::uuid, 'own_tier', 'elite',   'PREM-03: professor elite'),
    ('0e11e000-0000-0000-0000-000000000009'::uuid, 'own_tier', 'free',    'PREM-03: aluno do elite sem assinatura'),
    ('0e11e000-0000-0000-0000-000000000010'::uuid, 'own_tier', 'premium', 'PREM-03: aluno com premium próprio'),
    ('0e11e000-0000-0000-0000-000000000004'::uuid, 'own_tier', 'pro',     'PREM-03: comum em trial'),
    ('0e11e000-0000-0000-0000-000000000001'::uuid, 'own_tier', 'free',    'PREM-03: comum free'),
    ('0e11e000-0000-0000-0000-000000000011'::uuid, 'own_tier', 'free',    'PREM-03: premium vencido')
  ) as t(uid, field, expected, label)
  loop
    actual := coalesce(public._resolve_entitlement(rec.uid) ->> rec.field, '<null>');
    if actual is distinct from rec.expected then
      raise warning 'FAIL % → got %, expected %', rec.label, actual, rec.expected;
      fail := fail + 1;
    end if;
  end loop;
  if fail > 0 then
    raise exception 'PLANO_ELITE: % asserção(ões) de entitlement falharam', fail;
  end if;

  -- professor sem perfil / grandfather nunca devolvem null de limite; sem perfil tem own_tier
  assert (public._resolve_entitlement(null) ->> 'own_tier') = 'free',
         'PREM-03: uid null deveria trazer own_tier free';
  assert (public._resolve_entitlement('0e11e000-0000-0000-0000-0000000000ff') ->> 'own_tier') = 'free',
         'PREM-03: sem perfil deveria trazer own_tier free';

  -- ---------------------------------------------------------------
  -- ELITE-03: premium com 25 alunos → 20 ativos e 5 suspensos
  -- ---------------------------------------------------------------
  perform public.sync_coach_student_access('0e11e000-0000-0000-0000-000000000007');
  select count(*) into n from public.profiles
   where coach_id = '0e11e000-0000-0000-0000-000000000007' and role = 'aluno' and suspended_at is null;
  assert n = 20, format('ELITE-03: deveria haver 20 ativos, há %s', n);
  select count(*) into n from public.profiles
   where coach_id = '0e11e000-0000-0000-0000-000000000007' and role = 'aluno' and suspended_at is not null;
  assert n = 5, format('ELITE-03: deveria haver 5 suspensos, há %s', n);

  -- ---------------------------------------------------------------
  -- ELITE-04: descoberta e policy de exercício
  -- ---------------------------------------------------------------
  assert public.is_coach_discoverable('0e11e000-0000-0000-0000-000000000008', null),
         'ELITE-04: professor elite deveria ser encontrável';
  assert public.is_coach_discoverable('0e11e000-0000-0000-0000-000000000007', null),
         'ELITE-04: professor premium segue encontrável';
  assert not public.is_coach_discoverable('0e11e000-0000-0000-0000-000000000006', null),
         'ELITE-04: professor pro não aparece';
  assert not public.is_coach_discoverable('0e11e000-0000-0000-0000-000000000005', null),
         'ELITE-04: professor free não aparece';
  assert (select with_check from pg_policies
           where schemaname = 'public' and tablename = 'exercises'
             and policyname = 'exercises_insert_premium_coach') like '%_tier_rank%',
         'ELITE-04: policy de exercício deveria usar _tier_rank (premium ou acima)';

  -- ---------------------------------------------------------------
  -- ELITE-08: admin_set_manual_plan com elite
  -- ---------------------------------------------------------------
  perform public._t_as_e1('0e11e000-0000-0000-0000-000000000014');
  r := public.admin_set_manual_plan('0e11e000-0000-0000-0000-000000000001', 'partner', 'elite');
  assert r ->> 'tier' = 'elite', format('ELITE-08: deveria devolver tier elite, veio %s', r);
  assert (select tier from public.subscriptions
           where user_id = '0e11e000-0000-0000-0000-000000000001') = 'elite',
         'ELITE-08: deveria gravar elite';
  e := public._t_err_e1($q$select public.admin_set_manual_plan('0e11e000-0000-0000-0000-000000000002', 'partner', 'free')$q$);
  assert e like '%invalid_tier%', format('ELITE-08: free deveria dar invalid_tier, veio %s', e);
  e := public._t_err_e1($q$select public.admin_set_manual_plan('0e11e000-0000-0000-0000-000000000002', 'partner', 'xpto')$q$);
  assert e like '%invalid_tier%', format('ELITE-08: xpto deveria dar invalid_tier, veio %s', e);
  -- volta o 01 para free (o teste seguinte depende dele sem plano)
  delete from public.subscriptions where user_id = '0e11e000-0000-0000-0000-000000000001';

  -- ---------------------------------------------------------------
  -- PREM-02: gate das 3 RPCs para comum sem Premium
  -- ---------------------------------------------------------------
  for rec in select u from unnest(array[
      '0e11e000-0000-0000-0000-000000000001',   -- free
      '0e11e000-0000-0000-0000-000000000002',   -- pro
      '0e11e000-0000-0000-0000-000000000004',   -- trial pro
      '0e11e000-0000-0000-0000-000000000011'    -- premium vencido
    ]) u
  loop
    perform public._t_as_e1(rec.u);
    e := public._t_err_e1($q$select * from public.search_coaches()$q$);
    assert e = 'PT402:needs_upgrade:coach_discovery',
      format('PREM-02: search_coaches de %s deveria dar PT402, veio %s', rec.u, e);
    e := public._t_err_e1($q$select public.get_coach_public_profile('0e11e000-0000-0000-0000-000000000008')$q$);
    assert e = 'PT402:needs_upgrade:coach_discovery',
      format('PREM-02: get_coach_public_profile de %s deveria dar PT402, veio %s', rec.u, e);
    e := public._t_err_e1($q$select public.request_coach('0e11e000-0000-0000-0000-000000000008', null, '11999998888')$q$);
    assert e = 'PT402:needs_upgrade:coach_discovery',
      format('PREM-02: request_coach de %s deveria dar PT402, veio %s', rec.u, e);
  end loop;

  -- Comum premium: busca, vê perfil e pede.
  perform public._t_as_e1('0e11e000-0000-0000-0000-000000000003');
  select count(*) into n from public.search_coaches()
   where coach_id = '0e11e000-0000-0000-0000-000000000008';
  assert n = 1, format('PREM-02: comum premium deveria ver o professor elite, viu %s', n);
  r := public.get_coach_public_profile('0e11e000-0000-0000-0000-000000000008');
  assert r is not null and r ->> 'coach_id' = '0e11e000-0000-0000-0000-000000000008',
         'PREM-02: comum premium deveria ver o perfil';
  r := public.request_coach('0e11e000-0000-0000-0000-000000000008', null, '11999998888');
  assert (r ->> 'ok')::boolean, format('PREM-02: comum premium deveria pedir, veio %s', r);

  -- Aluno e professor: comportamento atual (sem PT402).
  perform public._t_as_e1('0e11e000-0000-0000-0000-000000000009');
  e := public._t_err_e1($q$select * from public.search_coaches()$q$);
  assert e is null, format('PREM-02: aluno busca como hoje, veio %s', e);
  r := public.request_coach('0e11e000-0000-0000-0000-000000000008', null, '11999998888');
  assert r ->> 'error' = 'already_student', format('PREM-02: aluno segue already_student, veio %s', r);
  perform public._t_as_e1('0e11e000-0000-0000-0000-000000000005');
  e := public._t_err_e1($q$select public.get_coach_public_profile('0e11e000-0000-0000-0000-000000000008')$q$);
  assert e is null, format('PREM-02: professor vê perfil como hoje, veio %s', e);
  r := public.request_coach('0e11e000-0000-0000-0000-000000000008', null, '11999998888');
  assert r ->> 'error' = 'invalid_role', format('PREM-02: professor segue invalid_role, veio %s', r);

  -- Quem perdeu o premium ainda cancela e lista o que já abriu.
  perform public._t_as_e1('0e11e000-0000-0000-0000-000000000011');
  e := public._t_err_e1($q$select * from public.list_my_enrollment_requests()$q$);
  assert e is null, format('PREM-02: listar solicitações não leva gate, veio %s', e);
  e := public._t_err_e1($q$select public.mark_enrollment_seen('0e11e000-0000-0000-0002-000000000001')$q$);
  assert e is null, format('PREM-02: mark_enrollment_seen não leva gate, veio %s', e);
  r := public.cancel_my_enrollment_request('0e11e000-0000-0000-0002-000000000001');
  assert (r ->> 'ok')::boolean, format('PREM-02: cancelar solicitação aberta deveria passar, veio %s', r);

  perform public._t_as_e1(null);
  raise notice 'PLANO_ELITE: ALL PASS';
end $$;

rollback;
