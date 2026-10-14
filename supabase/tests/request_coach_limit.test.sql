-- =====================================================================
-- Teste das travas da request_coach (2026-10-13)
-- Cobre [SOLI]-12 (máx. 5 solicitações abertas, canceladas/efetuadas não
-- contam) e [SOLI]-13 (aluno não solicita outro professor).
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start -x vector
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/request_coach_limit.test.sql
-- Saída esperada ao final: NOTICE "REQUEST_COACH_LIMIT: ALL PASS".
-- =====================================================================
begin;
set local session_replication_role = replica;

insert into auth.users (id, email)
select ('ffffffff-0000-0000-0000-00000000000' || n)::uuid, 'limite' || n || '@limit.test'
  from generate_series(1, 6) n;
insert into auth.users (id, email) values
  ('ffffffff-0000-0000-0000-000000000010', 'usuario@limit.test'),
  ('ffffffff-0000-0000-0000-000000000011', 'aluno@limit.test');

insert into public.profiles (id, role, coach_id, user_number, full_name)
select ('ffffffff-0000-0000-0000-00000000000' || n)::uuid, 'professor', null, 9400 + n, 'Prof Limite ' || n
  from generate_series(1, 6) n;
insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('ffffffff-0000-0000-0000-000000000010', 'comum', null, 9410, 'Usuario Em Massa'),
  ('ffffffff-0000-0000-0000-000000000011', 'aluno', 'ffffffff-0000-0000-0000-000000000001', 9411, 'Ja E Aluno');

-- CREFs distintos e válidos (sem sequência nem dígito repetido).
insert into public.coaches (id, cref, bio, is_public, state_uf, city, specialties, service_mode)
select ('ffffffff-0000-0000-0000-00000000000' || n)::uuid, '04582' || n || '-G/SP', 'bio', true,
       'SP', 'Campinas', '{musculacao}', 'online'
  from generate_series(1, 6) n;

insert into public.subscriptions (user_id, tier, source, status, period_end)
select ('ffffffff-0000-0000-0000-00000000000' || n)::uuid, 'premium', 'store_play', 'active',
       now() + interval '30 days'
  from generate_series(1, 6) n
on conflict (user_id) do update set tier = excluded.tier, source = excluded.source,
  status = excluded.status, period_end = excluded.period_end;

set local session_replication_role = origin;

do $$
declare
  r json;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-000000000010","role":"authenticated"}', true);

  -- 5 abertas, uma por professor: todas passam.
  for n in 1..5 loop
    r := public.request_coach(('ffffffff-0000-0000-0000-00000000000' || n)::uuid, null, '11999998888');
    assert (r ->> 'ok')::boolean, format('solicitação %s deveria passar, veio %s', n, r);
  end loop;

  -- A 6ª esbarra no limite e não grava nada.
  r := public.request_coach('ffffffff-0000-0000-0000-000000000006', null, '11999998888');
  assert r ->> 'error' = 'too_many_open', format('6ª deveria dar too_many_open, veio %s', r);
  select count(*) into n from public.coach_enrollment_requests
   where student_id = 'ffffffff-0000-0000-0000-000000000010';
  assert n = 5, format('6ª não deveria gravar, há %s', n);

  -- "andamento" também conta como aberta.
  update public.coach_enrollment_requests set status = 'andamento'
   where student_id = 'ffffffff-0000-0000-0000-000000000010'
     and coach_id = 'ffffffff-0000-0000-0000-000000000001';
  r := public.request_coach('ffffffff-0000-0000-0000-000000000006', null, '11999998888');
  assert r ->> 'error' = 'too_many_open', format('andamento deveria contar, veio %s', r);

  -- Cancelada não conta: libera a vaga.
  update public.coach_enrollment_requests set status = 'cancelado'
   where student_id = 'ffffffff-0000-0000-0000-000000000010'
     and coach_id = 'ffffffff-0000-0000-0000-000000000002';
  r := public.request_coach('ffffffff-0000-0000-0000-000000000006', null, '11999998888');
  assert (r ->> 'ok')::boolean, format('cancelada não deveria contar, veio %s', r);

  -- Quem já é aluno não solicita outro professor ([SOLI]-13).
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-000000000011","role":"authenticated"}', true);
  r := public.request_coach('ffffffff-0000-0000-0000-000000000002', null, '11999998888');
  assert r ->> 'error' = 'already_student', format('aluno deveria dar already_student, veio %s', r);

  raise notice 'REQUEST_COACH_LIMIT: ALL PASS';
end $$;

rollback;
