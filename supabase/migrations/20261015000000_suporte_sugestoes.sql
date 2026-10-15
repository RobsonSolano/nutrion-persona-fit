-- =====================================================================
-- Persona Fit — Suporte e sugestões (2026-10-15)
-- Spec: .specs/features/2026-10-15-suporte-sugestoes/
--
-- Qualquer pessoa (comum, aluno, professor) manda uma mensagem de suporte
-- ou sugestão pelo Perfil. O admin lê, responde e muda a situação pelo
-- painel; a resposta aparece no app e chega por push (edge function
-- admin-support-update).
--
-- Escrita do app só pela RPC send_support_message: o papel é gravado a
-- partir do perfil (nunca vem do client) e há limite diário contra spam.
-- =====================================================================

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('comum','aluno','professor')),
  kind text not null check (kind in ('suporte','sugestao')),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'aberta' check (status in ('aberta','respondida','resolvida')),
  reply text check (reply is null or char_length(reply) <= 2000),
  replied_at timestamptz,
  reply_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.support_messages is
  'Suporte e sugestões enviados pelo app. Escrita do app só via send_support_message; resposta só pelo admin.';
comment on column public.support_messages.role is 'Papel de quem enviou, no momento do envio (snapshot do perfil).';
comment on column public.support_messages.reply_seen_at is 'Quando a pessoa abriu a resposta no app (null = não lida).';

create index if not exists support_messages_user_idx on public.support_messages (user_id, created_at desc);
create index if not exists support_messages_status_idx on public.support_messages (status, created_at desc);

drop trigger if exists support_messages_set_updated_at on public.support_messages;
create trigger support_messages_set_updated_at
  before update on public.support_messages
  for each row execute function public.set_updated_at();

alter table public.support_messages enable row level security;

-- O app só LÊ as próprias mensagens; escrita vai pelas RPCs abaixo.
drop policy if exists "support_messages_select_own" on public.support_messages;
create policy "support_messages_select_own" on public.support_messages
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- App
-- ---------------------------------------------------------------------
create or replace function public.send_support_message(p_kind text, p_title text, p_body text)
returns public.support_messages
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_row public.support_messages;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_kind not in ('suporte','sugestao') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'title_too_short' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_body, ''))) < 1 then
    raise exception 'body_empty' using errcode = '22023';
  end if;
  -- Anti-spam: 10 mensagens por dia por pessoa.
  if (select count(*) from public.support_messages
       where user_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'daily_limit' using errcode = '54000';
  end if;

  insert into public.support_messages (user_id, role, kind, title, body)
  values (v_uid, v_role, p_kind, left(trim(p_title), 120), left(trim(p_body), 2000))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.mark_support_reply_seen(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.support_messages
     set reply_seen_at = now()
   where id = p_id and user_id = auth.uid() and reply is not null and reply_seen_at is null;
$$;

revoke all on function public.send_support_message(text, text, text) from public, anon;
grant execute on function public.send_support_message(text, text, text) to authenticated;
revoke all on function public.mark_support_reply_seen(uuid) from public, anon;
grant execute on function public.mark_support_reply_seen(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Painel admin
-- ---------------------------------------------------------------------
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
      select m.*, p.full_name, p.email
        from public.support_messages m
        join public._admin_people(true) p on p.id = m.user_id
       where (p_role is null or m.role = p_role)
         and (p_kind is null or m.kind = p_kind)
         and (p_status is null or m.status = p_status)
         and (p_search is null or p_search = ''
              or m.title ilike '%' || p_search || '%'
              or m.body ilike '%' || p_search || '%'
              or p.full_name ilike '%' || p_search || '%'
              or p.email ilike '%' || p_search || '%')
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

-- Contadores pro dashboard e pro menu.
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
        'professor', count(*) filter (where status = 'aberta' and role = 'professor')),
      'open_by_kind', json_build_object(
        'suporte', count(*) filter (where status = 'aberta' and kind = 'suporte'),
        'sugestao', count(*) filter (where status = 'aberta' and kind = 'sugestao')))
      from public.support_messages
  );
end;
$$;

-- Responder / mudar situação. Chamada pela edge function admin-support-update
-- (que manda o push), mas também funciona direto. Resposta nova zera a leitura.
create or replace function public.admin_support_update(p_id uuid, p_status text, p_reply text default null)
returns public.support_messages
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_row public.support_messages;
begin
  perform public._admin_assert();
  if p_status not in ('aberta','respondida','resolvida') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  update public.support_messages m set
    status = p_status,
    reply = coalesce(nullif(trim(p_reply), ''), m.reply),
    replied_at = case when nullif(trim(p_reply), '') is distinct from null
                       and nullif(trim(p_reply), '') is distinct from m.reply
                      then now() else m.replied_at end,
    reply_seen_at = case when nullif(trim(p_reply), '') is distinct from null
                          and nullif(trim(p_reply), '') is distinct from m.reply
                         then null else m.reply_seen_at end
   where m.id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_support_list(text, text, text, text, int, int)',
    'admin_support_summary()',
    'admin_support_update(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
