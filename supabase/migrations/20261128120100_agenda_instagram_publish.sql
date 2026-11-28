-- =====================================================================
-- Persona Fit — Agenda a publicação do Instagram (cron-instagram-publish)
-- Spec: .specs/features/2026-11-28-instagram-autopost (IG-02, IG-04)
--
-- A cada 15 min, no padrão dos `nutrion-*`: o segredo é lido do Vault em
-- tempo de execução, nada fica no repositório nem em `cron.job`. O horário de
-- cada post é da linha da fila; este job só olha o que venceu.
--
-- 60s de timeout: um carrossel cria até 11 containers e espera cada um ficar
-- pronto na Meta antes de publicar.
--
-- Idempotente: remove pelo nome antes de recriar.
-- =====================================================================

do $$
declare
  job record;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron/pg_net indisponíveis — agendamento do Instagram pulado (esperado em ambiente local).';
    return;
  end if;

  for job in select jobid from cron.job where jobname = 'nutrion-instagram-publish' loop
    perform cron.unschedule(job.jobid);
  end loop;

  -- Minutos 1, 16, 31 e 46: fora do minuto cheio, mas logo depois de 10h, 12h e
  -- 19h (o post sai até 1 min depois do horário da fila).
  perform cron.schedule(
    'nutrion-instagram-publish',
    '1,16,31,46 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://lqmxspapqkwmvwsxkkeh.supabase.co/functions/v1/cron-instagram-publish',
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
      timeout_milliseconds := 60000
    );
    $cmd$
  );
end $$;
