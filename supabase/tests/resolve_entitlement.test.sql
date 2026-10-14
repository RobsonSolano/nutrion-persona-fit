-- =====================================================================
-- Teste do RPC _resolve_entitlement (billing-core, [BILL]-04,05,06)
-- Transacional + ROLLBACK: não polui o banco. Rodar contra o LOCAL:
--   supabase start   (use `npx supabase@latest start` se o seu CLI pinado falhar
--                      no sync de vector buckets)
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/resolve_entitlement.test.sql
-- Saída esperada ao final: NOTICE "RESOLVE_ENTITLEMENT: ALL PASS".
--
-- Nota: o seeding usa `session_replication_role = replica` p/ bypassar os
-- triggers do schema real (on_auth_user_created cria profile sozinho;
-- profiles_guard_role_changes bloqueia setar role) e a FK p/ auth.users.
-- O RPC só LÊ profiles/subscriptions, então isso não afeta o que se testa.
-- =====================================================================
begin;
set local session_replication_role = replica;

-- profiles (role + coach_id + user_number). is_early_adopter é gerado de user_number.
-- user_number alto (9xxx) = NÃO early; 5 = early.
insert into public.profiles (id, role, coach_id, user_number) values
  ('aaaaaaaa-0000-0000-0000-000000000001','comum',     null, 9001), -- comum free
  ('aaaaaaaa-0000-0000-0000-000000000002','comum',     null, 9002), -- comum grandfather
  ('aaaaaaaa-0000-0000-0000-000000000003','comum',     null, 9003), -- comum trial ativo
  ('aaaaaaaa-0000-0000-0000-000000000004','comum',     null, 9004), -- comum trial expirado
  ('aaaaaaaa-0000-0000-0000-000000000005','comum',     null, 5),    -- comum early adopter
  ('aaaaaaaa-0000-0000-0000-000000000006','professor', null, 9006), -- prof grandfather
  ('aaaaaaaa-0000-0000-0000-000000000007','professor', null, 9007), -- prof pro
  ('aaaaaaaa-0000-0000-0000-000000000008','professor', null, 9008), -- prof premium
  ('aaaaaaaa-0000-0000-0000-000000000009','aluno','aaaaaaaa-0000-0000-0000-000000000007', 9009), -- aluno de prof pro
  ('aaaaaaaa-0000-0000-0000-000000000010','professor', null, 9010), -- prof free (sem sub)
  ('aaaaaaaa-0000-0000-0000-000000000011','aluno','aaaaaaaa-0000-0000-0000-000000000010', 9011), -- aluno de prof free
  ('aaaaaaaa-0000-0000-0000-000000000012','aluno',     null, 9012), -- aluno sem coach
  ('aaaaaaaa-0000-0000-0000-000000000013','comum',     null, 9013), -- store cancelado dentro do período
  ('aaaaaaaa-0000-0000-0000-000000000014','comum',     null, 9014); -- store expirado

insert into public.subscriptions (user_id, tier, source, status, trial_end, period_end) values
  ('aaaaaaaa-0000-0000-0000-000000000002','free',   'grandfather', 'active',   null, null),
  ('aaaaaaaa-0000-0000-0000-000000000003','pro',    'server_trial','in_trial', now() + interval '7 days', null),
  ('aaaaaaaa-0000-0000-0000-000000000004','pro',    'server_trial','in_trial', now() - interval '1 day',  null),
  ('aaaaaaaa-0000-0000-0000-000000000006','free',   'grandfather', 'active',   null, null),
  ('aaaaaaaa-0000-0000-0000-000000000007','pro',    'store_play',  'active',   null, now() + interval '20 days'),
  ('aaaaaaaa-0000-0000-0000-000000000008','premium','store_play',  'active',   null, now() + interval '20 days'),
  ('aaaaaaaa-0000-0000-0000-000000000013','pro',    'store_play',  'canceled', null, now() + interval '5 days'),
  ('aaaaaaaa-0000-0000-0000-000000000014','pro',    'store_play',  'canceled', null, now() - interval '1 day');
-- u1, u5, u9, u10, u11, u12 sem linha de subscription (free/none por ausência).

-- Asserções: loop sobre (uid, campo, esperado).
do $$
declare
  rec record;
  actual text;
  fail int := 0;
begin
  for rec in select * from (values
    ('aaaaaaaa-0000-0000-0000-000000000001'::uuid,'ai_personal','false'),
    ('aaaaaaaa-0000-0000-0000-000000000001'::uuid,'tier','free'),
    ('aaaaaaaa-0000-0000-0000-000000000001'::uuid,'source','none'),
    ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,'ai_personal','true'),
    ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,'ai_coach','false'),
    ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,'ai_personal','true'),
    ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,'source','server_trial'),
    ('aaaaaaaa-0000-0000-0000-000000000004'::uuid,'ai_personal','false'),
    ('aaaaaaaa-0000-0000-0000-000000000004'::uuid,'tier','free'),
    ('aaaaaaaa-0000-0000-0000-000000000005'::uuid,'ai_personal','true'),
    ('aaaaaaaa-0000-0000-0000-000000000006'::uuid,'ai_personal','true'),
    ('aaaaaaaa-0000-0000-0000-000000000006'::uuid,'ai_coach','false'),
    ('aaaaaaaa-0000-0000-0000-000000000006'::uuid,'student_limit','2'),
    ('aaaaaaaa-0000-0000-0000-000000000007'::uuid,'ai_coach','true'),
    ('aaaaaaaa-0000-0000-0000-000000000007'::uuid,'student_limit','5'),
    ('aaaaaaaa-0000-0000-0000-000000000008'::uuid,'ai_coach','true'),
    ('aaaaaaaa-0000-0000-0000-000000000008'::uuid,'student_limit','<null>'),
    ('aaaaaaaa-0000-0000-0000-000000000009'::uuid,'ai_personal','true'),
    ('aaaaaaaa-0000-0000-0000-000000000009'::uuid,'ai_coach','false'),
    ('aaaaaaaa-0000-0000-0000-000000000010'::uuid,'ai_personal','false'),
    ('aaaaaaaa-0000-0000-0000-000000000010'::uuid,'student_limit','2'),
    ('aaaaaaaa-0000-0000-0000-000000000011'::uuid,'ai_personal','false'),
    ('aaaaaaaa-0000-0000-0000-000000000012'::uuid,'ai_personal','false'),
    ('aaaaaaaa-0000-0000-0000-000000000013'::uuid,'ai_personal','true'),
    ('aaaaaaaa-0000-0000-0000-000000000013'::uuid,'tier','pro'),
    ('aaaaaaaa-0000-0000-0000-000000000014'::uuid,'ai_personal','false'),
    ('aaaaaaaa-0000-0000-0000-000000000014'::uuid,'tier','free')
  ) as t(uid, field, expected)
  loop
    actual := coalesce(public._resolve_entitlement(rec.uid) ->> rec.field, '<null>');
    if actual is distinct from rec.expected then
      raise warning 'FAIL % % → got %, expected %', rec.uid, rec.field, actual, rec.expected;
      fail := fail + 1;
    end if;
  end loop;

  if fail > 0 then
    raise exception 'RESOLVE_ENTITLEMENT: % asserção(ões) falharam', fail;
  end if;
  raise notice 'RESOLVE_ENTITLEMENT: ALL PASS';
end $$;

rollback;
