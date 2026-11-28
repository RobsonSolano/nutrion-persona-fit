-- =====================================================================
-- Persona Fit — Publicação do Instagram a cada 5 min, só quando há post
-- Spec: .specs/features/2026-11-28-instagram-autopost (IG-02, IG-04)
--
-- Substitui o agendamento de 20261128120100 (a cada 15 min, nos minutos
-- 1/16/31/46, que dependia dos horários padrão 10h/12h/19h). Agora:
--   - roda a cada 5 min: qualquer horário da fila sai em até 5 min;
--   - só chama a edge function quando há linha pendente vencida (o EXISTS usa
--     o índice parcial instagram_posts_pendentes). Sem post, nada de HTTP.
--
-- Segredo lido do Vault em tempo de execução (padrão `nutrion-*`).
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

  -- 60s de timeout: um carrossel cria até 11 containers e espera ficarem prontos.
  perform cron.schedule(
    'nutrion-instagram-publish',
    '*/5 * * * *',
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
    )
    where exists (
      select 1 from public.instagram_posts
       where status = 'pending' and scheduled_for <= now()
    );
    $cmd$
  );
end $$;
