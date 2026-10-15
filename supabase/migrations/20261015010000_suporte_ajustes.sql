-- =====================================================================
-- Persona Fit — Suporte: ajustes do /simplify (2026-10-15)
-- Spec: .specs/features/2026-10-15-suporte-sugestoes/
--
-- 1. admin_support_update diz se a resposta mudou (reply_changed). A edge
--    function usa isso pra decidir o push — antes ela relia a mensagem
--    antes da RPC (consulta a mais, fora da transação) e comparava.
-- 2. admin_support_list junta direto com profiles/auth.users em vez de
--    montar a base inteira de pessoas a cada chamada.
-- 3. admin_support_summary perde open_by_kind (ninguém lia).
-- =====================================================================

drop function if exists public.admin_support_update(uuid, text, text);
create function public.admin_support_update(p_id uuid, p_status text, p_reply text default null)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_reply text := nullif(trim(p_reply), '');
  v_old text;
  v_changed boolean;
  v_row public.support_messages;
begin
  perform public._admin_assert();
  if p_status not in ('aberta','respondida','resolvida') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select reply into v_old from public.support_messages where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Resposta nova (ou diferente) = avisa a pessoa e volta a ser "não lida".
  v_changed := v_reply is not null and v_reply is distinct from v_old;

  update public.support_messages set
    status = p_status,
    reply = coalesce(v_reply, reply),
    replied_at = case when v_changed then now() else replied_at end,
    reply_seen_at = case when v_changed then null else reply_seen_at end
   where id = p_id
  returning * into v_row;

  return json_build_object('message', row_to_json(v_row), 'reply_changed', v_changed);
end;
$$;

create or replace function public.admin_support_list(
  p_role text default null,
  p_kind text default null,
  p_status text default null,
  p_search text default null,
  p_limit int default 30,
  p_offset int default 0)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();
  return (
    with f as (
      select m.*, p.full_name, u.email::text as email
        from public.support_messages m
        join public.profiles p on p.id = m.user_id
        join auth.users u on u.id = m.user_id
       where (p_role is null or m.role = p_role)
         and (p_kind is null or m.kind = p_kind)
         and (p_status is null or m.status = p_status)
         and (p_search is null or p_search = ''
              or m.title ilike '%' || p_search || '%'
              or m.body ilike '%' || p_search || '%'
              or p.full_name ilike '%' || p_search || '%'
              or u.email ilike '%' || p_search || '%')
    )
    select json_build_object(
      'total', (select count(*) from f),
      'items', coalesce((select json_agg(row_to_json(x)) from (
                 select * from f
                  order by (status = 'aberta') desc, created_at desc
                  limit least(greatest(coalesce(p_limit, 30), 1), 100)
                 offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::json)
    )
  );
end;
$$;

create or replace function public.admin_support_summary()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._admin_assert();
  return (
    select json_build_object(
      'open', count(*) filter (where status = 'aberta'),
      'answered', count(*) filter (where status = 'respondida'),
      'resolved', count(*) filter (where status = 'resolvida'),
      'open_by_role', json_build_object(
        'comum', count(*) filter (where status = 'aberta' and role = 'comum'),
        'aluno', count(*) filter (where status = 'aberta' and role = 'aluno'),
        'professor', count(*) filter (where status = 'aberta' and role = 'professor')))
      from public.support_messages
  );
end;
$$;

revoke all on function public.admin_support_update(uuid, text, text) from public, anon;
grant execute on function public.admin_support_update(uuid, text, text) to authenticated;
