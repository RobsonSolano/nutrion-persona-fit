// Lógica pura da carga da fila do Instagram (scripts/instagram-fila.mjs).
// Spec: .specs/features/2026-11-28-instagram-autopost (IG-04, IG-05)
//
// Separada do script para ficar testável sem Figma nem Supabase.

/** Horários padrão em Brasília (sem horário de verão desde 2019). */
export const DEFAULT_TIMES = { feed: '12:00', 'story-1': '10:00', 'story-2': '19:00' };

const FEED_KINDS = ['image', 'carousel'];

export function scheduledFor(date, slot, time) {
  const hhmm = time ?? DEFAULT_TIMES[slot];
  if (!hhmm) throw new Error(`Slot desconhecido: ${slot}`);
  return `${date}T${hhmm}:00-03:00`;
}

export function storagePaths(date, slot, count) {
  return Array.from({ length: count }, (_, i) => `posts/${date}-${slot}/${i + 1}.jpg`);
}

function validate(post) {
  const where = `${post.date} ${post.slot}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date ?? '')) throw new Error(`${where}: data inválida`);
  if (!(post.slot in DEFAULT_TIMES)) throw new Error(`${where}: slot inválido`);
  const isStory = post.kind === 'story';
  if (!isStory && !FEED_KINDS.includes(post.kind)) throw new Error(`${where}: tipo inválido (${post.kind})`);
  if (isStory !== (post.slot !== 'feed')) throw new Error(`${where}: story vai em story-1/story-2, post vai no feed`);
  if (post.figma && post.files) throw new Error(`${where}: use figma ou files, não os dois`);
  const n = (post.figma ?? post.files)?.length ?? 0;
  if (post.kind === 'carousel' && (n < 2 || n > 10)) throw new Error(`${where}: carrossel precisa de 2 a 10 artes`);
  if (post.kind !== 'carousel' && n !== 1) throw new Error(`${where}: precisa de exatamente 1 arte`);
  if (isStory && post.caption) throw new Error(`${where}: story não tem legenda`);
  const caption = post.caption ?? '';
  if (caption.length > 2200) throw new Error(`${where}: legenda acima de 2.200 caracteres`);
  // Limite da Meta que a tabela não checa: barra aqui, antes de subir imagem.
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > 30) throw new Error(`${where}: ${tags.length} hashtags (máximo 30)`);
}

/**
 * Decide o que fazer com cada post do manifesto, dado o que já existe na fila
 * (linhas com post_date, slot e status). `update` só para linha ainda
 * pendente; qualquer outro estado fica intocado (`keep`).
 */
export function planQueue(manifest, existing) {
  const seen = new Set();
  for (const post of manifest.posts) {
    validate(post);
    const key = `${post.date}|${post.slot}`;
    if (seen.has(key)) throw new Error(`${post.date} ${post.slot}: repetido no manifesto`);
    seen.add(key);
  }
  const byKey = new Map(existing.map((r) => [`${r.post_date}|${r.slot}`, r]));
  return manifest.posts.map((post) => {
    const current = byKey.get(`${post.date}|${post.slot}`);
    const action = !current ? 'create' : current.status === 'pending' ? 'update' : 'keep';
    const sources = post.files ? { type: 'files', refs: post.files } : { type: 'figma', refs: post.figma };
    return {
      action,
      sources,
      row: {
        scheduled_for: scheduledFor(post.date, post.slot, post.time),
        slot: post.slot,
        kind: post.kind,
        media_paths: storagePaths(post.date, post.slot, sources.refs.length),
        caption: post.caption ?? null,
      },
    };
  });
}
