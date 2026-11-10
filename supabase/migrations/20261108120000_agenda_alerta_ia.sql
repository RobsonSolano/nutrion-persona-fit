-- =====================================================================
-- Persona Fit — Agenda o alerta de IA (cron-ai-quota-alert) e remove os
-- agendamentos manuais quebrados.
--
-- DIAGNÓSTICO (2026-11-10, hotfix 1.28.3): o job `cron-ai-quota-alert` foi
-- criado à mão no painel com o Authorization e o X-Cron-Secret colados no
-- comando — e uma quebra de linha no meio do token deixou o JSON dos headers
-- inválido. Ele falhou em TODAS as execuções (72 em 3 dias, `invalid input
-- syntax for type json`) e o alerta nunca rodou. Os `cron-*` de push criados
-- do mesmo jeito têm o mesmo defeito; os que valem são os `nutrion-*` de
-- 20261001000000. Além de inúteis, os quebrados guardam o service role key e
-- o CRON_SECRET em texto puro em `cron.job`.
--
-- Aqui: o alerta passa a ser agendado como os `nutrion-*` (segredo lido do
-- Vault em tempo de execução, nada no repositório) e os `cron-*` quebrados são
-- removidos. `cron-inactivity-reminders` NÃO é tocado: ele roda (é o único com
-- JSON válido), e o par dele com `inactivity-reminders-daily` está no backlog.
--
-- A function precisa de `verify_jwt = false` (supabase/config.toml), senão o
-- gateway responde 401 antes dela — o pg_cron não manda JWT.
--
-- Timestamp antes de 20261109120000 de propósito: aquela migration ainda vive
-- na feature/publicacao-ios, e `db push` recusa migration mais antiga que a
-- última aplicada.
--
-- Idempotente: remove pelo nome antes de recriar.
-- =====================================================================

do $$
declare
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron/pg_net indisponíveis — agendamento do alerta pulado (esperado em ambiente local).';
    return;
  end if;

  for job in
    select jobid from cron.job
     where jobname in (
       'cron-ai-quota-alert',
       'cron-daily-workout-check',
       'cron-protein-reminder',
       'cron-streak-celebrations',
       'cron-streak-warning',
       'cron-water-reminder',
       'nutrion-ai-quota-alert'
     )
  loop
    perform cron.unschedule(job.jobid);
  end loop;

  -- De hora em hora, no minuto 5 (fora do minuto cheio dos outros crons).
  -- 30s de timeout: o alerta manda e-mail por SMTP, que leva alguns segundos.
  perform cron.schedule(
    'nutrion-ai-quota-alert',
    '5 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://lqmxspapqkwmvwsxkkeh.supabase.co/functions/v1/cron-ai-quota-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'CRON_SECRET'
           limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cmd$
  );
end $$;
