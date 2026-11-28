-- =====================================================================
-- Persona Fit — Fila de publicações do Instagram (@personafitapp)
-- Spec: .specs/features/2026-11-28-instagram-autopost (IG-01)
--
-- Cada linha é uma publicação: 1 post de feed e 2 stories por dia. A edge
-- function cron-instagram-publish (a cada 15 min) publica o que venceu.
-- As imagens ficam no bucket público `instagram`; aqui só o caminho, na ordem.
--
-- Só o service role mexe: RLS ligado e nenhuma policy.
-- Idempotente (if not exists / drop if exists).
-- =====================================================================

create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  scheduled_for timestamptz not null,
  slot text not null check (slot in ('feed', 'story-1', 'story-2')),
  kind text not null check (kind in ('image', 'carousel', 'story')),
  media_paths text[] not null,
  caption text,
  status text not null default 'pending'
    check (status in ('pending', 'publishing', 'published', 'failed', 'skipped')),
  ig_media_id text,
  permalink text,
  error text check (error is null or char_length(error) <= 1000),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- story vai no slot de story, post no de feed
  constraint instagram_posts_slot_kind check (
    (slot = 'feed') = (kind in ('image', 'carousel'))
  ),
  -- carrossel: 2 a 10 imagens; imagem e story: exatamente 1
  constraint instagram_posts_media_count check (
    case kind
      when 'carousel' then coalesce(array_length(media_paths, 1), 0) between 2 and 10
      else coalesce(array_length(media_paths, 1), 0) = 1
    end
  ),
  -- story não tem legenda; legenda até 2.200 caracteres (limite da Meta)
  constraint instagram_posts_caption check (
    (kind <> 'story' or caption is null)
    and (caption is null or char_length(caption) <= 2200)
  )
);

comment on table public.instagram_posts is
  'Fila do Instagram (@personafitapp): 1 feed + 2 stories por dia, publicados pela edge function cron-instagram-publish.';

-- Um por dia (horário de Brasília) e por slot. A carga da fila faz upsert por
-- esta chave, então rodar o script de novo não duplica.
alter table public.instagram_posts
  add column if not exists post_date date
  generated always as ((scheduled_for at time zone 'America/Sao_Paulo')::date) stored;

create unique index if not exists instagram_posts_dia_slot
  on public.instagram_posts (post_date, slot);

-- O cron busca pendentes vencidos.
create index if not exists instagram_posts_pendentes
  on public.instagram_posts (scheduled_for)
  where status = 'pending';

drop trigger if exists instagram_posts_updated_at on public.instagram_posts;
create trigger instagram_posts_updated_at
  before update on public.instagram_posts
  for each row execute function public.set_updated_at();

alter table public.instagram_posts enable row level security;
