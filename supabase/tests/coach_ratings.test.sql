-- =====================================================================
-- Teste das avaliações com comentário ([AVAL]-02, -05, -06, -08) — 2026-10-13
-- Cobre: quem pode avaliar (aluno atual, mesmo cadastrado pelo professor;
-- ex-aluno da contratação), comentário opcional e limitado, reavaliação
-- sobrescreve, e o comentário só chega ao professor avaliado.
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start -x vector
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/coach_ratings.test.sql
-- Saída esperada ao final: NOTICE "COACH_RATINGS: ALL PASS".
-- =====================================================================
begin;
set local session_replication_role = replica;

insert into auth.users (id, email) values
  ('abababab-0000-0000-0000-000000000001', 'prof@rating.test'),
  ('abababab-0000-0000-0000-000000000002', 'outroprof@rating.test'),
  ('abababab-0000-0000-0000-000000000010', 'atual@rating.test'),
  ('abababab-0000-0000-0000-000000000011', 'estranho@rating.test'),
  ('abababab-0000-0000-0000-000000000012', 'exaluno@rating.test');

insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('abababab-0000-0000-0000-000000000001', 'professor', null, 9501, 'Prof Avaliado'),
  ('abababab-0000-0000-0000-000000000002', 'professor', null, 9502, 'Outro Prof'),
  -- Cadastrado pelo professor: nunca passou pela contratação.
  ('abababab-0000-0000-0000-000000000010', 'aluno', 'abababab-0000-0000-0000-000000000001', 9510, 'Aluno Atual'),
  ('abababab-0000-0000-0000-000000000011', 'comum', null, 9511, 'Sem Vinculo'),
  ('abababab-0000-0000-0000-000000000012', 'comum', null, 9512, 'Ex Aluno');

insert into public.coach_enrollment_requests (student_id, coach_id, status, contact_phone) values
  ('abababab-0000-0000-0000-000000000012', 'abababab-0000-0000-0000-000000000001', 'efetuado', '11999998888');

set local session_replication_role = origin;

do $$
declare
  r json;
  n int;
  v_comment text;
  v_stars smallint;
begin
  -- [AVAL]-02: aluno atual avalia, mesmo sem ter passado pela contratação.
  perform set_config('request.jwt.claims',
    '{"sub":"abababab-0000-0000-0000-000000000010","role":"authenticated"}', true);
  r := public.rate_coach('abababab-0000-0000-0000-000000000001', 5::smallint, '  Treino muito bem montado.  ');
  assert (r ->> 'ok')::boolean, format('aluno atual deveria avaliar, veio %s', r);
  select stars, comment into v_stars, v_comment from public.coach_ratings
   where student_id = 'abababab-0000-0000-0000-000000000010';
  assert v_stars = 5 and v_comment = 'Treino muito bem montado.',
    format('nota/comentário errados: %s / %s', v_stars, v_comment);

  -- [AVAL]-03: reavaliar sobrescreve; comentário em branco vira null.
  r := public.rate_coach('abababab-0000-0000-0000-000000000001', 3::smallint, '   ');
  select stars, comment into v_stars, v_comment from public.coach_ratings
   where student_id = 'abababab-0000-0000-0000-000000000010';
  assert v_stars = 3 and v_comment is null,
    format('reavaliação deveria sobrescrever e limpar: %s / %s', v_stars, v_comment);

  -- Comentário com mais de 500 caracteres é recusado.
  r := public.rate_coach('abababab-0000-0000-0000-000000000001', 4::smallint, repeat('x', 501));
  assert r ->> 'error' = 'invalid_comment', format('501 caracteres deveria falhar, veio %s', r);

  -- Não avalia professor de quem nunca foi aluno.
  r := public.rate_coach('abababab-0000-0000-0000-000000000002', 4::smallint, null);
  assert r ->> 'error' = 'not_eligible', format('outro professor deveria dar not_eligible, veio %s', r);

  -- Quem nunca teve vínculo não avalia.
  perform set_config('request.jwt.claims',
    '{"sub":"abababab-0000-0000-0000-000000000011","role":"authenticated"}', true);
  r := public.rate_coach('abababab-0000-0000-0000-000000000001', 1::smallint, 'odeio');
  assert r ->> 'error' = 'not_eligible', format('sem vínculo deveria dar not_eligible, veio %s', r);

  -- Ex-aluno da contratação avalia (sem comentário: a 2-arg do app antigo).
  perform set_config('request.jwt.claims',
    '{"sub":"abababab-0000-0000-0000-000000000012","role":"authenticated"}', true);
  r := public.rate_coach('abababab-0000-0000-0000-000000000001', 4::smallint);
  assert (r ->> 'ok')::boolean, format('ex-aluno deveria avaliar, veio %s', r);
  r := public.rate_coach('abababab-0000-0000-0000-000000000001', 4::smallint, 'Saí por mudança, mas recomendo.');

  -- [AVAL]-06/-08: o professor lê as avaliações dele, com comentário e nome.
  perform set_config('request.jwt.claims',
    '{"sub":"abababab-0000-0000-0000-000000000001","role":"authenticated"}', true);
  select count(*) into n from public.list_my_coach_ratings();
  assert n = 2, format('professor deveria ver 2 avaliações, viu %s', n);
  select comment into v_comment from public.list_my_coach_ratings()
   where student_name = 'Ex Aluno';
  assert v_comment = 'Saí por mudança, mas recomendo.', format('comentário do ex-aluno: %s', v_comment);

  -- Outro professor não vê as avaliações alheias.
  perform set_config('request.jwt.claims',
    '{"sub":"abababab-0000-0000-0000-000000000002","role":"authenticated"}', true);
  select count(*) into n from public.list_my_coach_ratings();
  assert n = 0, format('outro professor não deveria ver nada, viu %s', n);

  -- Um usuário qualquer não lê a tabela (RLS: só a própria avaliação).
  perform set_config('request.jwt.claims',
    '{"sub":"abababab-0000-0000-0000-000000000011","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.coach_ratings;
  reset role;
  assert n = 0, format('usuário sem avaliação não deveria ler nenhuma, leu %s', n);

  raise notice 'COACH_RATINGS: ALL PASS';
end $$;

rollback;
