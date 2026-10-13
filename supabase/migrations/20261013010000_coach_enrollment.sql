-- =====================================================================
-- Persona Fit — Solicitação de contratação, bloqueio e avaliações
--
-- ATENÇÃO ao nome: `student_requests` JÁ EXISTE e é outra coisa —
-- pedido de suporte do aluno PRO professor (app/solicitacoes). Esta
-- tabela é a fila de CONTRATAÇÃO (comum → aluno).
--
-- Cria:
--   coach_enrollment_requests  — pendente|andamento|efetuado|cancelado
--   coach_blocks               — par professor × usuário
--   coach_ratings              — 1 a 5 estrelas, 1 por par
--   trigger que cancela solicitações abertas ao bloquear
--
-- O vínculo em si (role='aluno' + coach_id) NÃO acontece aqui: a trigger
-- guard_role_changes só deixa service_role mexer, então quem efetiva é a
-- edge function coach-respond-enrollment.
--
-- Ver spec.md [SOLI]-01..10, [BLOQ]-01..04, [AVAL]-01..05. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. coach_enrollment_requests
-- ---------------------------------------------------------------------
create table if not exists public.coach_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente','andamento','efetuado','cancelado')),
  message text check (message is null or length(message) <= 500),
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  seen_by_student_at timestamptz,
  constraint coach_enrollment_no_self check (student_id <> coach_id)
);

comment on table public.coach_enrollment_requests is
  'Fila de contratação (usuário comum pede pra virar aluno). NÃO confundir com student_requests (suporte do aluno já vinculado).';
comment on column public.coach_enrollment_requests.seen_by_student_at is
  'Quando o aluno viu o desfecho. Null + status terminal = mostrar aviso na abertura do app ([SOLI]-09).';

-- Uma solicitação ABERTA por par. Terminais podem se repetir (histórico).
create unique index if not exists coach_enrollment_one_open_idx
  on public.coach_enrollment_requests (student_id, coach_id)
  where status in ('pendente','andamento');

create index if not exists coach_enrollment_coach_status_idx
  on public.coach_enrollment_requests (coach_id, status, created_at desc);
create index if not exists coach_enrollment_student_idx
  on public.coach_enrollment_requests (student_id, created_at desc);
-- Aviso pendente na abertura do app.
create index if not exists coach_enrollment_unseen_idx
  on public.coach_enrollment_requests (student_id)
  where status in ('efetuado','cancelado') and seen_by_student_at is null;

drop trigger if exists coach_enrollment_set_updated_at
  on public.coach_enrollment_requests;
create trigger coach_enrollment_set_updated_at
  before update on public.coach_enrollment_requests
  for each row execute function public.set_updated_at();

alter table public.coach_enrollment_requests enable row level security;

-- Aluno lê as próprias; professor lê as dirigidas a ele.
drop policy if exists "enrollment_select_own" on public.coach_enrollment_requests;
create policy "enrollment_select_own" on public.coach_enrollment_requests
  for select using (
    (select auth.uid()) = student_id or (select auth.uid()) = coach_id
  );

-- INSERT só pela RPC request_coach (security definer) — ela valida
-- bloqueio, elegibilidade do professor e o role do solicitante.
-- UPDATE do aluno: só marcar como visto e cancelar a própria pendente.
drop policy if exists "enrollment_update_student_seen" on public.coach_enrollment_requests;
create policy "enrollment_update_student_seen" on public.coach_enrollment_requests
  for update using ((select auth.uid()) = student_id)
  with check ((select auth.uid()) = student_id);

-- ---------------------------------------------------------------------
-- 2. coach_blocks
--
--    Motivo de existir: sem bloqueio, um usuário recusado reenvia
--    solicitação infinitamente e o professor recusa pra sempre.
-- ---------------------------------------------------------------------
create table if not exists public.coach_blocks (
  coach_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, user_id),
  constraint coach_blocks_no_self check (coach_id <> user_id)
);

comment on table public.coach_blocks is
  'Professor × usuário bloqueado. O bloqueado NÃO é avisado ([BLOQ]-04) — ele só deixa de ver o professor.';

alter table public.coach_blocks enable row level security;

-- Só o professor enxerga e gerencia a própria lista. O bloqueado nunca lê
-- esta tabela — é assim que o bloqueio fica silencioso.
drop policy if exists "coach_blocks_select_own" on public.coach_blocks;
create policy "coach_blocks_select_own" on public.coach_blocks
  for select using ((select auth.uid()) = coach_id);

drop policy if exists "coach_blocks_insert_own" on public.coach_blocks;
create policy "coach_blocks_insert_own" on public.coach_blocks
  for insert with check (
    (select auth.uid()) = coach_id
    and (select role from public.profiles where id = (select auth.uid())) = 'professor'
  );

drop policy if exists "coach_blocks_delete_own" on public.coach_blocks;
create policy "coach_blocks_delete_own" on public.coach_blocks
  for delete using ((select auth.uid()) = coach_id);

-- Bloquear encerra o que estiver aberto: senão a solicitação fica pendente
-- pra sempre na fila de um professor que não quer mais aquele usuário.
create or replace function public.cancel_open_requests_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_enrollment_requests
     set status = 'cancelado',
         responded_at = now(),
         cancel_reason = coalesce(cancel_reason, 'Solicitação encerrada pelo professor.')
   where coach_id = new.coach_id
     and student_id = new.user_id
     and status in ('pendente','andamento');
  return new;
end;
$$;

drop trigger if exists coach_blocks_cancel_open on public.coach_blocks;
create trigger coach_blocks_cancel_open
  after insert on public.coach_blocks
  for each row execute function public.cancel_open_requests_on_block();

-- ---------------------------------------------------------------------
-- 3. coach_ratings
--
--    Só estrelas, sem texto ([AVAL]-05): comentário livre exige moderação,
--    denúncia e responsabilidade editorial — feature própria.
-- ---------------------------------------------------------------------
create table if not exists public.coach_ratings (
  student_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, coach_id),
  constraint coach_ratings_no_self check (student_id <> coach_id)
);

comment on table public.coach_ratings is
  'Avaliação 1-5 do professor pelo aluno. Uma por par, editável. Escrita só pela RPC rate_coach (exige vínculo efetivado).';

create index if not exists coach_ratings_coach_idx
  on public.coach_ratings (coach_id);

drop trigger if exists coach_ratings_set_updated_at on public.coach_ratings;
create trigger coach_ratings_set_updated_at
  before update on public.coach_ratings
  for each row execute function public.set_updated_at();

alter table public.coach_ratings enable row level security;

-- O aluno lê a própria nota (pra pré-preencher as estrelas). A MÉDIA
-- pública sai pela RPC de busca, não desta policy — ninguém lê as notas
-- individuais dos outros.
drop policy if exists "coach_ratings_select_own" on public.coach_ratings;
create policy "coach_ratings_select_own" on public.coach_ratings
  for select using ((select auth.uid()) = student_id);

-- Escrita só via rate_coach (security definer): a elegibilidade depende de
-- ter tido vínculo efetivado, que o cliente não tem como provar sozinho.
