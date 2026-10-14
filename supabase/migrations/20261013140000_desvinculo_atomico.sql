-- =====================================================================
-- Desvínculo professor↔aluno numa transação só (2026-10-13)
--
-- Os passos de privacidade do desvínculo eram chamadas soltas da edge
-- function, cada uma "best-effort" (só logava se falhasse). Foi assim que o
-- detach das revisões de plano falhou em silêncio por meses (coluna NOT
-- NULL) e o ex-professor seguiu lendo o histórico do ex-aluno. Aqui eles
-- viram uma transação: ou o desvínculo acontece por inteiro, ou nada muda.
--
-- Fica de fora (continua best-effort na edge function, depois desta): o
-- trial de servidor e a reconciliação de vagas — não são privacidade e não
-- devem impedir o desvínculo.
--
-- Só service_role chama: o trigger guard_role_changes só deixa mudar
-- role/coach_id quando auth.role() = 'service_role'.
-- =====================================================================

create or replace function public.unlink_coach_student(
  p_student_id uuid,
  p_coach_id uuid,
  p_initiated_by text,
  p_reason text default null,
  p_coach_name text default null,
  p_student_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_initiated_by not in ('coach', 'student') then
    raise exception 'initiated_by inválido: %', p_initiated_by;
  end if;
  -- [TRAN]-10: quem sai escreve o motivo (10 a 500). O limite de cima
  -- também está na constraint da tabela.
  if p_initiated_by = 'student' and char_length(coalesce(v_reason, '')) < 10 then
    raise exception 'motivo obrigatório (mínimo 10 caracteres)'
      using errcode = 'check_violation';
  end if;

  update public.profiles
     set role = 'comum', coach_id = null
   where id = p_student_id and coach_id = p_coach_id;
  if not found then
    raise exception 'aluno % não é do professor %', p_student_id, p_coach_id
      using errcode = 'no_data_found';
  end if;

  -- Privacidade do ex-aluno: o professor perde as notas e o histórico.
  delete from public.coach_notes
   where student_id = p_student_id and coach_id = p_coach_id;
  update public.student_plan_revisions
     set coach_id = null
   where student_id = p_student_id and coach_id = p_coach_id;

  -- Aviso pro outro lado; o lado de quem iniciou já nasce visto.
  insert into public.coach_unlink_notices
    (student_id, coach_id, coach_name, student_name, initiated_by, reason,
     seen_by_student_at, seen_by_coach_at)
  values
    (p_student_id, p_coach_id, p_coach_name, p_student_name, p_initiated_by, v_reason,
     case when p_initiated_by = 'student' then now() end,
     case when p_initiated_by = 'coach' then now() end);

  -- O aceite da contratação que o aluno não viu deixa de ser notícia.
  update public.coach_enrollment_requests
     set seen_by_student_at = now()
   where student_id = p_student_id and coach_id = p_coach_id
     and status = 'efetuado' and seen_by_student_at is null;
end;
$$;

revoke all on function public.unlink_coach_student(uuid, uuid, text, text, text, text) from public;
revoke all on function public.unlink_coach_student(uuid, uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.unlink_coach_student(uuid, uuid, text, text, text, text) to service_role;
