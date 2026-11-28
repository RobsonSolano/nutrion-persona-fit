// Persona Fit — carrega a fila do Instagram a partir das artes do Figma.
// Spec: .specs/features/2026-11-28-instagram-autopost (IG-05)
//
// Lê um manifesto (scripts/data/instagram/*.json) com dia → feed e stories,
// exporta cada arte do Figma em JPEG pela API REST (não usa a cota do MCP) ou
// usa um JPEG local (`files`, caminho relativo ao manifesto),
// sobe no bucket público `instagram` e cria/atualiza as linhas de
// `instagram_posts`. A edge function cron-instagram-publish publica depois.
//
// Uso:
//   npm run instagram:fila -- scripts/data/instagram/2026-11-29.json
//   npm run instagram:fila -- <manifesto> --dry-run   (só mostra o plano)
//
// Requer no .env.local: FIGMA_TOKEN (só quando há artes do Figma; token pessoal de leitura),
// EXPO_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
//
// Idempotente: linha pendente é atualizada, linha já publicada (ou em
// publicação, falha, pulada) não é tocada. Rodar de novo não duplica.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { planQueue } from './lib/instagramFila.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Uso: npm run instagram:fila -- <manifesto.json> [--dry-run]');
  process.exit(1);
}

const { EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE, FIGMA_TOKEN } = process.env;
const missing = [
  ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE],
].filter(([, v]) => !v).map(([k]) => k);
const manifest = JSON.parse(readFileSync(file, 'utf8'));
const needsFigma = !dryRun && manifest.posts.some((p) => p.figma);
if (needsFigma && !FIGMA_TOKEN) missing.push('FIGMA_TOKEN');
if (missing.length) {
  console.error(`❌ Faltam no .env.local: ${missing.join(', ')}. Nada foi alterado.`);
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const dates = [...new Set(manifest.posts.map((p) => p.date))];
const { data: existing, error } = await supabase
  .from('instagram_posts')
  .select('post_date, slot, status')
  .in('post_date', dates);
if (error) throw error;

const plan = planQueue(manifest, existing ?? []);
for (const p of plan) {
  console.log(`${p.action.padEnd(6)} ${p.row.scheduled_for}  ${p.row.slot.padEnd(7)} ${p.row.kind.padEnd(8)} ${p.sources.refs.length} ${p.sources.type}`);
}
if (dryRun) {
  console.log('\n(dry-run: nada foi exportado nem gravado)');
  process.exit(0);
}

const todo = plan.filter((p) => p.action !== 'keep');
if (todo.length === 0) {
  console.log('\nNada a fazer.');
  process.exit(0);
}

// Exporta todas as artes do Figma de uma vez (a API aceita vários ids).
const ids = [...new Set(todo.filter((p) => p.sources.type === 'figma').flatMap((p) => p.sources.refs))];
let exported = { images: {} };
if (ids.length) {
  const res = await fetch(
    `https://api.figma.com/v1/images/${manifest.figmaFileKey}?ids=${encodeURIComponent(ids.join(','))}&format=jpg&scale=1`,
    { headers: { 'X-Figma-Token': FIGMA_TOKEN } },
  );
  exported = await res.json();
  if (!res.ok || exported.err) throw new Error(`Figma: ${exported.err ?? res.status}`);
}

async function bytesOf(type, ref) {
  if (type === 'files') return readFileSync(resolve(dirname(file), ref));
  const url = exported.images?.[ref];
  if (!url) throw new Error(`Figma não exportou a arte ${ref}`);
  // O download do Figma (S3) às vezes derruba a conexão no meio: tenta 3 vezes.
  for (let tentativa = 1; ; tentativa++) {
    try {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`HTTP ${img.status}`);
      return Buffer.from(await img.arrayBuffer());
    } catch (err) {
      if (tentativa === 3) throw new Error(`Download da arte ${ref}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }
}

for (const p of todo) {
  for (const [i, ref] of p.sources.refs.entries()) {
    const { error: upErr } = await supabase.storage
      .from('instagram')
      .upload(p.row.media_paths[i], await bytesOf(p.sources.type, ref), { contentType: 'image/jpeg', upsert: true });
    if (upErr) throw upErr;
  }
  const { error: dbErr } = await supabase
    .from('instagram_posts')
    .upsert(p.row, { onConflict: 'post_date,slot' });
  if (dbErr) throw dbErr;
  console.log(`✅ ${p.row.slot} de ${p.row.scheduled_for.slice(0, 10)} na fila`);
}
