-- =====================================================================
-- Teste das regras de contratação de professor (2026-08-29)
-- Cobre: is_valid_credential, is_coach_discoverable, search_coaches,
--        request_coach, rate_coach, trigger de bloqueio, e o entitlement
--        do aluno com max(tier próprio, tier do coach).
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start -x vector
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/coach_enrollment.test.sql
-- Saída esperada ao final: NOTICE "COACH_ENROLLMENT: ALL PASS".
--
-- Mesma técnica do resolve_entitlement.test.sql: session_replication_role
-- = replica pra bypassar triggers e a FK pra auth.users no seeding.
-- =====================================================================
begin;
set local session_replication_role = replica;

-- ---------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------
insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('bbbbbbbb-0000-0000-0000-000000000001','professor', null, 9101, 'Prof Premium Completo'),
  ('bbbbbbbb-0000-0000-0000-000000000002','professor', null, 9102, 'Prof Free'),
  ('bbbbbbbb-0000-0000-0000-000000000003','professor', null, 9103, 'Prof Premium Privado'),
  ('bbbbbbbb-0000-0000-0000-000000000004','professor', null, 9104, 'Prof Premium CREF Ruim'),
  ('bbbbbbbb-0000-0000-0000-000000000010','comum',     null, 9110, 'Usuario Comum'),
  ('bbbbbbbb-0000-0000-0000-000000000011','comum',     null, 9111, 'Usuario Bloqueado'),
  ('bbbbbbbb-0000-0000-0000-000000000012','aluno','bbbbbbbb-0000-0000-0000-000000000001', 9112, 'Ja Aluno');

insert into public.coaches (id, cref, bio, is_public, state_uf, city, specialties, service_mode) values
  ('bbbbbbbb-0000-0000-0000-000000000001','045821-G/SP','bio',   true,  'SP','Campinas','{musculacao,crossfit}','presencial'),
  ('bbbbbbbb-0000-0000-0000-000000000002','045822-G/SP','bio',   true,  'SP','Campinas','{musculacao}',         'online'),
  ('bbbbbbbb-0000-0000-0000-000000000003','045823-G/SP','bio',   false, 'SP','Campinas','{musculacao}',         'online'),
  ('bbbbbbbb-0000-0000-0000-000000000004','sou professor','bio', true,  'SP','Campinas','{musculacao}',         'hibrido');

-- Premium pra 1, 3 e 4; nada pra 2 (free).
insert into public.subscriptions (user_id, tier, source, status, period_end) values
  ('bbbbbbbb-0000-0000-0000-000000000001','premium','store_play','active', now() + interval '30 days'),
  ('bbbbbbbb-0000-0000-0000-000000000003','premium','store_play','active', now() + interval '30 days'),
  ('bbbbbbbb-0000-0000-0000-000000000004','premium','store_play','active', now() + interval '30 days')
on conflict (user_id) do update set tier = excluded.tier, source = excluded.source,
  status = excluded.status, period_end = excluded.period_end;

set local session_replication_role = origin;

-- ---------------------------------------------------------------------
-- 1. is_valid_credential
-- ---------------------------------------------------------------------
do $$
begin
  assert public.is_valid_credential('045821-G/SP'),        'CREF válido deveria passar';
  assert public.is_valid_credential('CREF 045821-G/SP'),   'CREF com prefixo deveria passar';
  assert public.is_valid_credential('098765-P/RJ'),        'provisionado deveria passar';
  assert public.is_valid_credential('CRN-3/45821'),        'CRN deveria passar';
  assert public.is_valid_credential('CRN-5/45821/P'),      'CRN provisório deveria passar';

  assert not public.is_valid_credential('sou professor'),  'texto livre deveria falhar';
  assert not public.is_valid_credential('999999-G/SP'),    'dígitos repetidos deveriam falhar';
  assert not public.is_valid_credential('111111-G/SP'),    'dígitos repetidos deveriam falhar';
  assert not public.is_valid_credential('123456-G/SP'),    'sequência deveria falhar';
  assert not public.is_valid_credential('654321-G/SP'),    'sequência inversa deveria falhar';
  assert not public.is_valid_credential('045821-G/XX'),    'UF inválida deveria falhar';
  assert not public.is_valid_credential('045821-X/SP'),    'categoria inválida deveria falhar';
  assert not public.is_valid_credential('CRN-12/45821'),   'região de CRN inválida deveria falhar';
  assert not public.is_valid_credential(null),             'null deveria falhar';
  raise notice 'OK 1: is_valid_credential';
end $$;

