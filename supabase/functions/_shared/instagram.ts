// Publicação no Instagram pela Graph API (Content Publishing).
//
// POR QUE EXISTE: o @personafitapp publica 1 post e 2 stories por dia a partir
// da fila `instagram_posts` (spec .specs/features/2026-11-28-instagram-autopost).
// A Meta não tem agendamento nativo: o cron chama a function, que usa isto.
//
// Fluxo da Meta: cria um "container" por imagem (URL pública, JPEG), espera o
// container ficar FINISHED e publica. Carrossel = um container por item
// (is_carousel_item) + um container pai com a legenda. Story = media_type
// STORIES, sem legenda. A API não coloca figurinha em story.
//
// A forma da linha (tipo × slot, quantidade de imagens, legenda) é garantida
// pelos CHECKs da tabela e pré-checada pelo script de carga: aqui não se
// valida de novo.
//
// Sem import externo de propósito: fica testável no vitest (fetch injetado).

export const GRAPH_VERSION = 'v27.0';

/** Linha vencida há mais que isto não é publicada (evita post fora de hora
 *  depois de uma pane longa): vira `skipped` e os admins são avisados. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type PostKind = 'image' | 'carousel' | 'story';

export type QueueRow = {
  id: string;
  scheduled_for: string;
  slot: string;
  kind: PostKind;
  media_paths: string[];
  caption: string | null;
};

export type PublishDeps = {
  igUserId: string;
  token: string;
  /** Base pública do bucket, sem barra no fim (…/object/public/instagram). */
  mediaBaseUrl: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  maxPolls?: number;
  pollMs?: number;
};

export type PublishResult = { mediaId: string; permalink: string | null };

export class GraphError extends Error {
  override name = 'GraphError';
}

export function isStale(row: QueueRow, now: Date): boolean {
  return now.getTime() - new Date(row.scheduled_for).getTime() > STALE_AFTER_MS;
}

export async function publishPost(row: QueueRow, deps: PublishDeps): Promise<PublishResult> {
  const g = graph(deps);
  const url = (path: string) => `${deps.mediaBaseUrl}/${path.replace(/^\/+/, '')}`;
  const media = `${deps.igUserId}/media`;
  const caption: Record<string, string> = row.caption ? { caption: row.caption } : {};

  let creationId: string;
  if (row.kind === 'carousel') {
    // Os itens são independentes: cria e espera todos ao mesmo tempo.
    const children = await Promise.all(
      row.media_paths.map(async (p) => (await g.post(media, { image_url: url(p), is_carousel_item: 'true' })).id),
    );
    await Promise.all(children.map((id) => waitFinished(g, id, deps)));
    creationId = (await g.post(media, { media_type: 'CAROUSEL', children: children.join(','), ...caption })).id;
  } else {
    creationId = (await g.post(media, {
      image_url: url(row.media_paths[0]),
      ...(row.kind === 'story' ? { media_type: 'STORIES' } : caption),
    })).id;
  }

  await waitFinished(g, creationId, deps);
  const published = await g.post(`${deps.igUserId}/media_publish`, { creation_id: creationId });
  const info = await g.get(published.id, 'permalink').catch(() => ({ permalink: null }));
  return { mediaId: published.id, permalink: info.permalink ?? null };
}

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

function graph(deps: PublishDeps) {
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;
  const parse = async (res: Response): Promise<Json> => {
    const body = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok || body.error) {
      throw new GraphError(body.error?.error_user_msg || body.error?.message || `HTTP ${res.status}`);
    }
    return body;
  };
  return {
    post: async (path: string, params: Record<string, string>) =>
      parse(await deps.fetch(`${base}/${path}`, {
        method: 'POST',
        body: new URLSearchParams({ ...params, access_token: deps.token }),
      })),
    get: async (id: string, fields: string) =>
      parse(await deps.fetch(`${base}/${id}?${new URLSearchParams({ fields, access_token: deps.token })}`)),
  };
}

async function waitFinished(g: ReturnType<typeof graph>, id: string, deps: PublishDeps): Promise<void> {
  const max = deps.maxPolls ?? 20;
  for (let i = 0; i < max; i++) {
    const { status_code } = await g.get(id, 'status_code');
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      throw new GraphError(`O container ${id} ficou ${status_code} na Meta`);
    }
    await deps.sleep(deps.pollMs ?? 3000);
  }
  throw new GraphError(`timeout: o container ${id} não ficou pronto`);
}
