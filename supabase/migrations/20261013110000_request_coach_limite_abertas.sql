-- =====================================================================
-- request_coach: no máximo 5 solicitações abertas por usuário ([SOLI]-12)
--
-- Trava contra envio em massa — sem ela, um usuário poderia mandar pedido
-- pra todos os professores da busca de uma vez. "Aberta" = pendente ou
-- andamento; canceladas e efetuadas não contam. O resto da função é igual
-- à versão de 20261013070000 (telefone obrigatório).
-- =====================================================================

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

  if (
    select count(*) from public.coach_enrollment_requests
     where student_id = v_uid and status in ('pendente','andamento')
  ) >= 5 then
    return json_build_object('ok', false, 'error', 'too_many_open');
  end if;

  insert into public.coach_enrollment_requests
    (student_id, coach_id, message, contact_phone)
  values (v_uid, p_coach_id, nullif(btrim(coalesce(p_message, '')), ''), v_phone)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.request_coach(uuid, text, text) to authenticated;
