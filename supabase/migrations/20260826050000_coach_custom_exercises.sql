-- =====================================================================
-- Persona Fit — Exercícios criados pelo professor (Exclusivo / Público)
--
-- Adiciona dono + visibilidade em public.exercises, troca a policy de
-- leitura global, cria policies de escrita restritas ao dono, torna
-- requires_lower_limbs fail-safe e cria o bucket exercise-photos.
--
-- Idempotente — pode rodar múltiplas vezes.
-- Ver docs/superpowers/specs/2026-07-29-cadastro-exercicio-professor-design.md
--     .specs/features/2026-08-26-exercicios-professor/deltas.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------
alter table public.exercises
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists visibility text not null default 'publico';

comment on column public.exercises.owner_id is
  'Professor que criou o exercício. Null = catálogo seed original.';
comment on column public.exercises.visibility is
  'exclusivo = só o dono e os alunos dele; publico = catálogo global do app.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_visibility_check'
  ) then
    alter table public.exercises
      add constraint exercises_visibility_check
      check (visibility in ('exclusivo', 'publico'));
  end if;
end $$;

create index if not exists exercises_owner_id_idx on public.exercises (owner_id);
create index if not exists exercises_visibility_idx on public.exercises (visibility);

-- ---------------------------------------------------------------------
-- 2. requires_lower_limbs vira FAIL-SAFE
--
-- Nasceu em 20260826030000 como `not null default false`, e `false`
-- significa "liberado". Com o professor podendo cadastrar exercício, um
-- "Agachamento Ravi" nasceria liberado e chegaria a quem declarou
-- paraplegia — o filtro reabriria em silêncio.
--
-- Nullable + sem default: `null` = não classificado. O filtro do gerador
-- é `.eq('requires_lower_limbs', false)`, e em SQL `null = false` não é
-- verdadeiro — então não classificado JÁ sai dos planos com restrição,
-- sem esconder de quem não tem restrição. Falha pro lado seguro.
--
-- As 270 linhas existentes têm true/false explícito e não mudam.
-- ---------------------------------------------------------------------
alter table public.exercises
  alter column requires_lower_limbs drop not null,
  alter column requires_lower_limbs drop default;

comment on column public.exercises.requires_lower_limbs is
  'Exige função de membro inferior. true = bloqueado pra quem declara restrição; false = liberado; null = NÃO CLASSIFICADO, e por segurança também sai dos planos com restrição (o filtro é eq.false). Não é laudo clínico — é corrigível por update.';

-- ---------------------------------------------------------------------
-- 3. Unicidade por dono
-- A constraint original `unique (group_id, name)` impediria dois
-- professores de cadastrarem o mesmo nome. Vira dois índices parciais:
-- um pro catálogo seed, outro por dono.
-- ---------------------------------------------------------------------
alter table public.exercises drop constraint if exists exercises_group_id_name_key;

create unique index if not exists exercises_seed_group_name_uk
  on public.exercises (group_id, name)
  where owner_id is null;

create unique index if not exists exercises_owner_group_name_uk
  on public.exercises (group_id, name, owner_id)
  where owner_id is not null;

-- ---------------------------------------------------------------------
-- 4. Policy de leitura
-- Substitui o `using (true)`. Subqueries entre parênteses pro Postgres
-- avaliar uma vez por statement, não por linha.
-- ---------------------------------------------------------------------
drop policy if exists "exercises_select_all" on public.exercises;
drop policy if exists "exercises_select_visible" on public.exercises;
create policy "exercises_select_visible" on public.exercises
  for select using (
    visibility = 'publico'
    or owner_id = (select auth.uid())
    or owner_id = (select coach_id from public.profiles where id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 5. Policies de escrita — só professor premium cria; só o dono altera
--
-- Usa o wrapper `resolve_entitlement()` e NÃO o `_resolve_entitlement(uuid)`
-- interno: só o wrapper tem `grant execute ... to authenticated`
-- (20260622000000:166), e ele já resolve pelo auth.uid() — que dentro de
-- policy é exatamente o usuário corrente. Chamar o core daria permission
-- denied, e expor o core deixaria qualquer um consultar o tier de outro.
-- ---------------------------------------------------------------------
drop policy if exists "exercises_insert_premium_coach" on public.exercises;
create policy "exercises_insert_premium_coach" on public.exercises
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'professor'
    )
    and (public.resolve_entitlement() ->> 'tier') = 'premium'
  );

drop policy if exists "exercises_update_own" on public.exercises;
create policy "exercises_update_own" on public.exercises
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "exercises_delete_own" on public.exercises;
create policy "exercises_delete_own" on public.exercises
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 6. Bucket exercise-photos (público, 2MB, jpg/png/webp)
-- Público é coerente: image_urls já guarda URLs públicas (jsDelivr).
-- Path layout: <coach_id>/<timestamp>-<n>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-photos',
  'exercise-photos',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "exercise_photos_public_read" on storage.objects;
create policy "exercise_photos_public_read" on storage.objects
  for select using (bucket_id = 'exercise-photos');

drop policy if exists "exercise_photos_insert_own" on storage.objects;
create policy "exercise_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'exercise-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "exercise_photos_update_own" on storage.objects;
create policy "exercise_photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'exercise-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "exercise_photos_delete_own" on storage.objects;
create policy "exercise_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'exercise-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
