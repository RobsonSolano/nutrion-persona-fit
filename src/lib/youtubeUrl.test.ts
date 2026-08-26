import { describe, it, expect } from 'vitest';
import { normalizeYouTubeUrl, resolveExerciseVideoUrl } from './youtubeUrl';

describe('normalizeYouTubeUrl', () => {
  it('normaliza watch?v=', () => {
    expect(normalizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('normaliza youtu.be encurtado', () => {
    expect(normalizeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('normaliza shorts', () => {
    expect(normalizeYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('descarta parâmetros extras (t, list, si)', () => {
    expect(normalizeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc&t=42')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('aceita sem protocolo', () => {
    expect(normalizeYouTubeUrl('youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('ignora espaços em volta', () => {
    expect(normalizeYouTubeUrl('  https://youtu.be/dQw4w9WgXcQ  ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('devolve null para string vazia', () => {
    expect(normalizeYouTubeUrl('')).toBeNull();
    expect(normalizeYouTubeUrl('   ')).toBeNull();
  });

  it('devolve null para host que não é YouTube', () => {
    expect(normalizeYouTubeUrl('https://vimeo.com/12345678')).toBeNull();
  });

  it('devolve null para URL do YouTube sem id de vídeo', () => {
    expect(
      normalizeYouTubeUrl('https://www.youtube.com/results?search_query=supino'),
    ).toBeNull();
  });

  it('devolve null para id de tamanho errado', () => {
    expect(normalizeYouTubeUrl('https://youtu.be/abc')).toBeNull();
  });

  it('aceita embed', () => {
    expect(normalizeYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('aceita m.youtube.com', () => {
    expect(normalizeYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('ignora segmento extra depois do id em shorts', () => {
    expect(
      normalizeYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ/extra'),
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('devolve null para javascript: (não é URL http)', () => {
    expect(normalizeYouTubeUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('resolveExerciseVideoUrl', () => {
  it('abre o vídeo salvo quando existe', () => {
    expect(
      resolveExerciseVideoUrl({
        videoUrl: 'https://www.youtube.com/shorts/JByJ3hwyRVE',
        exerciseName: 'Supino Ravi',
      }),
    ).toBe('https://www.youtube.com/watch?v=JByJ3hwyRVE');
  });

  it('cai na busca quando não há vídeo salvo', () => {
    expect(
      resolveExerciseVideoUrl({ videoUrl: null, exerciseName: 'Supino Ravi' }),
    ).toBe(
      'https://www.youtube.com/results?search_query=Supino%20Ravi%20como%20fazer',
    );
  });

  it('cai na busca quando o link salvo é inválido', () => {
    // Link antigo/quebrado no banco não deve abrir a home do YouTube.
    expect(
      resolveExerciseVideoUrl({
        videoUrl: 'https://vimeo.com/12345',
        exerciseName: 'Supino Ravi',
      }),
    ).toContain('results?search_query=');
  });

  it('cai na busca quando o vídeo salvo é string vazia', () => {
    expect(
      resolveExerciseVideoUrl({ videoUrl: '   ', exerciseName: 'Agachamento' }),
    ).toContain('results?search_query=');
  });

  it('escapa caracteres do nome na busca', () => {
    expect(
      resolveExerciseVideoUrl({
        videoUrl: null,
        exerciseName: 'Supino reto (barra)',
      }),
    ).toBe(
      'https://www.youtube.com/results?search_query=Supino%20reto%20(barra)%20como%20fazer',
    );
  });
});
