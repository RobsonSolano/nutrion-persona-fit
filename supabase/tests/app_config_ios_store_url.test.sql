-- =====================================================================
-- Teste de app_config.ios_store_url ([IOS]-09). Transacional + ROLLBACK.
--   docker exec -i supabase_db_nutrion psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/app_config_ios_store_url.test.sql
-- Saída esperada: NOTICE "APP_CONFIG_IOS: ALL PASS".
-- =====================================================================
begin;

do $$
declare
  t text;
begin
  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'app_config' and column_name = 'ios_store_url';
  assert t = 'text', format('ios_store_url deveria ser text, é %s', t);

  -- anon precisa de permissão na coluna (falha com "permission denied" se faltar)
  set local role anon;
  perform ios_store_url from public.app_config limit 1;
  reset role;

  raise notice 'APP_CONFIG_IOS: ALL PASS';
end;
$$;

rollback;
