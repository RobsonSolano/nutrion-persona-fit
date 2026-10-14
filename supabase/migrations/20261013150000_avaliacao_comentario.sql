-- =====================================================================
-- Avaliação com comentário ([AVAL]-02, -05, -06, -08) — 2026-10-13
--
-- - Comentário opcional (até 500) junto da nota. Só o professor avaliado
--   lê (list_my_coach_ratings) — e o autor, pela RLS "só a própria". Nunca
--   entra na busca nem no perfil público: ali seguem só média e total.
-- - Quem pode avaliar passa a incluir o ALUNO ATUAL (inclusive o cadastrado
--   pelo próprio professor, que nunca passou pela contratação). Regra única
--   em can_rate_coach, usada por rate_coach e pelo perfil público.
-- - rate_coach ganha p_comment com default: o app publicado, que chama com
--   2 argumentos, segue funcionando.
-- =====================================================================

alter table public.coach_ratings
  add column if not exists comment text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_ratings_comment_len_check') then
    alter table public.coach_ratings
      add constraint coach_ratings_comment_len_check
      check (comment is null or char_length(comment) <= 500);
  end if;
end $$;

comment on column public.coach_ratings.comment is
  'Comentário opcional do aluno. Só o professor avaliado lê ([AVAL]-06).';

create or replace function public.can_rate_coach(p_student_id uuid, p_coach_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
           select 1 from public.coach_enrollment_requests
            where student_id = p_student_id and coach_id = p_coach_id
              and status = 'efetuado')
      or exists (
           select 1 from public.profiles
            where id = p_student_id and coach_id = p_coach_id);
$$;

-- Interna: recebe um id de aluno qualquer, então não fica exposta (diria
-- quem é aluno de quem). rate_coach e o perfil público a chamam como dono.
revoke all on function public.can_rate_coach(uuid, uuid) from public, anon, authenticated;

drop function if exists public.rate_coach(uuid, smallint);

create or replace function public.rate_coach(
  p_coach_id uuid,
  p_stars smallint,
  p_comment text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    return json_build_object('ok', false, 'error', 'invalid_stars');
  end if;
  if char_length(coalesce(v_comment, '')) > 500 then
    return json_build_object('ok', false, 'error', 'invalid_comment');
  end if;
  if not public.can_rate_coach(v_uid, p_coach_id) then
    return json_build_object('ok', false, 'error', 'not_eligible');
  end if;

  insert into public.coach_ratings (student_id, coach_id, stars, comment)
  values (v_uid, p_coach_id, p_stars, v_comment)
  on conflict (student_id, coach_id)
  do update set stars = excluded.stars, comment = excluded.comment, updated_at = now();
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.rate_coach(uuid, smallint, text) to authenticated;

-- [AVAL]-08: o professor lê as próprias avaliações, com comentário e o nome
-- do aluno (security definer: ex-aluno já não é legível pela RLS de profiles).
create or replace function public.list_my_coach_ratings()
returns table (
  stars smallint,
  comment text,
  student_name text,
  rated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select r.stars, r.comment, p.full_name, r.updated_at
    from public.coach_ratings r
    left join public.profiles p on p.id = r.student_id
   where r.coach_id = auth.uid()
   order by r.updated_at desc;
$$;

grant execute on function public.list_my_coach_ratings() to authenticated;

-- Perfil público: can_rate pela regra única, e o autor recebe o próprio
-- comentário (pra editar). O resto é igual à versão de 20261013030000.
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
           'my_comment', (select comment from public.coach_ratings
                           where coach_id = c.id and student_id = v_uid),
           'can_rate', public.can_rate_coach(v_uid, c.id),
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
