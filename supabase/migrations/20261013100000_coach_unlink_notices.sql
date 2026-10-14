-- =====================================================================
-- Aviso de desvínculo pro ex-aluno (2026-10-13)
--
-- O coach-unlink-student só mandava push. Mesmo motivo do aviso de
-- desfecho da contratação: a permissão de notificação pode estar negada, e
-- deixar de ser aluno muda o que o usuário pode fazer no app — ele precisa
-- saber na próxima abertura. Uma linha por desvínculo; o app mostra as não
-- vistas e marca pela RPC.
--
-- Escrita só pela edge function (service role): não há policy de insert.
-- coach_name é snapshot — o professor pode trocar de nome ou apagar a conta.
-- =====================================================================

create table if not exists public.coach_unlink_notices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  coach_name text,
  created_at timestamptz not null default now(),
  seen_by_student_at timestamptz
);

comment on table public.coach_unlink_notices is
  'Aviso "seu professor encerrou o vínculo", mostrado na abertura do app até o ex-aluno ver.';

create index if not exists coach_unlink_notices_unseen_idx
  on public.coach_unlink_notices (student_id)
  where seen_by_student_at is null;

alter table public.coach_unlink_notices enable row level security;

drop policy if exists "unlink_notices_select_own" on public.coach_unlink_notices;
create policy "unlink_notices_select_own" on public.coach_unlink_notices
  for select using ((select auth.uid()) = student_id);

create or replace function public.mark_unlink_notice_seen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coach_unlink_notices
     set seen_by_student_at = now()
   where id = p_id and student_id = auth.uid() and seen_by_student_at is null;
$$;

grant execute on function public.mark_unlink_notice_seen(uuid) to authenticated;
