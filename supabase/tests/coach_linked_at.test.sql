-- =====================================================================
-- Teste do "aluno desde" (profiles.coach_linked_at) — 2026-10-13
-- Cobre o trigger que carimba a data sempre que o coach_id muda: vínculo,
-- troca de professor, desvínculo, e que nada além disso mexe na data.
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start -x vector
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/coach_linked_at.test.sql
-- Saída esperada ao final: NOTICE "COACH_LINKED_AT: ALL PASS".
--
-- O seed roda com session_replication_role = replica (desliga os triggers
-- de criação de perfil); os cenários voltam pra origin, senão o trigger
-- testado também não dispararia. As linhas de auth.users existem porque o
-- Postgres reconfere a FK num UPDATE de linha inserida na mesma transação.
-- =====================================================================
begin;
set local session_replication_role = replica;

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001','prof1@linked.test'),
  ('cccccccc-0000-0000-0000-000000000002','prof2@linked.test'),
  ('cccccccc-0000-0000-0000-000000000010','vira@linked.test'),
  ('cccccccc-0000-0000-0000-000000000011','antigo@linked.test');

insert into public.profiles (id, role, coach_id, user_number, full_name, coach_linked_at) values
  ('cccccccc-0000-0000-0000-000000000001','professor', null, 9201, 'Prof Um',   null),
  ('cccccccc-0000-0000-0000-000000000002','professor', null, 9202, 'Prof Dois', null),
  ('cccccccc-0000-0000-0000-000000000010','comum',     null, 9210, 'Vai Virar Aluno', null),
  ('cccccccc-0000-0000-0000-000000000011','aluno','cccccccc-0000-0000-0000-000000000001', 9211, 'Aluno Antigo',
     '2026-01-15 10:00:00-03');

set local session_replication_role = origin;

do $$
declare
  v timestamptz;
begin
  -- Vínculo: comum → aluno carimba a data.
  update public.profiles
     set role = 'aluno', coach_id = 'cccccccc-0000-0000-0000-000000000001'
   where id = 'cccccccc-0000-0000-0000-000000000010';
  select coach_linked_at into v from public.profiles where id = 'cccccccc-0000-0000-0000-000000000010';
  assert v = now(), format('vínculo deveria carimbar now(), veio %s', v);

  -- Mudança em outro campo não mexe na data.
  update public.profiles set full_name = 'Aluno Antigo Renomeado'
   where id = 'cccccccc-0000-0000-0000-000000000011';
  select coach_linked_at into v from public.profiles where id = 'cccccccc-0000-0000-0000-000000000011';
  assert v = '2026-01-15 10:00:00-03', format('editar o nome não deveria mudar a data, veio %s', v);

  -- Escrever a coluna direto, sem trocar de professor, é ignorado.
  update public.profiles set coach_linked_at = '2020-01-01'
   where id = 'cccccccc-0000-0000-0000-000000000011';
  select coach_linked_at into v from public.profiles where id = 'cccccccc-0000-0000-0000-000000000011';
  assert v = '2026-01-15 10:00:00-03', format('data não pode ser forjada, veio %s', v);

  -- Troca de professor recomeça a contagem.
  update public.profiles set coach_id = 'cccccccc-0000-0000-0000-000000000002'
   where id = 'cccccccc-0000-0000-0000-000000000011';
  select coach_linked_at into v from public.profiles where id = 'cccccccc-0000-0000-0000-000000000011';
  assert v = now(), format('trocar de professor deveria carimbar now(), veio %s', v);

  -- Desvínculo limpa a data.
  update public.profiles set role = 'comum', coach_id = null
   where id = 'cccccccc-0000-0000-0000-000000000011';
  select coach_linked_at into v from public.profiles where id = 'cccccccc-0000-0000-0000-000000000011';
  assert v is null, format('desvínculo deveria limpar a data, veio %s', v);

  raise notice 'COACH_LINKED_AT: ALL PASS';
end $$;

rollback;
