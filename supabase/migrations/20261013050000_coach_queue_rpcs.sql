-- =====================================================================
-- Persona Fit — Fila e bloqueados do professor (leitura)
--
-- Mesmo motivo das RPCs de descoberta: a RLS de profiles não expõe quem
-- AINDA NÃO é aluno do professor, então a fila mostraria uuid sem nome.
-- Estas funções devolvem só o mínimo pra fila (nome e e-mail de contato
-- de quem se ofereceu voluntariamente pra ser aluno dele).
--
-- Ver spec.md [SOLI]-03, [ABAS]-02, [BLOQ]-03. Idempotente.
-- =====================================================================

create or replace function public.list_coach_enrollment_requests()
returns table (
  id uuid,
  student_id uuid,
  status text,
  message text,
  cancel_reason text,
  created_at timestamptz,
  responded_at timestamptz,
  student_name text,
  student_email text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id,
         r.student_id,
         r.status,
         r.message,
         r.cancel_reason,
         r.created_at,
         r.responded_at,
         p.full_name,
         -- E-mail só de quem tem solicitação viva ou aceita: em recusadas
         -- e canceladas o professor não tem mais razão de contato.
         case when r.status in ('pendente','andamento','efetuado')
              then p.email else null end
    from public.coach_enrollment_requests r
    join public.profiles p on p.id = r.student_id
   where r.coach_id = auth.uid()
   order by
     case r.status
       when 'pendente' then 0
       when 'andamento' then 1
       else 2
     end,
     r.created_at desc;
$$;

comment on function public.list_coach_enrollment_requests() is
  'Fila de contratação do professor autenticado, pendentes primeiro. Expõe nome e e-mail do solicitante — mínimo pra ele conseguir tratar a solicitação.';

create or replace function public.list_coach_blocks()
returns table (
  user_id uuid,
  full_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select b.user_id, p.full_name, b.created_at
    from public.coach_blocks b
    join public.profiles p on p.id = b.user_id
   where b.coach_id = auth.uid()
   order by b.created_at desc;
$$;

grant execute on function public.list_coach_enrollment_requests() to authenticated;
grant execute on function public.list_coach_blocks() to authenticated;
