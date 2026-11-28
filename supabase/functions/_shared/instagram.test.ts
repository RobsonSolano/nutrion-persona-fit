import { describe, expect, it } from 'vitest';
import { STALE_AFTER_MS, GraphError, isStale, publishPost, type QueueRow } from './instagram.ts';

const BASE = 'https://exemplo.supabase.co/storage/v1/object/public/instagram';

function row(over: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 'r1',
    scheduled_for: '2026-11-29T15:00:00Z',
    slot: 'feed',
    kind: 'image',
    media_paths: ['posts/2026-11-29-feed/1.jpg'],
    caption: 'Legenda',
    ...over,
  };
}

type Call = { method: string; url: string; params: Record<string, string> };

/** Graph API de mentira: grava cada chamada e responde conforme a rota. */
function fakeGraph(opts: { statusSeq?: string[]; publishError?: string } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const statusSeq = [...(opts.statusSeq ?? ['FINISHED'])];
  const fetchFn = async (input: string, init?: { method?: string; body?: URLSearchParams }) => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    const params = Object.fromEntries(
      method === 'POST' ? new URLSearchParams(init?.body?.toString()) : url.searchParams,
    );
    calls.push({ method, url: url.pathname, params });
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (method === 'POST' && url.pathname.endsWith('/media_publish')) {
      if (opts.publishError) {
        return new Response(JSON.stringify({ error: { message: opts.publishError, code: 9007 } }), { status: 400 });
      }
      return reply({ id: 'MEDIA_FINAL' });
    }
    if (method === 'POST' && url.pathname.endsWith('/media')) return reply({ id: `C${++n}` });
    if (params.fields === 'status_code') return reply({ status_code: statusSeq.shift() ?? 'FINISHED' });
    if (params.fields === 'permalink') return reply({ permalink: 'https://www.instagram.com/p/X/' });
    return new Response('{}', { status: 404 });
  };
  return { calls, fetchFn };
}

const deps = (fetchFn: unknown) => ({
  igUserId: 'IG1',
  token: 'TOKEN',
  mediaBaseUrl: BASE,
  fetch: fetchFn as typeof fetch,
  sleep: async () => {},
});

describe('IG-02 atraso', () => {
  const now = new Date('2026-11-29T15:10:00Z');
  it('test_IG02_linha_vencida_recente_publica', () => {
    expect(isStale(row(), now)).toBe(false);
  });
  it('test_IG02_linha_vencida_ha_mais_de_6h_pula', () => {
    const old = new Date(now.getTime() - STALE_AFTER_MS - 60_000).toISOString();
    expect(isStale(row({ scheduled_for: old }), now)).toBe(true);
  });
});

describe('IG-02 publicação', () => {
  it('test_IG02_imagem_cria_container_com_legenda_e_publica', async () => {
    const g = fakeGraph();
    const res = await publishPost(row(), deps(g.fetchFn));
    expect(res).toEqual({ mediaId: 'MEDIA_FINAL', permalink: 'https://www.instagram.com/p/X/' });
    const create = g.calls.find((c) => c.method === 'POST' && c.url.endsWith('/IG1/media'))!;
    expect(create.params.image_url).toBe(`${BASE}/posts/2026-11-29-feed/1.jpg`);
    expect(create.params.caption).toBe('Legenda');
    expect(create.params.access_token).toBe('TOKEN');
    const pub = g.calls.find((c) => c.url.endsWith('/media_publish'))!;
    expect(pub.params.creation_id).toBe('C1');
  });

  it('test_IG02_carrossel_cria_filhos_na_ordem_e_um_pai_com_legenda', async () => {
    const g = fakeGraph();
    const paths = ['a/1.jpg', 'a/2.jpg', 'a/3.jpg'];
    await publishPost(row({ kind: 'carousel', media_paths: paths }), deps(g.fetchFn));
    const creates = g.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/IG1/media'));
    expect(creates.slice(0, 3).map((c) => c.params.image_url)).toEqual(paths.map((p) => `${BASE}/${p}`));
    expect(creates.slice(0, 3).every((c) => c.params.is_carousel_item === 'true' && !c.params.caption)).toBe(true);
    const parent = creates[3];
    expect(parent.params.media_type).toBe('CAROUSEL');
    expect(parent.params.children).toBe('C1,C2,C3');
    expect(parent.params.caption).toBe('Legenda');
    expect(g.calls.find((c) => c.url.endsWith('/media_publish'))!.params.creation_id).toBe('C4');
  });

  it('test_IG02_story_usa_media_type_stories_sem_legenda', async () => {
    const g = fakeGraph();
    await publishPost(row({ kind: 'story', slot: 'story-1', caption: null }), deps(g.fetchFn));
    const create = g.calls.find((c) => c.method === 'POST' && c.url.endsWith('/IG1/media'))!;
    expect(create.params.media_type).toBe('STORIES');
    expect(create.params.caption).toBeUndefined();
  });

  it('test_IG02_espera_o_container_ficar_pronto_antes_de_publicar', async () => {
    const g = fakeGraph({ statusSeq: ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED'] });
    await publishPost(row(), deps(g.fetchFn));
    const polls = g.calls.filter((c) => c.params.fields === 'status_code');
    expect(polls).toHaveLength(3);
    const idxPublish = g.calls.findIndex((c) => c.url.endsWith('/media_publish'));
    const idxLastPoll = g.calls.lastIndexOf(polls[2]);
    expect(idxPublish).toBeGreaterThan(idxLastPoll);
  });

  it('test_IG02_container_com_erro_falha_sem_publicar', async () => {
    const g = fakeGraph({ statusSeq: ['ERROR'] });
    await expect(publishPost(row(), deps(g.fetchFn))).rejects.toThrow(/container/);
    expect(g.calls.some((c) => c.url.endsWith('/media_publish'))).toBe(false);
  });

  it('test_IG02_container_que_nunca_fica_pronto_falha_por_timeout', async () => {
    const g = fakeGraph({ statusSeq: Array(50).fill('IN_PROGRESS') });
    await expect(publishPost(row(), { ...deps(g.fetchFn), maxPolls: 5 })).rejects.toThrow(/timeout/);
    expect(g.calls.some((c) => c.url.endsWith('/media_publish'))).toBe(false);
  });

  it('test_IG02_erro_da_meta_vira_GraphError_com_a_mensagem', async () => {
    const g = fakeGraph({ publishError: 'Limite de publicações atingido' });
    const err = await publishPost(row(), deps(g.fetchFn)).catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.message).toContain('Limite de publicações atingido');
  });

});
