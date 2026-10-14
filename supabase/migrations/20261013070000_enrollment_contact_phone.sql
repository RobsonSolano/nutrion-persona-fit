-- =====================================================================
-- Persona Fit — Telefone de contato na solicitação de contratação
--
-- PROBLEMA: o professor recebia a solicitação e não tinha como falar com
-- a pessoa. O e-mail estava na fila, mas não é o canal que personal usa
-- no Brasil — é WhatsApp. E chat dentro do app não se paga agora.
--
-- Por que o telefone fica NA SOLICITAÇÃO e não no profile: assim ele é
-- compartilhado com AQUELE professor, naquele pedido. Um número no
-- perfil vazaria pra qualquer professor a quem ele pedisse depois, e
-- continuaria acessível mesmo após uma recusa.
--
-- Mesmo formato de coaches.contact_phone (10-13 dígitos, DDI+DDD+número).
-- Ver spec.md [SOLI]-11. Idempotente.
-- =====================================================================

alter table public.coach_enrollment_requests
  add column if not exists contact_phone text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'enrollment_contact_phone_check'
  ) then
    alter table public.coach_enrollment_requests
      add constraint enrollment_contact_phone_check
      check (contact_phone is null or contact_phone ~ '^[0-9]{10,13}$');
  end if;
end $$;

comment on column public.coach_enrollment_requests.contact_phone is
  'Telefone que o usuário deu PRA ESTE professor. Só dígitos (DDI+DDD+número). Some da fila quando a solicitação é recusada.';

-- ---------------------------------------------------------------------
-- request_coach passa a exigir o telefone
-- ---------------------------------------------------------------------
create or replace function public.request_coach(
  p_coach_id uuid,
  p_message text default null,
  p_contact_phone text default null
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
  v_phone text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- O professor precisa de um jeito de responder fora do app: sem canal de
  -- contato a solicitação morre na fila.
  v_phone := regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g');
  if v_phone !~ '^[0-9]{10,13}$' then
    return json_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  select role into v_role from public.profiles where id = v_uid;

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

  insert into public.coach_enrollment_requests
    (student_id, coach_id, message, contact_phone)
  values (v_uid, p_coach_id, nullif(btrim(coalesce(p_message, '')), ''), v_phone)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- A assinatura antiga (2 args) some: manter as duas deixaria um caminho
-- que cria solicitação sem contato.
drop function if exists public.request_coach(uuid, text);
grant execute on function public.request_coach(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- A fila do professor devolve o telefone
-- ---------------------------------------------------------------------
-- O retorno ganha uma coluna: CREATE OR REPLACE não muda tipo de retorno.
drop function if exists public.list_coach_enrollment_requests();
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
  student_email text,
  contact_phone text
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
         -- Contato só de quem tem solicitação viva ou aceita: em recusadas
         -- e canceladas o professor não tem mais razão de contato.
         case when r.status in ('pendente','andamento','efetuado')
              then p.email else null end,
         case when r.status in ('pendente','andamento','efetuado')
              then r.contact_phone else null end
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

grant execute on function public.list_coach_enrollment_requests() to authenticated;

-- ---------------------------------------------------------------------
-- O aluno lê o próprio último telefone (pré-preenche a próxima solicitação)
-- ---------------------------------------------------------------------
create or replace function public.my_last_contact_phone()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select contact_phone
    from public.coach_enrollment_requests
   where student_id = auth.uid() and contact_phone is not null
   order by created_at desc
   limit 1;
$$;

grant execute on function public.my_last_contact_phone() to authenticated;
