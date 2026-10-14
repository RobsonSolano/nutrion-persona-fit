-- =====================================================================
-- Avisos remotos + versão mínima/recomendada (2026-10-13)
-- Spec: .specs/features/2026-10-13-avisos-remotos/spec.md
--
-- Tudo editado direto no Supabase (Table Editor), sem build nem OTA:
--   app_config            → versões e texto da atualização pela loja
--   announcements         → avisos por público (todos/comum/aluno/professor)
--   announcement_views    → quem já viu (aviso aparece uma vez por usuário)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. app_config — linha única
-- ---------------------------------------------------------------------
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  min_version text,
  recommended_version text,
  update_title text,
  update_message text,
  android_store_url text,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Linha única. min_version: abaixo dela o app bloqueia até atualizar na loja. recommended_version: abaixo dela sugere, com "Depois". Vazio = nada aparece.';

insert into public.app_config (id) values (true) on conflict (id) do nothing;

drop trigger if exists app_config_set_updated_at on public.app_config;
create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

alter table public.app_config enable row level security;

-- Legível deslogado: a checagem de versão roda na tela de login ([ATU]-05).
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- 2. announcements
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 1000),
  audience text not null default 'todos'
    check (audience in ('todos', 'comum', 'aluno', 'professor')),
  cta_label text check (cta_label is null or char_length(cta_label) <= 40),
  cta_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.announcements is
  'Aviso remoto mostrado uma vez por usuário na abertura do app. audience: todos|comum|aluno|professor. cta_url: rota do app ("/encontrar-professor") ou URL. Sem ends_at fica no ar até active = false.';

-- Sem policy: o app lê só pela RPC, que já filtra por público ([AVI]-06).
alter table public.announcements enable row level security;

-- ---------------------------------------------------------------------
-- 3. announcement_views
-- ---------------------------------------------------------------------
create table if not exists public.announcement_views (
  user_id uuid not null references public.profiles(id) on delete cascade,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.announcement_views enable row level security;

drop policy if exists "announcement_views_select_own" on public.announcement_views;
create policy "announcement_views_select_own" on public.announcement_views
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------
create or replace function public.my_pending_announcements()
returns table (
  id uuid,
  title text,
  body text,
  cta_label text,
  cta_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.title, a.body, a.cta_label, a.cta_url
    from public.announcements a
    join public.profiles p on p.id = auth.uid()
   where a.active
     and a.starts_at <= now()
     and (a.ends_at is null or a.ends_at > now())
     and (a.audience = 'todos' or a.audience = p.role)
     and not exists (
       select 1 from public.announcement_views v
        where v.announcement_id = a.id and v.user_id = auth.uid())
   order by a.starts_at, a.created_at;
$$;

create or replace function public.mark_announcement_seen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.announcement_views (user_id, announcement_id)
  select auth.uid(), p_id
   where auth.uid() is not null
  on conflict (user_id, announcement_id) do nothing;
$$;

grant execute on function public.my_pending_announcements() to authenticated;
grant execute on function public.mark_announcement_seen(uuid) to authenticated;
