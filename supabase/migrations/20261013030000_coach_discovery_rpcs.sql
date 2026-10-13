-- =====================================================================
-- Persona Fit — RPCs de descoberta e contratação
--
-- Por que RPC e não SELECT direto: a RLS de profiles (profiles_select_own)
-- só deixa o usuário ler a SI MESMO e ao próprio coach. Afrouxar isso pra
-- viabilizar a busca abriria o perfil inteiro de todo mundo. Estas funções
-- são security definer e devolvem SÓ colunas públicas.
--
-- Cria:
--   is_coach_discoverable(uuid, uuid) — regra única de elegibilidade
--   search_coaches(...)               — busca com filtros
--   get_coach_public_profile(uuid)    — perfil público + minha avaliação
--   request_coach(uuid, text)         — abre solicitação
--   cancel_my_enrollment_request(uuid)
--   mark_enrollment_seen(uuid)
--   rate_coach(uuid, smallint)
--
-- Ver spec.md [DESC]-03..06, [SOLI]-03,04,09,10, [AVAL]-02,03,04.
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Elegibilidade — fonte única da regra ([DESC]-03)
--    is_public E premium E CREF válido E não bloqueou o solicitante.
-- ---------------------------------------------------------------------
create or replace function public.is_coach_discoverable(
  p_coach_id uuid,
  p_viewer_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_ok boolean;
begin
  select c.is_public
         and public.is_valid_credential(c.cref)
         and c.state_uf is not null
         and c.city is not null
         and c.service_mode is not null
         and array_length(c.specialties, 1) >= 1
         and p.role = 'professor'
         and (public._resolve_entitlement(c.id) ->> 'tier') = 'premium'
    into v_ok
    from public.coaches c
    join public.profiles p on p.id = c.id
   where c.id = p_coach_id;

  if not coalesce(v_ok, false) then
    return false;
  end if;

  if p_viewer_id is not null and exists (
    select 1 from public.coach_blocks
     where coach_id = p_coach_id and user_id = p_viewer_id
  ) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.is_coach_discoverable(uuid, uuid) is
  'Regra única de quem aparece na busca: opt-in + premium + CREF válido + perfil completo + não bloqueou o viewer.';

-- ---------------------------------------------------------------------
-- 2. search_coaches — lista pública com filtros ([DESC]-04, [DESC]-05)
-- ---------------------------------------------------------------------
create or replace function public.search_coaches(
  p_uf text default null,
  p_city text default null,
  p_specialties text[] default null,
  p_service_mode text default null,
  p_query text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  coach_id uuid,
  full_name text,
  avatar_url text,
  bio text,
  state_uf text,
  city text,
  specialties text[],
  service_mode text,
  rating_avg numeric,
  rating_count int
)
language sql
security definer
set search_path = public
stable
as $$
  select c.id,
         p.full_name,
         p.avatar_url,
         c.bio,
         c.state_uf,
         c.city,
         c.specialties,
         c.service_mode,
         round(coalesce(r.avg_stars, 0)::numeric, 1),
         coalesce(r.total, 0)::int
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join lateral (
      select avg(stars)::numeric as avg_stars, count(*)::int as total
        from public.coach_ratings where coach_id = c.id
    ) r on true
   where public.is_coach_discoverable(c.id, auth.uid())
     and (p_uf is null or c.state_uf = upper(p_uf))
     and (p_city is null or c.city = p_city)
     and (p_service_mode is null or c.service_mode = p_service_mode
          or (p_service_mode in ('online','presencial') and c.service_mode = 'hibrido'))
     and (p_specialties is null or c.specialties && p_specialties)
     and (p_query is null or p.full_name ilike '%' || p_query || '%')
   order by coalesce(r.avg_stars, 0) desc, coalesce(r.total, 0) desc, p.full_name asc
   limit least(coalesce(p_limit, 30), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_coaches(text, text, text[], text, text, int, int) is
  'Busca pública de professores. Só colunas públicas — a RLS de profiles NÃO é afrouxada. Híbrido aparece nos filtros online e presencial.';

-- ---------------------------------------------------------------------
-- 3. get_coach_public_profile ([DESC]-06)
-- ---------------------------------------------------------------------
create or replace function public.get_coach_public_profile(p_coach_id uuid)
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row json;
  v_uid uuid := auth.uid();
begin
  if not public.is_coach_discoverable(p_coach_id, v_uid) then
    return null;
  end if;

  select json_build_object(
           'coach_id', c.id,
           'full_name', p.full_name,
           'avatar_url', p.avatar_url,
           'bio', c.bio,
           'cref', c.cref,
           'state_uf', c.state_uf,
           'city', c.city,
           'specialties', c.specialties,
           'service_mode', c.service_mode,
           'rating_avg', round(coalesce(r.avg_stars, 0)::numeric, 1),
           'rating_count', coalesce(r.total, 0),
           'my_rating', (select stars from public.coach_ratings
                          where coach_id = c.id and student_id = v_uid),
           'can_rate', exists (select 1 from public.coach_enrollment_requests
                                where coach_id = c.id and student_id = v_uid
                                  and status = 'efetuado'),
           'open_request_status', (select status from public.coach_enrollment_requests
                                    where coach_id = c.id and student_id = v_uid
                                      and status in ('pendente','andamento')
                                    limit 1)
         )
    into v_row
    from public.coaches c
    join public.profiles p on p.id = c.id
    left join lateral (
      select avg(stars)::numeric as avg_stars, count(*)::int as total
        from public.coach_ratings where coach_id = c.id
    ) r on true
   where c.id = p_coach_id;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. request_coach ([SOLI]-03, [SOLI]-04)
-- ---------------------------------------------------------------------
create or replace function public.request_coach(
  p_coach_id uuid,
  p_message text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_id uuid;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select role into v_role from public.profiles where id = v_uid;

  -- Só usuário comum contrata. Aluno precisa ser desvinculado antes, e
  -- professor não vira aluno de ninguém. Regra no servidor porque a UI
  -- não é a fronteira de segurança.
  if v_role = 'aluno' then
    return json_build_object('ok', false, 'error', 'already_student');
  end if;
  if v_role <> 'comum' then
    return json_build_object('ok', false, 'error', 'invalid_role');
  end if;

  if not public.is_coach_discoverable(p_coach_id, v_uid) then
    return json_build_object('ok', false, 'error', 'coach_unavailable');
  end if;

  if exists (
    select 1 from public.coach_enrollment_requests
     where student_id = v_uid and coach_id = p_coach_id
       and status in ('pendente','andamento')
  ) then
    return json_build_object('ok', false, 'error', 'already_requested');
  end if;

  insert into public.coach_enrollment_requests (student_id, coach_id, message)
  values (v_uid, p_coach_id, nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Ações do aluno sobre a própria solicitação ([SOLI]-09, [SOLI]-10)
-- ---------------------------------------------------------------------
create or replace function public.cancel_my_enrollment_request(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  update public.coach_enrollment_requests
     set status = 'cancelado',
         responded_at = now(),
         seen_by_student_at = now(),
         cancel_reason = 'Cancelada pelo próprio usuário.'
   where id = p_id
     and student_id = v_uid
     and status = 'pendente';
  get diagnostics v_updated = row_count;

  -- Só 'pendente': se o professor já está tratando (andamento), cancelar
  -- por baixo dele deixaria a conversa sem lastro na fila.
  if v_updated = 0 then
    return json_build_object('ok', false, 'error', 'not_cancelable');
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.mark_enrollment_seen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coach_enrollment_requests
     set seen_by_student_at = now()
   where id = p_id and student_id = auth.uid() and seen_by_student_at is null;
$$;

-- ---------------------------------------------------------------------
-- 6. rate_coach ([AVAL]-02, [AVAL]-03)
-- ---------------------------------------------------------------------
create or replace function public.rate_coach(p_coach_id uuid, p_stars smallint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    return json_build_object('ok', false, 'error', 'invalid_stars');
  end if;

  -- Só quem chegou a ser aluno avalia. Vale pra EX-aluno também: o
  -- histórico da contratação não some quando o vínculo é desfeito.
  if not exists (
    select 1 from public.coach_enrollment_requests
     where student_id = v_uid and coach_id = p_coach_id and status = 'efetuado'
  ) then
    return json_build_object('ok', false, 'error', 'not_eligible');
  end if;

  insert into public.coach_ratings (student_id, coach_id, stars)
  values (v_uid, p_coach_id, p_stars)
  on conflict (student_id, coach_id)
  do update set stars = excluded.stars, updated_at = now();

  return json_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Grants — só o que o cliente chama
-- ---------------------------------------------------------------------
revoke all on function public.is_coach_discoverable(uuid, uuid) from public;
grant execute on function public.search_coaches(text, text, text[], text, text, int, int) to authenticated;
grant execute on function public.get_coach_public_profile(uuid) to authenticated;
grant execute on function public.request_coach(uuid, text) to authenticated;
grant execute on function public.cancel_my_enrollment_request(uuid) to authenticated;
grant execute on function public.mark_enrollment_seen(uuid) to authenticated;
grant execute on function public.rate_coach(uuid, smallint) to authenticated;
