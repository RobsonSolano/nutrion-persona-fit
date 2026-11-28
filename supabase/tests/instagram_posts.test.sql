-- =====================================================================
-- Teste da fila do Instagram ([IG]-01) — 2026-11-28
-- Cobre: padrão pending, checks de tipo/slot/quantidade/legenda, um por dia
-- (horário de Brasília) e slot, e RLS bloqueando quem não é service role.
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start -x vector
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/instagram_posts.test.sql
-- Saída esperada ao final: NOTICE "INSTAGRAM_POSTS: ALL PASS".
-- =====================================================================
begin;

do $$
declare
  v_status text;
  v_count int;
  v_failed boolean;
begin
  -- IG-01: linha nova começa pending
  insert into public.instagram_posts (scheduled_for, slot, kind, media_paths, caption)
  values ('2026-11-29 12:00-03', 'feed', 'image', array['a/1.jpg'], 'Legenda')
  returning status into v_status;
  assert v_status = 'pending', 'IG01: linha nova deveria começar pending';

  -- IG-01: carrossel com 1 imagem é recusado
  begin
    insert into public.instagram_posts (scheduled_for, slot, kind, media_paths)
    values ('2026-11-30 12:00-03', 'feed', 'carousel', array['a/1.jpg']);
    v_failed := false;
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, 'IG01: carrossel com 1 imagem deveria ser recusado';

  -- IG-01: carrossel com 11 imagens é recusado
  begin
    insert into public.instagram_posts (scheduled_for, slot, kind, media_paths)
    values ('2026-11-30 12:00-03', 'feed', 'carousel', array_fill('a/x.jpg'::text, array[11]));
    v_failed := false;
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, 'IG01: carrossel com 11 imagens deveria ser recusado';

  -- IG-01: story com legenda é recusado
  begin
    insert into public.instagram_posts (scheduled_for, slot, kind, media_paths, caption)
    values ('2026-11-29 10:00-03', 'story-1', 'story', array['s/1.jpg'], 'não pode');
    v_failed := false;
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, 'IG01: story com legenda deveria ser recusado';

  -- IG-01: story no slot de feed é recusado
  begin
    insert into public.instagram_posts (scheduled_for, slot, kind, media_paths)
    values ('2026-11-29 12:00-03', 'feed', 'story', array['s/1.jpg']);
    v_failed := false;
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, 'IG01: story no slot de feed deveria ser recusado';

  -- IG-01: segunda linha no mesmo dia (BRT) e slot é recusada, mesmo em outro horário
  begin
    insert into public.instagram_posts (scheduled_for, slot, kind, media_paths)
    values ('2026-11-29 20:30-03', 'feed', 'image', array['a/2.jpg']);
    v_failed := false;
  exception when unique_violation then v_failed := true;
  end;
  assert v_failed, 'IG01: duas linhas no mesmo dia e slot deveriam ser recusadas';

  -- IG-01: 23h30 de Brasília é o mesmo dia, mesmo já sendo o dia seguinte em UTC
  begin
    insert into public.instagram_posts (scheduled_for, slot, kind, media_paths)
    values ('2026-11-29 23:30-03', 'feed', 'image', array['a/3.jpg']);
    v_failed := false;
  exception when unique_violation then v_failed := true;
  end;
  assert v_failed, 'IG01: o dia da fila deveria ser o de Brasília, não o de UTC';

  -- IG-01: stories 1 e 2 no mesmo dia convivem com o feed
  insert into public.instagram_posts (scheduled_for, slot, kind, media_paths) values
    ('2026-11-29 10:00-03', 'story-1', 'story', array['s/1.jpg']),
    ('2026-11-29 19:00-03', 'story-2', 'story', array['s/2.jpg']);
  select count(*) into v_count from public.instagram_posts where post_date = '2026-11-29';
  assert v_count = 3, 'IG01: o dia deveria ter feed + 2 stories';
end $$;

-- IG-01: RLS sem policies bloqueia anon e authenticated
set local role authenticated;
do $$
declare v_count int;
begin
  select count(*) into v_count from public.instagram_posts;
  assert v_count = 0, 'IG01: authenticated não deveria enxergar a fila';
end $$;
reset role;

do $$ begin raise notice 'INSTAGRAM_POSTS: ALL PASS'; end $$;
rollback;
