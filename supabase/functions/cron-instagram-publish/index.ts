// Persona Fit — Edge Function cron-instagram-publish
// Spec: .specs/features/2026-11-28-instagram-autopost (IG-02, IG-04)
//
// Chamada pelo pg_cron (job nutrion-instagram-publish, a cada 5 min, só quando
// há linha vencida). Publica
// no @personafitapp as linhas de `instagram_posts` que já venceram: 1 feed às
// 12h e 2 stories (10h e 19h), horário de Brasília. O horário é da linha, não
// daqui. Linha vencida há mais de STALE_AFTER_MS vira `skipped`; erro da Meta
// vira `failed`. Nos dois casos os admins recebem um aviso (e-mail + push) no
// fim da execução, com todas as ocorrências juntas. Sem nova tentativa
// automática: um post fora de hora é pior do que um post a menos.
//
// Secrets: INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN (token de Página, sem
// expiração), CRON_SECRET, e os de e-mail do adminAlert.

import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { alertAdmins } from '../_shared/adminAlert.ts';
import { STALE_AFTER_MS, isStale, publishPost, type QueueRow } from '../_shared/instagram.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CRON_SECRET = Deno.env.get('CRON_SECRET');
const IG_USER_ID = Deno.env.get('INSTAGRAM_USER_ID');
const IG_TOKEN = Deno.env.get('INSTAGRAM_ACCESS_TOKEN');

/** Por execução. Em dia normal vence no máximo 1 linha por vez. */
const BATCH = 5;

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!CRON_SECRET) return json({ error: 'missing_cron_secret' }, 500);
  if (req.headers.get('X-Cron-Secret') !== CRON_SECRET) return json({ error: 'forbidden' }, 403);
  if (!SERVICE_ROLE_KEY) return json({ error: 'missing_service_role' }, 500);
  if (!IG_USER_ID || !IG_TOKEN) return json({ error: 'missing_instagram_secret' }, 500);

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date();

  const { data: due, error } = await supa
    .from('instagram_posts')
    .select('id, scheduled_for, slot, kind, media_paths, caption')
    .eq('status', 'pending')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for')
    .limit(BATCH);
  if (error) return json({ error: 'queue_fetch_failed', detail: error.message }, 500);

  const results: Array<{ id: string; slot: string; outcome: string; detail?: string }> = [];
  const problems: string[] = [];
  for (const row of (due ?? []) as QueueRow[]) {
    const stale = isStale(row, now);

    // Troca atômica: se outra execução já pegou a linha, o update não casa.
    const { data: claimed, error: claimErr } = await supa
      .from('instagram_posts')
      .update({ status: stale ? 'skipped' : 'publishing' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id');
    if (claimErr || !claimed?.length) continue;

    if (stale) {
      problems.push(`${label(row)}: não saiu no horário e venceu há mais de ${STALE_AFTER_MS / 3_600_000} horas (ficou "skipped").`);
      results.push({ id: row.id, slot: row.slot, outcome: 'skipped' });
      continue;
    }

    try {
      const res = await publishPost(row, {
        igUserId: IG_USER_ID,
        token: IG_TOKEN,
        mediaBaseUrl: `${SUPABASE_URL}/storage/v1/object/public/instagram`,
        fetch,
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      });
      await supa
        .from('instagram_posts')
        .update({
          status: 'published',
          ig_media_id: res.mediaId,
          permalink: res.permalink,
          published_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', row.id);
      results.push({ id: row.id, slot: row.slot, outcome: 'published', detail: res.permalink ?? undefined });
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      console.error('[cron-instagram-publish] falha:', row.id, msg);
      await supa.from('instagram_posts').update({ status: 'failed', error: msg }).eq('id', row.id);
      problems.push(`${label(row)}: não foi publicado. Motivo: ${msg}`);
      results.push({ id: row.id, slot: row.slot, outcome: 'failed', detail: msg });
    }
  }

  // Um aviso só por execução, depois de publicar: o e-mail não atrasa post.
  if (problems.length) {
    await alertAdmins(supa, 'Instagram: publicação com problema', problems.join(' '), { kind: 'instagram_problem' });
  }

  return json({ ok: true, checked: due?.length ?? 0, results });
});

function label(row: QueueRow): string {
  const when = new Date(row.scheduled_for).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const what = row.slot === 'feed' ? 'Post do feed' : `Story (${row.slot})`;
  return `${what} de ${when}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
