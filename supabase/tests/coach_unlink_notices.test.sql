-- =====================================================================
-- Teste do aviso de desvínculo (coach_unlink_notices) — 2026-10-13
-- Cobre RLS (o aluno só vê os próprios avisos, ninguém insere pelo app)
-- e a RPC que marca como visto (só o dono, só uma vez).
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start -x vector
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/coach_unlink_notices.test.sql
-- Saída esperada ao final: NOTICE "COACH_UNLINK_NOTICES: ALL PASS".
-- =====================================================================
begin;
set local session_replication_role = replica;

insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('dddddddd-0000-0000-0000-000000000001','professor', null, 9301, 'Prof Que Desvinculou'),
  ('dddddddd-0000-0000-0000-000000000010','comum',     null, 9310, 'Ex Aluno'),
  ('dddddddd-0000-0000-0000-000000000011','comum',     null, 9311, 'Outro Usuario');

insert into public.coach_unlink_notices (id, student_id, coach_id, coach_name) values
  ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000010',
   'dddddddd-0000-0000-0000-000000000001','Prof Que Desvinculou');

set local session_replication_role = origin;

do $$
declare
  n int;
  seen timestamptz;
begin
  -- O ex-aluno enxerga o próprio aviso.
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000010","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.coach_unlink_notices;
  assert n = 1, format('ex-aluno deveria ver 1 aviso, viu %s', n);

  -- Ninguém insere aviso pelo app (só a edge function, com service role).
  begin
    insert into public.coach_unlink_notices (student_id, coach_name)
    values ('dddddddd-0000-0000-0000-000000000010', 'forjado');
    assert false, 'insert pelo app deveria ser barrado';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- Outro usuário não vê e não marca o aviso alheio.
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000011","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.coach_unlink_notices;
  assert n = 0, format('outro usuário não deveria ver aviso alheio, viu %s', n);
  perform public.mark_unlink_notice_seen('eeeeeeee-0000-0000-0000-000000000001');
  reset role;
  select seen_by_student_at into seen from public.coach_unlink_notices
   where id = 'eeeeeeee-0000-0000-0000-000000000001';
  assert seen is null, 'outro usuário não pode marcar o aviso como visto';

  -- O dono marca como visto.
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000010","role":"authenticated"}', true);
  set local role authenticated;
  perform public.mark_unlink_notice_seen('eeeeeeee-0000-0000-0000-000000000001');
  reset role;
  select seen_by_student_at into seen from public.coach_unlink_notices
   where id = 'eeeeeeee-0000-0000-0000-000000000001';
  assert seen is not null, 'o dono deveria conseguir marcar como visto';

  -- [TRAN]-11: saída feita pelo aluno vira aviso pro PROFESSOR, com motivo.
  insert into public.coach_unlink_notices
    (id, student_id, coach_id, coach_name, initiated_by, reason, seen_by_student_at)
  values ('eeeeeeee-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000010',
          'dddddddd-0000-0000-0000-000000000001', 'Prof Que Desvinculou', 'student',
          'Mudei de cidade e vou treinar com alguém daqui.', now());

  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.coach_unlink_notices
   where coach_id = 'dddddddd-0000-0000-0000-000000000001'
     and initiated_by = 'student' and reason is not null and seen_by_coach_at is null;
  assert n = 1, format('professor deveria ver a saída com motivo, viu %s', n);
  perform public.mark_unlink_notice_seen('eeeeeeee-0000-0000-0000-000000000002');
  reset role;
  select seen_by_coach_at into seen from public.coach_unlink_notices
   where id = 'eeeeeeee-0000-0000-0000-000000000002';
  assert seen is not null, 'professor deveria marcar a saída como vista';

  -- Motivo tem teto (500) — barrado no banco, não só na tela.
  begin
    insert into public.coach_unlink_notices (student_id, coach_id, initiated_by, reason)
    values ('dddddddd-0000-0000-0000-000000000010', 'dddddddd-0000-0000-0000-000000000001',
            'student', repeat('x', 501));
    assert false, 'motivo com 501 caracteres deveria ser barrado';
  exception when check_violation then
    null;
  end;

  -- O desvínculo atômico só roda via service_role (edge functions): um
  -- usuário logado chamando direto seria trocar role/coach_id de alguém.
  -- (Checado pelo catálogo: capturar o erro de permissão trocando de role
  -- dentro do bloco derruba o Postgres local com segfault.)
  assert not has_function_privilege('authenticated',
    'public.unlink_coach_student(uuid, uuid, text, text, text, text)', 'execute'),
    'authenticated não deveria executar unlink_coach_student';
  assert not has_function_privilege('anon',
    'public.unlink_coach_student(uuid, uuid, text, text, text, text)', 'execute'),
    'anon não deveria executar unlink_coach_student';
  assert has_function_privilege('service_role',
    'public.unlink_coach_student(uuid, uuid, text, text, text, text)', 'execute'),
    'service_role deveria executar unlink_coach_student';

  raise notice 'COACH_UNLINK_NOTICES: ALL PASS';
end $$;

rollback;
