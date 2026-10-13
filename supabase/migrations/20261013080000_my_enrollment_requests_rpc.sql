-- =====================================================================
-- Persona Fit — Solicitações do aluno com o nome do professor (1 query)
--
-- O cliente listava as próprias solicitações e depois chamava
-- get_coach_public_profile UMA VEZ POR PROFESSOR só pra ter o nome —
-- um N+1 que roda na ABERTURA DO APP (o aviso de desfecho depende
-- desta lista). Com 3 solicitações eram 4 idas ao servidor.
--
-- Aqui o nome sai junto. É security definer pelo mesmo motivo das outras:
-- a RLS de profiles não expõe quem ainda não é coach do usuário.
--
-- Ver spec.md [SOLI]-08, [SOLI]-09. Idempotente.
-- =====================================================================

create or replace function public.list_my_enrollment_requests()
returns table (
  id uuid,
  coach_id uuid,
  status text,
  message text,
  cancel_reason text,
  created_at timestamptz,
  responded_at timestamptz,
  seen_by_student_at timestamptz,
  coach_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id,
         r.coach_id,
         r.status,
         r.message,
         r.cancel_reason,
         r.created_at,
         r.responded_at,
         r.seen_by_student_at,
         p.full_name
    from public.coach_enrollment_requests r
    join public.profiles p on p.id = r.coach_id
   where r.student_id = auth.uid()
   order by r.created_at desc;
$$;

comment on function public.list_my_enrollment_requests() is
  'Solicitações do usuário autenticado, já com o nome do professor. Substitui o N+1 de get_coach_public_profile por solicitação.';

grant execute on function public.list_my_enrollment_requests() to authenticated;
