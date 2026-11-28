import { describe, expect, it } from 'vitest';
import { planQueue, scheduledFor, storagePaths } from './instagramFila.mjs';

const manifest = {
  figmaFileKey: 'FILE',
  posts: [
    { date: '2026-11-29', slot: 'feed', kind: 'image', figma: ['11:347'], caption: 'Domingo' },
    { date: '2026-11-29', slot: 'story-1', kind: 'story', figma: ['20:1'] },
    { date: '2026-11-29', slot: 'story-2', kind: 'story', figma: ['20:2'], time: '20:30' },
  ],
};

describe('IG-04 horários padrão', () => {
  it('test_IG04_feed_12h_story1_10h_story2_19h_em_brasilia', () => {
    expect(scheduledFor('2026-11-29', 'feed')).toBe('2026-11-29T12:00:00-03:00');
    expect(scheduledFor('2026-11-29', 'story-1')).toBe('2026-11-29T10:00:00-03:00');
    expect(scheduledFor('2026-11-29', 'story-2')).toBe('2026-11-29T19:00:00-03:00');
  });
  it('test_IG04_horario_explicito_vence_o_padrao', () => {
    expect(scheduledFor('2026-11-29', 'story-2', '20:30')).toBe('2026-11-29T20:30:00-03:00');
  });
});

describe('IG-05 plano de carga', () => {
  it('test_IG05_fila_vazia_cria_tudo', () => {
    const plan = planQueue(manifest, []);
    expect(plan.map((p) => p.action)).toEqual(['create', 'create', 'create']);
    expect(plan[0].row).toMatchObject({
      slot: 'feed',
      kind: 'image',
      caption: 'Domingo',
      scheduled_for: '2026-11-29T12:00:00-03:00',
      media_paths: ['posts/2026-11-29-feed/1.jpg'],
    });
    expect(plan[1].row.caption).toBeNull();
    expect(plan[0].sources).toEqual({ type: 'figma', refs: ['11:347'] });
  });

  it('test_IG05_rodar_de_novo_atualiza_pendente_em_vez_de_duplicar', () => {
    const existing = [{ post_date: '2026-11-29', slot: 'feed', status: 'pending' }];
    expect(planQueue(manifest, existing)[0].action).toBe('update');
  });

  it('test_IG05_linha_ja_publicada_nao_e_tocada', () => {
    for (const status of ['published', 'publishing', 'failed', 'skipped']) {
      const existing = [{ post_date: '2026-11-29', slot: 'feed', status }];
      expect(planQueue(manifest, existing)[0].action).toBe('keep');
    }
  });

  it('test_IG05_caminhos_no_bucket_seguem_a_ordem_das_artes', () => {
    expect(storagePaths('2026-12-01', 'feed', 3)).toEqual([
      'posts/2026-12-01-feed/1.jpg',
      'posts/2026-12-01-feed/2.jpg',
      'posts/2026-12-01-feed/3.jpg',
    ]);
  });

  it('test_IG05_aceita_arquivo_local_no_lugar_de_arte_do_figma', () => {
    const m = { figmaFileKey: 'F', posts: [{ date: '2026-11-29', slot: 'story-2', kind: 'story', files: ['out/dom-post.jpg'] }] };
    const [p] = planQueue(m, []);
    expect(p.sources).toEqual({ type: 'files', refs: ['out/dom-post.jpg'] });
    expect(p.row.media_paths).toEqual(['posts/2026-11-29-story-2/1.jpg']);
    const both = { figmaFileKey: 'F', posts: [{ ...m.posts[0], figma: ['1:1'] }] };
    expect(() => planQueue(both, [])).toThrow(/figma ou files/);
  });

  it('test_IG05_manifesto_invalido_para_antes_de_mexer_em_algo', () => {
    const bad = { figmaFileKey: 'F', posts: [{ date: '2026-11-29', slot: 'feed', kind: 'carousel', figma: ['1:1'] }] };
    expect(() => planQueue(bad, [])).toThrow(/2 a 10/);
    const story = { figmaFileKey: 'F', posts: [{ date: '2026-11-29', slot: 'story-1', kind: 'story', figma: ['1:1'], caption: 'x' }] };
    expect(() => planQueue(story, [])).toThrow(/legenda/);
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ');
    const many = { figmaFileKey: 'F', posts: [{ ...manifest.posts[0], caption: tags }] };
    expect(() => planQueue(many, [])).toThrow(/31 hashtags/);
    const long = { figmaFileKey: 'F', posts: [{ ...manifest.posts[0], caption: 'a'.repeat(2201) }] };
    expect(() => planQueue(long, [])).toThrow(/2.200/);
    const dup = { figmaFileKey: 'F', posts: [manifest.posts[0], manifest.posts[0]] };
    expect(() => planQueue(dup, [])).toThrow(/repetido/);
  });
});
