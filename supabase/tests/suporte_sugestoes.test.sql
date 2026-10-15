-- =====================================================================
-- Teste de suporte e sugestões ([SUP]-01..06) — 2026-10-15
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/suporte_sugestoes.test.sql
-- Saída esperada ao final: NOTICE "SUPORTE: ALL PASS".
-- =====================================================================
begin;
set local session_replication_role = replica;

create function public._t_err(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

create function public._t_as(p_uid text)
returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '' else
      format('{"sub":"%s","role":"authenticated"}', p_uid) end, true);
$$;

insert into auth.users (id, email) values
  ('ffffffff-0000-0000-0000-000000000000', 'admin@suporte-teste.local'),
  ('ffffffff-0000-0000-0000-000000000001', 'comum@suporte-teste.local'),
  ('ffffffff-0000-0000-0000-000000000002', 'prof@suporte-teste.local'),
  ('ffffffff-0000-0000-0000-000000000003', 'aluno@suporte-teste.local');
insert into public.admin_users (id, full_name) values ('ffffffff-0000-0000-0000-000000000000', 'Admin');
insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('ffffffff-0000-0000-0000-000000000001', 'comum', null, 9901, 'Comum Suporte'),
  ('ffffffff-0000-0000-0000-000000000002', 'professor', null, 9902, 'Prof Suporte'),
  ('ffffffff-0000-0000-0000-000000000003', 'aluno', 'ffffffff-0000-0000-0000-000000000002', 9903, 'Aluno Suporte');

set local session_replication_role = origin;

do $$
declare
  r public.support_messages;
  j json;
  u json;
  n int;
  v_id uuid;
begin
  -- [SUP]-01: envio grava o papel do perfil (não vem do client).
  perform public._t_as('ffffffff-0000-0000-0000-000000000002');
  r := public.send_support_message('sugestao', 'Exportar treino em PDF', 'Seria ótimo mandar o treino em PDF pro aluno.');
  assert r.role = 'professor' and r.kind = 'sugestao' and r.status = 'aberta', 'professor envia sugestão';
  perform public._t_as('ffffffff-0000-0000-0000-000000000003');
  r := public.send_support_message('suporte', 'Não consigo ver meu treino', 'A tela fica em branco.');
  v_id := r.id;
  assert r.role = 'aluno', 'aluno envia suporte';
  raise notice 'OK 1: envio com papel do perfil';

  -- [SUP]-02: validações e anônimo.
  assert public._t_err($q$select public.send_support_message('outro', 'Título ok', 'texto')$q$) = 'invalid_kind', 'tipo inválido';
  assert public._t_err($q$select public.send_support_message('suporte', 'oi', 'texto')$q$) = 'title_too_short', 'título curto';
  assert public._t_err($q$select public.send_support_message('suporte', 'Título ok', '   ')$q$) = 'body_empty', 'descrição vazia';
  perform public._t_as(null);
  assert public._t_err($q$select public.send_support_message('suporte', 'Título ok', 'texto')$q$) = 'unauthorized', 'anônimo não envia';
  raise notice 'OK 2: validações';

  -- [SUP]-03: cada um lê só as próprias (RLS).
  perform public._t_as('ffffffff-0000-0000-0000-000000000003');
  set local role authenticated;
  select count(*) into n from public.support_messages where user_id::text like 'ffffffff%';
  assert n = 1, format('aluno vê só a dele, viu %s', n);
  reset role;
  raise notice 'OK 3: RLS';

  -- [SUP]-04: limite diário de 10.
  perform public._t_as('ffffffff-0000-0000-0000-000000000001');
  for n in 1..10 loop
    perform public.send_support_message('suporte', format('Mensagem %s', n), 'texto');
  end loop;
  assert public._t_err($q$select public.send_support_message('suporte', 'Mais uma', 'texto')$q$) = 'daily_limit', 'limite diário';
  raise notice 'OK 4: limite diário';

  -- [SUP]-05: painel — só admin, lista com filtros e contadores.
  perform public._t_as('ffffffff-0000-0000-0000-000000000001');
  assert public._t_err('select public.admin_support_summary()') = 'forbidden', 'não-admin não vê o painel';
  perform public._t_as('ffffffff-0000-0000-0000-000000000000');
  j := public.admin_support_list(p_role => 'professor', p_search => 'suporte-teste');
  assert (j ->> 'total')::int = 1 and j #>> '{items,0,kind}' = 'sugestao', 'filtro por papel';
  j := public.admin_support_list(p_role => 'comum', p_search => 'suporte-teste');
  assert (j ->> 'total')::int = 10, 'dez do comum';
  j := public.admin_support_summary();
  assert (j #>> '{open_by_role,aluno}')::int >= 1, 'aberta do aluno no contador';
  assert public._t_err($q$select public.admin_support_update('ffffffff-0000-0000-0000-0000000000aa', 'resolvida')$q$)
    = 'not_found', 'mensagem inexistente';
  raise notice 'OK 5: painel';

  -- [SUP]-06: resposta aparece pra pessoa e conta como não lida até abrir.
  u := public.admin_support_update(v_id, 'respondida', 'Atualize o app que resolve.');
  assert (u ->> 'reply_changed')::boolean, 'resposta nova avisa';
  assert u #>> '{message,status}' = 'respondida' and u #>> '{message,reply}' = 'Atualize o app que resolve.'
         and u #>> '{message,replied_at}' is not null and u #>> '{message,reply_seen_at}' is null,
    'resposta gravada e não lida';
  -- mudar só a situação mantém a resposta e não avisa
  u := public.admin_support_update(v_id, 'resolvida');
  assert u #>> '{message,status}' = 'resolvida' and u #>> '{message,reply}' = 'Atualize o app que resolve.'
         and not (u ->> 'reply_changed')::boolean, 'situação muda sem apagar a resposta nem avisar';
  -- mandar a mesma resposta de novo não avisa
  u := public.admin_support_update(v_id, 'respondida', '  Atualize o app que resolve.  ');
  assert not (u ->> 'reply_changed')::boolean, 'mesma resposta não avisa de novo';
  perform public._t_as('ffffffff-0000-0000-0000-000000000003');
  perform public.mark_support_reply_seen(v_id);
  assert (select reply_seen_at is not null from public.support_messages where id = v_id), 'aluno leu a resposta';
  -- outra pessoa não marca como lida
  perform public._t_as('ffffffff-0000-0000-0000-000000000000');
  u := public.admin_support_update(v_id, 'respondida', 'Complemento: limpe o cache.');
  assert (u ->> 'reply_changed')::boolean and u #>> '{message,reply_seen_at}' is null,
    'resposta nova volta a ser não lida';
  perform public._t_as('ffffffff-0000-0000-0000-000000000002');
  perform public.mark_support_reply_seen(v_id);
  assert (select reply_seen_at is null from public.support_messages where id = v_id), 'só o dono marca como lida';
  assert public._t_err($q$select public.admin_support_update('ffffffff-0000-0000-0000-000000000003', 'resolvida')$q$)
    = 'forbidden', 'não-admin não responde';
  raise notice 'OK 6: resposta';

  raise notice 'SUPORTE: ALL PASS';
end;
$$;

rollback;
