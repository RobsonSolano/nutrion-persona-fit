-- =====================================================================
-- Teste do painel admin v2 ([ADM]-01..08) — 2026-10-14
--
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/painel_admin.test.sql
-- Saída esperada ao final: NOTICE "PAINEL_ADMIN: ALL PASS".
--
-- O banco local pode ter seed: os totais são comparados como diferença
-- (depois − antes dos dados do teste), nunca como valor absoluto.
-- =====================================================================
begin;
set local session_replication_role = replica;

create function public._t_delta(agora json, antes json, path text[])
returns int language sql immutable as $$
  select coalesce((agora #>> path)::int, 0) - coalesce((antes #>> path)::int, 0);
$$;

-- Mensagem do erro que o comando levanta (null se não levantar).
create function public._t_err(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

create function public._t_as(p_uid text)
returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '' else
      format('{"sub":"%s","role":"authenticated"}', p_uid) end, true);
$$;

-- u0 = admin (sem perfil). u9 = conta de teste (fica fora por padrão).
insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000000', 'admin@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000001', 'free@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000002', 'trial@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000003', 'trialvencido@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000004', 'prof@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000005', 'aluno@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000006', 'parceiro@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000007', 'parceirovencido@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000008', 'parceirosemfim@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000009', 'robo@nutrion.test'),
  ('dddddddd-0000-0000-0000-000000000011', 'pagante@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000012', 'alunopagante@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000013', 'alunoearly@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000014', 'porfora@painel-teste.local'),
  ('dddddddd-0000-0000-0000-000000000015', 'alunoporfora@painel-teste.local');

insert into public.admin_users (id, full_name) values
  ('dddddddd-0000-0000-0000-000000000000', 'Admin');

set local session_replication_role = origin;
select public._t_as('dddddddd-0000-0000-0000-000000000000');
create temp table _antes on commit drop as
  select public.admin_metrics(public._sp_date(now()) - 30, public._sp_date(now())) as m,
         public.admin_metrics(public._sp_date(now()) - 30, public._sp_date(now()), null, true) as m_test,
         public.admin_metrics(public._sp_date(now()) - 30, public._sp_date(now()), 'premium') as m_premium,
         public.admin_timeseries(public._sp_date(now()) - 6, public._sp_date(now())) as ts;
select public._t_as(null);
set local session_replication_role = replica;

insert into public.profiles (id, role, coach_id, user_number, full_name) values
  ('dddddddd-0000-0000-0000-000000000001', 'comum',     null, 9701, 'Free'),
  ('dddddddd-0000-0000-0000-000000000002', 'comum',     null, 9702, 'Trial'),
  ('dddddddd-0000-0000-0000-000000000003', 'comum',     null, 9703, 'Trial Vencido'),
  ('dddddddd-0000-0000-0000-000000000004', 'professor', null, 9704, 'Prof Premium'),
  ('dddddddd-0000-0000-0000-000000000005', 'aluno', 'dddddddd-0000-0000-0000-000000000004', 9705, 'Aluno'),
  ('dddddddd-0000-0000-0000-000000000006', 'comum',     null, 9706, 'Parceiro'),
  ('dddddddd-0000-0000-0000-000000000007', 'comum',     null, 9707, 'Parceiro Vencido'),
  ('dddddddd-0000-0000-0000-000000000008', 'comum',     null, 9708, 'Parceiro Sem Fim'),
  ('dddddddd-0000-0000-0000-000000000009', 'comum',     null, 9709, 'Robo'),
  ('dddddddd-0000-0000-0000-000000000011', 'comum',     null, 9711, 'Pagante'),
  -- paga Pro pela Play, mas o professor é Premium: herda, e continua pagante
  ('dddddddd-0000-0000-0000-000000000012', 'aluno', 'dddddddd-0000-0000-0000-000000000004', 9712, 'Aluno Pagante'),
  -- grandfather não vale pra aluno; professor free → free
  ('dddddddd-0000-0000-0000-000000000013', 'aluno', 'dddddddd-0000-0000-0000-000000000001', 9713, 'Aluno Early'),
  -- paga por fora da loja (Pix), valor combinado
  ('dddddddd-0000-0000-0000-000000000014', 'professor', null, 9714, 'Prof Por Fora'),
  -- paga Pro por fora, mas o professor é Premium: herda, e segue pagante por fora
  ('dddddddd-0000-0000-0000-000000000015', 'aluno', 'dddddddd-0000-0000-0000-000000000004', 9715, 'Aluno Por Fora');

insert into public.subscriptions (user_id, tier, source, status, period_end, monthly_amount) values
  ('dddddddd-0000-0000-0000-000000000014','premium','external','active', null, 99.90),
  ('dddddddd-0000-0000-0000-000000000015','pro',    'external','active', null, 30.00);
insert into public.subscriptions (user_id, tier, source, status, trial_end, period_end, trial_consumed) values
  ('dddddddd-0000-0000-0000-000000000002','pro',    'server_trial','in_trial', now() + interval '3 days', null, true),
  -- status segue in_trial no banco, mas a data já passou: é free.
  ('dddddddd-0000-0000-0000-000000000003','pro',    'server_trial','in_trial', now() - interval '1 day',  null, true),
  ('dddddddd-0000-0000-0000-000000000004','premium','store_play',  'active',   null, now() + interval '20 days', false),
  ('dddddddd-0000-0000-0000-000000000006','premium','partner',     'active',   null, now() + interval '10 days', false),
  ('dddddddd-0000-0000-0000-000000000007','pro',    'partner',     'active',   null, now() - interval '1 day', false),
  ('dddddddd-0000-0000-0000-000000000008','pro',    'partner',     'active',   null, null, false),
  ('dddddddd-0000-0000-0000-000000000011','pro',    'store_play',  'active',   null, now() + interval '20 days', true),
  ('dddddddd-0000-0000-0000-000000000012','pro',    'store_play',  'active',   null, now() + interval '20 days', false),
  ('dddddddd-0000-0000-0000-000000000013','free',   'grandfather', 'active',   null, null, false);

-- Atividade: u1 registrou refeição com IA hoje, u2 falou com o chat hoje,
-- u6 bebeu água há 5 dias.
insert into public.food_logs (user_id, meal_name, description, calories, ai_feedback, created_at) values
  ('dddddddd-0000-0000-0000-000000000001', 'Almoço', 'arroz, feijão e frango', 650, 'Prato equilibrado.', now());
insert into public.chat_messages (user_id, role, content, created_at) values
  ('dddddddd-0000-0000-0000-000000000002', 'user', 'quanto de proteína?', now() - interval '1 minute'),
  ('dddddddd-0000-0000-0000-000000000002', 'assistant', 'Uns 160 g por dia.', now());
insert into public.water_logs (user_id, day, volume_ml) values
  ('dddddddd-0000-0000-0000-000000000006', public._sp_date(now()) - 5, 1500);
insert into public.ai_usage_log (user_id, feature, day, status, error_code, duration_ms) values
  ('dddddddd-0000-0000-0000-000000000002', 'chat', public._sp_date(now()), 'success', null, 800),
  ('dddddddd-0000-0000-0000-000000000002', 'chat', public._sp_date(now()), 'error', 'rate_limit', 200),
  ('dddddddd-0000-0000-0000-000000000001', 'sanity_check', public._sp_date(now()), 'success', 'sanity_fallback_groq_down', 1500);
insert into public.push_history (user_id, type, title, body, ai_generated, status, skip_reason, sent_at) values
  ('dddddddd-0000-0000-0000-000000000002', 'streak_celebration', 't', 'b', true,  'sent',    null,          now()),
  ('dddddddd-0000-0000-0000-000000000002', 'water_reminder',     't', 'b', false, 'skipped', 'quiet_hours', now());
insert into public.account_deletion_log (user_id_hash, role, account_age_days, deletion_reason) values
  ('hash', 'comum', 12, 'não usei');

set local session_replication_role = origin;

do $$
declare
  v_today date := public._sp_date(now());
  m json;
  r json;
  a json;
  v_via text;
begin
  select _antes.m into a from _antes;

  -- [ADM]-01: quem não é admin não passa, nem anônimo.
  perform public._t_as('dddddddd-0000-0000-0000-000000000001');
  assert public._t_err('select public.admin_metrics(current_date - 30, current_date)') = 'forbidden',
    'não-admin deveria levar forbidden';
  assert public._t_err($q$select public.admin_set_manual_plan('dddddddd-0000-0000-0000-000000000001', 'partner', 'premium')$q$)
    = 'forbidden', 'não-admin não pode se dar parceria';
  perform public._t_as(null);
  assert public._t_err('select public.admin_list_users()') = 'forbidden', 'anônimo deveria levar forbidden';
  raise notice 'OK 1: só admin';

  perform public._t_as('dddddddd-0000-0000-0000-000000000000');

  -- [ADM]-02: de onde vem o plano, direto do entitlement que o app usa.
  for v_via, r in
    select x.via, public._resolve_entitlement(x.id::uuid) from (values
      ('dddddddd-0000-0000-0000-000000000001', 'none'),
      ('dddddddd-0000-0000-0000-000000000002', 'trial'),
      ('dddddddd-0000-0000-0000-000000000003', 'none'),
      ('dddddddd-0000-0000-0000-000000000004', 'store'),
      ('dddddddd-0000-0000-0000-000000000005', 'inherited'),
      ('dddddddd-0000-0000-0000-000000000006', 'partner'),
      ('dddddddd-0000-0000-0000-000000000007', 'none'),
      ('dddddddd-0000-0000-0000-000000000008', 'partner'),
      ('dddddddd-0000-0000-0000-000000000012', 'inherited'),
      ('dddddddd-0000-0000-0000-000000000013', 'none'),
      ('dddddddd-0000-0000-0000-000000000014', 'external'),
      ('dddddddd-0000-0000-0000-000000000015', 'inherited')
    ) x(id, via)
  loop
    assert r ->> 'via' = v_via, format('via esperado %s, veio %s', v_via, r ->> 'via');
  end loop;
  r := public._resolve_entitlement('dddddddd-0000-0000-0000-000000000015');
  assert r ->> 'tier' = 'premium' and r ->> 'manual' = 'external',
    'aluno que paga por fora com professor premium: herda premium e segue com plano manual';
  r := public._resolve_entitlement('dddddddd-0000-0000-0000-000000000012');
  assert r ->> 'tier' = 'premium' and (r ->> 'store_active')::boolean,
    'aluno pagante com professor premium: herda premium e segue pagante';
  raise notice 'OK 2: via / store_active';

  -- [ADM]-03: entitlement do app reconhece parceria.
  r := public._resolve_entitlement('dddddddd-0000-0000-0000-000000000006');
  assert r ->> 'tier' = 'premium' and (r ->> 'ai_personal')::boolean, 'parceria premium libera';
  assert public._resolve_entitlement('dddddddd-0000-0000-0000-000000000007') ->> 'tier' = 'free',
    'parceria vencida volta a free';
  assert public._resolve_entitlement('dddddddd-0000-0000-0000-000000000008') ->> 'tier' = 'pro',
    'parceria sem fim vale';
  raise notice 'OK 3: entitlement com partner';

  -- [ADM]-04: totais do dashboard (conta de teste fica fora por padrão).
  m := public.admin_metrics(v_today - 30, v_today);
  assert public._t_delta(m, a, '{base,total}') = 13, format('total sem teste +13, veio %s', public._t_delta(m, a, '{base,total}'));
  assert public._t_delta(m, a, '{base,by_role,professor}') = 2, 'dois professores';
  assert public._t_delta(m, a, '{base,deletions}') = 1, 'uma exclusão';
  assert public._t_delta(m, a, '{plans,by_kind,free}') = 4, format('free +4, veio %s', public._t_delta(m, a, '{plans,by_kind,free}'));
  assert public._t_delta(m, a, '{plans,by_kind,store}') = 2, 'dois com plano vindo da loja';
  assert public._t_delta(m, a, '{plans,by_kind,partner}') = 2, 'duas parcerias';
  assert public._t_delta(m, a, '{plans,by_kind,trial}') = 1, 'um trial ativo';
  assert public._t_delta(m, a, '{plans,by_kind,inherited}') = 3, 'três herdados';
  assert public._t_delta(m, a, '{plans,paying}') = 5, 'cinco pagam (inclui os alunos que herdam premium e pagam)';
  assert public._t_delta(m, a, '{plans,paying_by,store}') = 3, 'três pela loja';
  assert public._t_delta(m, a, '{plans,paying_by,external}') = 2, 'dois por fora (um deles herda plano maior)';
  assert public._t_delta(m, a, '{plans,by_kind,external}') = 1, 'origem do plano por fora: só o professor';
  assert (m #>> '{plans,external_revenue}')::numeric - coalesce((a #>> '{plans,external_revenue}')::numeric, 0) = 129.90,
    'receita por fora = soma dos valores combinados';
  assert public._t_delta(m, a, '{plans,trial_started}') = 3, 'três fizeram trial';
  assert public._t_delta(m, a, '{plans,trial_converted}') = 1, 'um converteu';
  assert exists (select 1 from json_array_elements(m #> '{plans,store_by_plan}') e
                  where e ->> 'role' = 'aluno' and e ->> 'tier' = 'pro'),
    'aluno pagante entra na receita pelo plano que ele paga (pro)';
  assert public._t_delta(m, a, '{engagement,dau}') = 2, format('ativos hoje +2, veio %s', public._t_delta(m, a, '{engagement,dau}'));
  assert public._t_delta(m, a, '{engagement,wau}') = 3, format('ativos 7d +3, veio %s', public._t_delta(m, a, '{engagement,wau}'));
  assert public._t_delta(m, a, '{ai,total}') = 3, 'três usos de IA';
  assert public._t_delta(m, a, '{ai,by_feature,chat}') = 2, 'dois chats';
  m := public.admin_metrics(v_today - 30, v_today, null, true);
  assert public._t_delta(m, (select m_test from _antes), '{base,total}') = 14, 'com teste +14';
  m := public.admin_metrics(v_today - 30, v_today, 'premium');
  assert public._t_delta(m, (select m_premium from _antes), '{base,total}') = 6,
    'premium = prof + 3 alunos + parceiro + por fora';
  assert public._t_err('select public.admin_metrics(date ''0002-01-01'', current_date)') = 'period_too_long',
    'período absurdo é recusado';
  raise notice 'OK 4: admin_metrics';

  -- [ADM]-05: série diária cobre o período inteiro.
  r := public.admin_timeseries(v_today - 6, v_today);
  assert json_array_length(r) = 7, 'sete dias';
  assert (r -> 6 ->> 'active')::int - ((select ts from _antes) -> 6 ->> 'active')::int = 2,
    'dois ativos a mais no último dia';
  raise notice 'OK 5: admin_timeseries';

  -- [ADM]-06: lista com filtros, ficha e professores do filtro.
  r := public.admin_list_users(p_kind => 'partner', p_search => 'painel-teste');
  assert (r ->> 'total')::int = 2, 'duas parcerias na lista';
  r := public.admin_list_users(p_kind => 'not_free', p_search => 'painel-teste');
  assert (r ->> 'total')::int = 9, format('não-free = 9, veio %s', r ->> 'total');
  r := public.admin_list_users(p_role => 'comum', p_search => 'pagante@');
  assert (r ->> 'total')::int = 1 and r #>> '{users,0,plan_kind}' = 'store', 'busca por e-mail';
  r := public.admin_list_users(p_role => 'professor', p_search => 'prof@painel-teste');
  assert (r #>> '{users,0,students}')::int = 3, 'professor com 3 alunos';
  r := public.admin_user_detail('dddddddd-0000-0000-0000-000000000005');
  assert r #>> '{coach,full_name}' = 'Prof Premium', 'ficha mostra o professor';
  assert r #>> '{user,plan_kind}' = 'inherited', 'ficha mostra a origem do plano';
  assert exists (select 1 from json_array_elements(public.admin_coach_options()) e
                  where e ->> 'name' = 'Prof Premium' and (e ->> 'students')::int = 3),
    'professor no filtro com a contagem de alunos';
  raise notice 'OK 6: admin_list_users / detail / coach_options';

  -- [ADM]-07: uso da IA só em contadores (sucesso/erro), pushes e exclusões.
  r := public.admin_ai_usage(v_today - 1, v_today);
  assert exists (select 1 from json_array_elements(r -> 'by_feature') e
                  where e ->> 'feature' = 'chat' and (e ->> 'error')::int >= 1 and (e ->> 'success')::int >= 1),
    'chat com sucesso e erro contados';
  assert exists (select 1 from json_array_elements(r -> 'codes') e
                  where e ->> 'code' = 'rate_limit' and e ->> 'status' = 'error'), 'código de erro listado';
  assert exists (select 1 from json_array_elements(r -> 'codes') e
                  where e ->> 'code' = 'sanity_fallback_groq_down' and e ->> 'status' = 'success'),
    'sucesso com ressalva listado';
  assert json_array_length(r -> 'daily') = 2, 'série de 2 dias';
  assert (r #>> '{push,sent_ai}')::int >= 1 and (r #>> '{push,skip_reasons,quiet_hours}')::int >= 1, 'pushes contados';
  assert public._t_delta(public.admin_metrics(v_today - 30, v_today), a, '{ai,errors}') = 1, 'um erro de IA no dashboard';
  -- importação de treino com IA passa a ser registrada (antes o insert falhava)
  insert into public.ai_usage_log (user_id, feature, status)
    values ('dddddddd-0000-0000-0000-000000000004', 'coach_import_workout', 'success');
  r := public.admin_deletions(v_today - 1, v_today);
  assert exists (select 1 from json_array_elements(r) e where e ->> 'reason' = 'não usei'), 'exclusão com motivo';
  raise notice 'OK 7: uso da IA, pushes e exclusões';

  -- [ADM]-08: parceria.
  assert public._t_err($q$select public.admin_set_manual_plan('dddddddd-0000-0000-0000-000000000004', 'partner', 'pro')$q$)
    = 'has_store_subscription', 'não sobrescreve assinatura paga';
  assert public._t_err($q$select public.admin_set_manual_plan('dddddddd-0000-0000-0000-000000000012', 'partner', 'pro')$q$)
    = 'has_store_subscription', 'nem a do aluno que herda um plano maior';
  assert public._t_err($q$select public.admin_set_manual_plan('dddddddd-0000-0000-0000-000000000001', 'partner', 'pro', now() - interval '1 day')$q$)
    = 'invalid_until', 'data de fim no passado é recusada';

  r := public.admin_set_manual_plan('dddddddd-0000-0000-0000-000000000001', 'partner', 'premium',
                                    now() + interval '30 days', 'parceria teste');
  assert r ->> 'tier' = 'premium' and r ->> 'via' = 'partner', 'parceria concedida';
  assert (select note from public.subscriptions
           where user_id = 'dddddddd-0000-0000-0000-000000000001') = 'parceria teste', 'guarda a observação';
  -- trial de servidor nunca passa por cima de parceria
  assert public.grant_server_trial('dddddddd-0000-0000-0000-000000000001') = 'skipped_source',
    'grant_server_trial respeita parceria';

  -- vira pago por fora: troca o tipo, guarda o valor
  r := public.admin_set_manual_plan('dddddddd-0000-0000-0000-000000000001', 'external', 'pro',
                                    null, 'Pix mensal', 49.90);
  assert r ->> 'via' = 'external' and r ->> 'tier' = 'pro', 'pago por fora concedido';
  assert (select monthly_amount from public.subscriptions
           where user_id = 'dddddddd-0000-0000-0000-000000000001') = 49.90, 'guarda o valor combinado';
  assert public.grant_server_trial('dddddddd-0000-0000-0000-000000000001') = 'skipped_source',
    'grant_server_trial respeita pago por fora';
  assert public._t_err($q$select public.admin_set_manual_plan('dddddddd-0000-0000-0000-000000000001', 'outro', 'pro')$q$)
    = 'invalid_kind', 'tipo inválido é recusado';

  r := public.admin_revoke_manual_plan('dddddddd-0000-0000-0000-000000000001');
  assert r ->> 'tier' = 'free', 'plano manual encerrado volta a free';
  assert public._t_err($q$select public.admin_revoke_manual_plan('dddddddd-0000-0000-0000-000000000002')$q$)
    = 'not_manual', 'só encerra plano manual';
  raise notice 'OK 8: plano manual (parceria e pago por fora)';

  raise notice 'PAINEL_ADMIN: ALL PASS';
end;
$$;

rollback;
