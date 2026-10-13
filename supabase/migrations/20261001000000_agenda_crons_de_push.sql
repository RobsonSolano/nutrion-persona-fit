-- =====================================================================
-- NutriOn — Agendamento das crons de push que já existiam mas nunca rodaram
--
-- DIAGNÓSTICO (2026-10-01): as edge functions de push estão deployadas desde
-- maio, mas o agendamento era MANUAL no painel (está escrito no cabeçalho de
-- cada função: "Como agendar (painel Supabase → Database → Cron Jobs)"). Só a
-- de inatividade chegou a ser criada. Em 4,5 meses o push_history acumulou:
--
--   inactivity_reminder  212     water_reminder        1
--   coach_unlinked         4     protein_reminder      1
--   daily_workout_check    0     streak_*              0
--
-- Ou seja: lembrete de água e de treino nunca funcionaram de verdade. Por isso
-- o agendamento passa a viver AQUI, versionado, em vez de só no painel.
--
-- SEGREDO: o header X-Cron-Secret é lido do Vault em tempo de execução
-- (`vault.decrypted_secrets`), então o valor não entra no repositório. O
-- segredo precisa existir no Vault com o nome CRON_SECRET — se faltar, o
-- header vai nulo e a função responde 403 (falha visível, não silenciosa).
--
-- HORÁRIOS: o código de cada função documenta o horário pretendido, mas dois
-- deles pediam o MESMO minuto (daily-workout-check e streak-celebrations, ambos
-- 23:30 UTC). Como `_shared/pushAi.ts` recusa dois pushes com menos de
-- GLOBAL_MIN_GAP_MIN = 30 minutos de intervalo, um anularia o outro. Aqui vão
-- espaçados de 45 em 45 minutos, todos dentro da janela permitida — o silêncio
-- (quiet hours) é 22h–7h BRT, então nada pode cair depois das 21h30 BRT.
--
--   18h00 BRT (21:00 UTC)  streak-warning        "sua sequência vai quebrar"
--   19h00 BRT (22:00 UTC)  streak-celebrations   marcos de constância
--   19h45 BRT (22:45 UTC)  water-reminder        abaixo de 50% da meta
--   20h30 BRT (23:30 UTC)  daily-workout-check   dia de treino não registrado
--   21h15 BRT (00:15 UTC)  protein-reminder      abaixo da meta de proteína
--
-- TETO DIÁRIO: `pushAi` limita a 3 pushes/dia por usuário somando TODOS os
-- tipos (GLOBAL_DAILY_MAX). Com 5 crons ligadas, quem for elegível em todas
-- recebe as 3 primeiras do dia e as outras entram como `skipped/rate_limit` no
-- push_history. É o comportamento desejado — o teto existe pra não espantar o
-- usuário —, mas vale saber ao ler os relatórios.
--
-- TIMEOUT: net.http_post no Supabase Cron tem teto de 5000ms. As funções são
-- tratadas como fire-and-forget: o cron dispara e não espera o resultado; a
-- auditoria do que foi enviado é o push_history.
--
-- Idempotente: cada job é removido pelo nome (no-op se não existir) antes de
-- ser recriado, então rodar a migration de novo não duplica agendamento.
-- =====================================================================

do $$
declare
  projeto_url text := 'https://lqmxspapqkwmvwsxkkeh.supabase.co';
  job record;
  agendamentos text[][] := array[
    ['nutrion-streak-warning',      '0 21 * * *',  'cron-streak-warning'],
    ['nutrion-streak-celebrations', '0 22 * * *',  'cron-streak-celebrations'],
    ['nutrion-water-reminder',      '45 22 * * *', 'cron-water-reminder'],
    ['nutrion-daily-workout-check', '30 23 * * *', 'cron-daily-workout-check'],
    ['nutrion-protein-reminder',    '15 0 * * *',  'cron-protein-reminder']
  ];
  i int;
  nome text;
  horario text;
  funcao text;
begin
  -- O stack local nem sempre tem pg_cron/pg_net habilitados. Sem a guarda, um
  -- `supabase db reset` quebraria pra todo mundo por causa de agendamento que
  -- só faz sentido no projeto hospedado.
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron/pg_net indisponíveis — agendamento de push pulado (esperado em ambiente local).';
    return;
  end if;

  for i in 1 .. array_length(agendamentos, 1) loop
    nome    := agendamentos[i][1];
    horario := agendamentos[i][2];
    funcao  := agendamentos[i][3];

    -- Remove pelo nome. Usa o jobid porque cron.unschedule(text) estoura
    -- quando o job não existe, e aqui o normal é não existir ainda.
    for job in select jobid from cron.job where jobname = nome loop
      perform cron.unschedule(job.jobid);
    end loop;

    perform cron.schedule(
      nome,
      horario,
      format(
        $cmd$
        select net.http_post(
          url := %L,
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
          timeout_milliseconds := 5000
        );
        $cmd$,
        projeto_url || '/functions/v1/' || funcao
      )
    );
  end loop;
end $$;

comment on schema public is
  'NutriOn. Crons de push agendadas em 20261001000000_agenda_crons_de_push.sql — o segredo vem do Vault (CRON_SECRET), não do arquivo.';