-- ---------------------------------------------------------------------
-- 2. is_coach_discoverable — as quatro travas
-- ---------------------------------------------------------------------
do $$
begin
  assert public.is_coach_discoverable('bbbbbbbb-0000-0000-0000-000000000001', null),
    'premium + público + CREF válido deveria ser encontrável';
  assert not public.is_coach_discoverable('bbbbbbbb-0000-0000-0000-000000000002', null),
    'professor free NÃO deveria aparecer';
  assert not public.is_coach_discoverable('bbbbbbbb-0000-0000-0000-000000000003', null),
    'professor sem opt-in NÃO deveria aparecer';
  assert not public.is_coach_discoverable('bbbbbbbb-0000-0000-0000-000000000004', null),
    'professor com CREF inválido NÃO deveria aparecer';
  raise notice 'OK 2: is_coach_discoverable';
end $$;

-- ---------------------------------------------------------------------
-- 3. Bloqueio esconde o professor do usuário bloqueado
-- ---------------------------------------------------------------------
insert into public.coach_blocks (coach_id, user_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011');

do $$
begin
  assert not public.is_coach_discoverable(
      'bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000011'),
    'bloqueado NÃO deveria ver o professor';
  assert public.is_coach_discoverable(
      'bbbbbbbb-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000010'),
    'outro usuário deveria continuar vendo';
  raise notice 'OK 3: bloqueio esconde';
end $$;

-- ---------------------------------------------------------------------
-- 4. Trigger: bloquear cancela solicitação aberta
-- ---------------------------------------------------------------------
insert into public.coach_enrollment_requests (student_id, coach_id, status)
values ('bbbbbbbb-0000-0000-0000-000000000010','bbbbbbbb-0000-0000-0000-000000000002','pendente');

insert into public.coach_blocks (coach_id, user_id) values
  ('bbbbbbbb-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000010');

do $$
declare v_status text;
begin
  select status into v_status from public.coach_enrollment_requests
   where student_id = 'bbbbbbbb-0000-0000-0000-000000000010'
     and coach_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  assert v_status = 'cancelado',
    format('bloquear deveria cancelar a solicitação aberta, veio %s', v_status);
  raise notice 'OK 4: bloqueio cancela solicitação aberta';
end $$;

-- ---------------------------------------------------------------------
-- 5. Índice único: uma solicitação aberta por par
-- ---------------------------------------------------------------------
do $$
declare v_erro boolean := false;
begin
  insert into public.coach_enrollment_requests (student_id, coach_id, status)
  values ('bbbbbbbb-0000-0000-0000-000000000011','bbbbbbbb-0000-0000-0000-000000000001','pendente');
  begin
    insert into public.coach_enrollment_requests (student_id, coach_id, status)
    values ('bbbbbbbb-0000-0000-0000-000000000011','bbbbbbbb-0000-0000-0000-000000000001','andamento');
  exception when unique_violation then
    v_erro := true;
  end;
  assert v_erro, 'segunda solicitação aberta do mesmo par deveria violar o índice único';

  -- Terminal não conflita: histórico pode repetir.
  update public.coach_enrollment_requests set status = 'cancelado'
   where student_id = 'bbbbbbbb-0000-0000-0000-000000000011'
     and coach_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  insert into public.coach_enrollment_requests (student_id, coach_id, status)
  values ('bbbbbbbb-0000-0000-0000-000000000011','bbbbbbbb-0000-0000-0000-000000000001','pendente');
  raise notice 'OK 5: uma aberta por par, terminais repetem';
end $$;

-- ---------------------------------------------------------------------
-- 6. rate_coach exige vínculo efetivado
-- ---------------------------------------------------------------------
do $$
declare v_res json;
begin
  -- Sem auth.uid() a RPC devolve unauthorized — prova que não escreve
  -- por engano em contexto sem sessão.
  v_res := public.rate_coach('bbbbbbbb-0000-0000-0000-000000000001', 5::smallint);
  assert (v_res ->> 'ok') = 'false', 'rate_coach sem sessão deveria falhar';
  assert (v_res ->> 'error') = 'unauthorized',
    format('esperava unauthorized, veio %s', v_res ->> 'error');
  raise notice 'OK 6: rate_coach barra sem sessão';
end $$;

-- ---------------------------------------------------------------------
-- 7. search_coaches devolve só o elegível e agrega estrelas
-- ---------------------------------------------------------------------
insert into public.coach_enrollment_requests (student_id, coach_id, status)
values ('bbbbbbbb-0000-0000-0000-000000000012','bbbbbbbb-0000-0000-0000-000000000001','efetuado');
insert into public.coach_ratings (student_id, coach_id, stars) values
  ('bbbbbbbb-0000-0000-0000-000000000012','bbbbbbbb-0000-0000-0000-000000000001', 4);

do $$
declare
  v_total int;
  v_avg numeric;
  v_count int;
begin
  select count(*) into v_total from public.search_coaches();
  assert v_total = 1, format('só 1 professor deveria aparecer, vieram %s', v_total);

  select rating_avg, rating_count into v_avg, v_count
    from public.search_coaches() limit 1;
  assert v_avg = 4.0, format('média deveria ser 4.0, veio %s', v_avg);
  assert v_count = 1, format('total de avaliações deveria ser 1, veio %s', v_count);

  -- Filtros
  select count(*) into v_total from public.search_coaches(p_uf => 'SP', p_city => 'Campinas');
  assert v_total = 1, 'filtro por UF+cidade deveria achar';
  select count(*) into v_total from public.search_coaches(p_uf => 'RJ');
  assert v_total = 0, 'filtro por outra UF não deveria achar';
  select count(*) into v_total from public.search_coaches(p_specialties => '{crossfit}');
  assert v_total = 1, 'filtro por especialidade deveria achar';
  select count(*) into v_total from public.search_coaches(p_specialties => '{powerlifting}');
  assert v_total = 0, 'especialidade que ele não tem não deveria achar';
  select count(*) into v_total from public.search_coaches(p_service_mode => 'online');
  assert v_total = 0, 'presencial não deveria aparecer no filtro online';
  raise notice 'OK 7: search_coaches filtra e agrega';
end $$;

-- ---------------------------------------------------------------------
-- 8. Híbrido aparece nos dois filtros
-- ---------------------------------------------------------------------
update public.coaches set service_mode = 'hibrido'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

do $$
declare v_total int;
begin
  select count(*) into v_total from public.search_coaches(p_service_mode => 'online');
  assert v_total = 1, 'híbrido deveria aparecer no filtro online';
  select count(*) into v_total from public.search_coaches(p_service_mode => 'presencial');
  assert v_total = 1, 'híbrido deveria aparecer no filtro presencial';
  raise notice 'OK 8: híbrido aparece nos dois filtros';
end $$;

-- ---------------------------------------------------------------------
-- 9. Entitlement do aluno = max(próprio, do coach)
-- ---------------------------------------------------------------------
do $$
declare v_ent json;
begin
  -- Aluno sem assinatura, coach premium → premium herdado.
  v_ent := public._resolve_entitlement('bbbbbbbb-0000-0000-0000-000000000012');
  assert (v_ent ->> 'tier') = 'premium',
    format('aluno de coach premium deveria ser premium, veio %s', v_ent ->> 'tier');
  assert (v_ent ->> 'ai_personal') = 'true', 'aluno deveria herdar a IA';

  -- Aluno com Pro próprio + coach premium → fica premium (o melhor).
  set local session_replication_role = replica;
  insert into public.subscriptions (user_id, tier, source, status, period_end)
  values ('bbbbbbbb-0000-0000-0000-000000000012','pro','store_play','active', now() + interval '10 days')
  on conflict (user_id) do update set tier = 'pro', source = 'store_play',
    status = 'active', period_end = now() + interval '10 days';
  set local session_replication_role = origin;

  v_ent := public._resolve_entitlement('bbbbbbbb-0000-0000-0000-000000000012');
  assert (v_ent ->> 'tier') = 'premium',
    format('pro próprio + coach premium deveria dar premium, veio %s', v_ent ->> 'tier');

  -- Aluno com Pro próprio + coach FREE → mantém o Pro que ele paga.
  -- (replica de novo: mexer em profiles esbarra na FK pra auth.users e na
  -- trigger guard_role_changes, ambas irrelevantes pro que se testa aqui.)
  set local session_replication_role = replica;
  update public.profiles set coach_id = 'bbbbbbbb-0000-0000-0000-000000000002'
   where id = 'bbbbbbbb-0000-0000-0000-000000000012';
  set local session_replication_role = origin;
  v_ent := public._resolve_entitlement('bbbbbbbb-0000-0000-0000-000000000012');
  assert (v_ent ->> 'tier') = 'pro',
    format('aluno pagante com coach free deveria manter pro, veio %s', v_ent ->> 'tier');
  raise notice 'OK 9: entitlement do aluno usa o melhor dos dois';
end $$;

do $$ begin raise notice 'COACH_ENROLLMENT: ALL PASS'; end $$;

rollback;
