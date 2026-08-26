/**
 * Valida e normaliza uma URL de vídeo do YouTube para a forma canônica
 * `https://www.youtube.com/watch?v=<id>`.
 *
 * Sem import de react-native de propósito: `src/lib/youtube.ts` usa
 * Alert/Linking e não roda no vitest. Esta parte é pura pra ter teste.
 *
 * Devolve null quando não é uma URL de vídeo do YouTube reconhecível — o
 * caller trata como erro de campo, antes de tentar salvar.
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

/** Extrai o id de vídeo conforme o formato da URL, ou '' se não houver. */
function extrairId(host: string, url: URL): string {
  if (host === 'youtu.be') return url.pathname.slice(1);
  if (url.pathname === '/watch') return url.searchParams.get('v') ?? '';
  for (const prefixo of ['/shorts/', '/embed/', '/live/']) {
    if (url.pathname.startsWith(prefixo)) {
      return url.pathname.slice(prefixo.length);
    }
  }
  return '';
}

export function normalizeYouTubeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Aceita colar sem protocolo ("youtube.com/watch?v=..."). Só http(s) —
  // um "javascript:..." não vira https e cai no catch do URL.
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  // Segmento extra depois do id (ex: /shorts/<id>/algo) é descartado.
  const id = extrairId(host, url).split('/')[0] ?? '';
  if (!VIDEO_ID.test(id)) return null;

  return `https://www.youtube.com/watch?v=${id}`;
}

/** Busca no YouTube pelo nome do exercício. "como fazer" tende a priorizar
 *  tutorial técnico em PT-BR em vez de vídeo motivacional. */
export function youtubeSearchUrl(exerciseName: string): string {
  const query = encodeURIComponent(`${exerciseName} como fazer`);
  return `https://www.youtube.com/results?search_query=${query}`;
}

/**
 * URL que o botão de play deve abrir: o vídeo que o professor salvou no
 * exercício e, na falta dele, a busca pelo nome.
 *
 * Existe porque o `video_url` era campo morto — o formulário coletava o link
 * e os três botões de play do app chamavam sempre a busca, ignorando o que
 * o professor tinha colado.
 */
export function resolveExerciseVideoUrl(params: {
  videoUrl?: string | null;
  exerciseName: string;
}): string {
  const salvo = params.videoUrl ? normalizeYouTubeUrl(params.videoUrl) : null;
  return salvo ?? youtubeSearchUrl(params.exerciseName);
}
