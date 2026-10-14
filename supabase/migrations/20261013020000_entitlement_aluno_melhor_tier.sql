-- =====================================================================
-- Persona Fit — Entitlement do aluno passa a ser max(próprio, do coach)
--
-- PROBLEMA que isto resolve: até aqui o aluno recebia o tier PRÓPRIO e só
-- herdava `ai_personal` do coach. Com a contratação pelo app, um usuário
-- que já paga Pro/Premium vira aluno e continua sendo cobrado pela loja —
-- e o app NÃO pode cancelar assinatura (a loja é o merchant of record,
-- ver .specs/features/billing/estrutura_assinatura.md §3.6).
--
-- Regra nova: aluno recebe o MELHOR entre o tier dele e o do coach
-- (free < pro < premium). Nunca fica pagando e sem acesso. Quando a
-- assinatura própria expira, ele simplesmente continua com o do coach.
--
-- O resto da função é idêntico à versão anterior
-- (20260722000000_student_limits_free2_pro5.sql). Ver spec.md [TRAN]-06.
-- =====================================================================

create or replace function public._resolve_entitlement(p_uid uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_coach_id uuid;
  v_early boolean;
  v_tier text;
  v_source text;
  v_status text;
  v_trial_end timestamptz;
  v_period_end timestamptz;
  v_trial_active boolean;
  v_store_active boolean;
  v_has_tier_access boolean;
  v_grandfather boolean;
  v_tier_out text;
  v_ai_personal boolean;
  v_ai_coach boolean;
  v_student_limit int;
  v_coach_ent json;
  v_coach_tier text;
begin
  if p_uid is null then
    return json_build_object('tier','free','source','none','ai_personal',false,
                             'ai_coach',false,'student_limit',null,'trial_end',null);
  end if;

  select role, coach_id, is_early_adopter
    into v_role, v_coach_id, v_early
    from public.profiles where id = p_uid;

  if not found then
    return json_build_object('tier','free','source','none','ai_personal',false,
                             'ai_coach',false,'student_limit',null,'trial_end',null);
  end if;

  select tier, source, status, trial_end, period_end
    into v_tier, v_source, v_status, v_trial_end, v_period_end
    from public.subscriptions where user_id = p_uid;

  v_trial_active := coalesce(v_source = 'server_trial' and v_trial_end > now(), false);
  v_store_active := coalesce(
    v_source in ('store_play','store_apple','stripe') and (
      v_status in ('active','in_trial')
      or (v_status = 'canceled' and coalesce(v_period_end > now(), false))
    ), false);
  v_has_tier_access := (v_trial_active or v_store_active)
                       and coalesce(v_tier in ('pro','premium'), false);
  v_grandfather := coalesce(v_source = 'grandfather', false) or coalesce(v_early, false);
  v_tier_out := case when v_has_tier_access then v_tier else 'free' end;

  if v_role = 'aluno' then
    if v_coach_id is null then
      v_ai_personal := false;
    else
      -- Uma chamada só: o mesmo resultado alimenta a IA herdada e o tier.
      v_coach_ent := public._resolve_entitlement(v_coach_id);
      v_ai_personal := coalesce((v_coach_ent ->> 'ai_personal')::boolean, false);
      v_coach_tier := v_coach_ent ->> 'tier';
      -- Melhor dos dois: o aluno nunca perde o que já pagou, e nunca fica
      -- abaixo do que o professor oferece.
      if v_coach_tier = 'premium' or v_tier_out = 'premium' then
        v_tier_out := 'premium';
      elsif v_coach_tier = 'pro' or v_tier_out = 'pro' then
        v_tier_out := 'pro';
      end if;
    end if;
    return json_build_object(
      'tier', v_tier_out, 'source', coalesce(v_source,'none'),
      'ai_personal', v_ai_personal, 'ai_coach', false,
      'student_limit', null, 'trial_end', v_trial_end);
  end if;

  v_ai_personal := v_has_tier_access or v_grandfather;

  if v_role = 'professor' then
    v_ai_coach := v_has_tier_access;  -- D3: grandfather/early NÃO concede coach
    v_student_limit := case v_tier_out
                         when 'premium' then null
                         when 'pro' then 5
                         else 2 end;          -- free/grandfather = 2
  else
    v_ai_coach := false;
    v_student_limit := null;
  end if;

  return json_build_object(
    'tier', v_tier_out, 'source', coalesce(v_source,'none'),
    'ai_personal', v_ai_personal, 'ai_coach', v_ai_coach,
    'student_limit', v_student_limit, 'trial_end', v_trial_end);
end;
$$;

comment on function public._resolve_entitlement(uuid) is
  'Core do entitlement (uid explícito, testável). Aluno recebe max(tier próprio, tier do coach). Wrapper público: resolve_entitlement().';
