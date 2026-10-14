-- =====================================================================
-- Teste dos avisos remotos e da config de versão ([AVI]-01..04, -06;
-- [ATU]-05) — 2026-10-13
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start -x vector
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/announcements.test.sql
-- Saída esperada ao final: NOTICE "ANNOUNCEMENTS: ALL PASS".
-- =====================================================================
begin;
set local session_replication_role = replica;

insert into auth.users (id, email) values
  ('a0a0a0a0-0000-0000-0000-000000000001', 'comum@aviso.test'),
  ('a0a0a0a0-0000-0000-0000-000000000002', 'prof@aviso.test');

insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('a0a0a0a0-0000-0000-0000-000000000001', 'comum', null, 9601, 'Comum Aviso'),
  ('a0a0a0a0-0000-0000-0000-000000000002', 'professor', null, 9602, 'Prof Aviso');

insert into public.announcements (id, title, body, audience, starts_at, ends_at, active) values
  -- Visíveis pro comum:
  ('b0b0b0b0-0000-0000-0000-000000000001', 'Pra todos', 'texto', 'todos', now() - interval '2 days', null, true),
  ('b0b0b0b0-0000-0000-0000-000000000002', 'Só comum', 'texto', 'comum', now() - interval '1 day', now() + interval '1 day', true),
  -- Não visíveis pro comum:
  ('b0b0b0b0-0000-0000-0000-000000000003', 'Só professor', 'texto', 'professor', now() - interval '1 day', null, true),
  ('b0b0b0b0-0000-0000-0000-000000000004', 'Desativado', 'texto', 'todos', now() - interval '1 day', null, false),
  ('b0b0b0b0-0000-0000-0000-000000000005', 'Futuro', 'texto', 'todos', now() + interval '1 day', null, true),
  ('b0b0b0b0-0000-0000-0000-000000000006', 'Encerrado', 'texto', 'todos', now() - interval '3 days', now() - interval '1 day', true);

set local session_replication_role = origin;

do $$
declare
  n int;
  primeiro text;
begin
  -- [AVI]-01/-03/-04: o comum vê só os do público e do período, mais antigo primeiro.
  perform set_config('request.jwt.claims',
    '{"sub":"a0a0a0a0-0000-0000-0000-000000000001","role":"authenticated"}', true);
  select count(*) into n from public.my_pending_announcements();
  assert n = 2, format('comum deveria ter 2 avisos, tem %s', n);
  select title into primeiro from public.my_pending_announcements() limit 1;
  assert primeiro = 'Pra todos', format('o mais antigo vem primeiro, veio %s', primeiro);

  -- [AVI]-02: visto não volta (e marcar de novo não quebra).
  perform public.mark_announcement_seen('b0b0b0b0-0000-0000-0000-000000000001');
  perform public.mark_announcement_seen('b0b0b0b0-0000-0000-0000-000000000001');
  select count(*) into n from public.my_pending_announcements();
  assert n = 1, format('depois de ver um, deveria sobrar 1, sobram %s', n);

  -- O professor vê o de todos e o dele; a view do comum não conta pra ele.
  perform set_config('request.jwt.claims',
    '{"sub":"a0a0a0a0-0000-0000-0000-000000000002","role":"authenticated"}', true);
  select count(*) into n from public.my_pending_announcements();
  assert n = 2, format('professor deveria ter 2 avisos, tem %s', n);

  -- [AVI]-06: o app não lê a tabela direto, nem as views alheias, nem escreve aviso.
  set local role authenticated;
  select count(*) into n from public.announcements;
  assert n = 0, format('leitura direta de announcements deveria vir vazia, veio %s', n);
  select count(*) into n from public.announcement_views;
  assert n = 0, format('professor não deveria ver views do comum, viu %s', n);
  reset role;
  -- Com RLS ligado e nenhuma policy de escrita, o app não cria nem edita aviso.
  assert (select relrowsecurity from pg_class where oid = 'public.announcements'::regclass),
    'announcements deveria ter RLS';
  assert not exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'announcements'),
    'announcements não deveria ter policy nenhuma (leitura só pela RPC)';

  -- [ATU]-05: a config de versão é legível deslogado.
  set local role anon;
  select count(*) into n from public.app_config;
  reset role;
  assert n = 1, format('anon deveria ler a linha única do app_config, leu %s', n);

  raise notice 'ANNOUNCEMENTS: ALL PASS';
end $$;

rollback;
