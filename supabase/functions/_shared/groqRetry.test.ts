import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TEXT_MODEL,
  groqBody,
  groqFetchWithFailover,
  isJsonValidateFailed,
  isRetryableGroqStatus,
  reasoningEffortFor,
  textModelChain,
} from './groqRetry.ts';

describe('isRetryableGroqStatus', () => {
  it('rate limit (429) faz retry', () => {
    expect(isRetryableGroqStatus(429)).toBe(true);
  });

  it('erros de servidor (5xx) fazem retry', () => {
    for (const s of [500, 502, 503, 504]) {
      expect(isRetryableGroqStatus(s)).toBe(true);
    }
  });

  it('não repete 4xx que é culpa nossa', () => {
    // 404 = modelo inexistente, 400 = body ruim, 401 = key errada, 413 =
    // grande demais. Repetir não muda o resultado.
    for (const s of [400, 401, 403, 404, 413, 422]) {
      expect(isRetryableGroqStatus(s)).toBe(false);
    }
  });

  it('não repete sucesso', () => {
    expect(isRetryableGroqStatus(200)).toBe(false);
  });

  it('o default de texto não é mais o modelo morto', () => {
    expect(DEFAULT_TEXT_MODEL).not.toBe('llama-3.3-70b-versatile');
    expect(DEFAULT_TEXT_MODEL).toBe('openai/gpt-oss-120b');
  });
});

// Corpo real devolvido pelo Groq em 2026-11-09 (print do usuário: "502 · 400:
// Failed to validate JSON...").
const JSON_VALIDATE_FAILED_BODY = JSON.stringify({
  error: {
    message:
      "Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
    type: 'invalid_request_error',
    code: 'json_validate_failed',
    failed_generation: '',
  },
});

describe('isJsonValidateFailed', () => {
  it('reconhece o 400 json_validate_failed do Groq', () => {
    expect(isJsonValidateFailed(400, JSON_VALIDATE_FAILED_BODY)).toBe(true);
  });

  it('outro 400 (body ruim de verdade) não é variância de geração', () => {
    const body = JSON.stringify({
      error: { message: 'model is required', code: 'invalid_request_error' },
    });
    expect(isJsonValidateFailed(400, body)).toBe(false);
  });

  it('só vale para 400', () => {
    expect(isJsonValidateFailed(500, JSON_VALIDATE_FAILED_BODY)).toBe(false);
  });

  it('body não-JSON não quebra', () => {
    expect(isJsonValidateFailed(400, '<html>bad gateway</html>')).toBe(false);
  });
});

describe('reasoningEffortFor', () => {
  it('gpt-oss raciocina pouco: o raciocínio gasta o mesmo max_tokens do JSON', () => {
    expect(reasoningEffortFor('openai/gpt-oss-120b')).toBe('low');
    expect(reasoningEffortFor('openai/gpt-oss-20b')).toBe('low');
  });

  it('qwen (visão) desliga o raciocínio', () => {
    expect(reasoningEffortFor('qwen/qwen3.8-27b')).toBe('none');
  });

  it('modelo sem raciocínio não recebe o parâmetro (a API recusaria)', () => {
    expect(reasoningEffortFor('llama-3.1-8b-instant')).toBeUndefined();
  });
});

describe('textModelChain', () => {
  it('primário primeiro, fallbacks depois, sem repetir nem incluir visão', () => {
    expect(textModelChain('openai/gpt-oss-120b')).toEqual([
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
    ]);
    expect(textModelChain('openai/gpt-oss-20b')).toEqual(['openai/gpt-oss-20b']);
  });
});

describe('groqBody', () => {
  it('aplica model e o reasoning_effort da família', () => {
    const payload = { messages: [], max_tokens: 10 };
    expect(JSON.parse(groqBody(payload, 'openai/gpt-oss-120b'))).toEqual({
      ...payload,
      model: 'openai/gpt-oss-120b',
      reasoning_effort: 'low',
    });
    expect(JSON.parse(groqBody(payload, 'llama-3.1-8b-instant'))).toEqual({
      ...payload,
      model: 'llama-3.1-8b-instant',
    });
  });
});

describe('groqFetchWithFailover', () => {
  const okBody = JSON.stringify({ choices: [{ message: { content: '{}' } }] });

  function respond(status: number, body: string) {
    return new Response(body, { status });
  }

  /** Mocka o fetch com uma fila de respostas e registra o corpo de cada chamada. */
  function mockFetch(queue: Response[]) {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        const next = queue.shift();
        if (!next) throw new Error('fetch chamado mais vezes que o esperado');
        return next;
      }),
    );
    return {
      bodies,
      get models() {
        return bodies.map((b) => b.model);
      },
    };
  }

  const payload = { messages: [] };
  const opts = { backoffMs: 0 };
  const run = (models: string[]) =>
    groqFetchWithFailover('u', 'k', models, payload, opts);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sucesso de primeira não repete e diz quem respondeu', async () => {
    const calls = mockFetch([respond(200, okBody)]);
    const { res, model } = await run(['a', 'b']);
    expect(res.status).toBe(200);
    expect(model).toBe('a');
    expect(calls.models).toEqual(['a']);
  });

  it('json_validate_failed passa para o próximo modelo, que responde', async () => {
    const calls = mockFetch([
      respond(400, JSON_VALIDATE_FAILED_BODY),
      respond(200, okBody),
    ]);
    const { res, model } = await run(['a', 'b']);
    expect(res.status).toBe(200);
    expect(model).toBe('b');
    expect(calls.models).toEqual(['a', 'b']);
  });

  it('cada modelo recebe o próprio reasoning_effort', async () => {
    const calls = mockFetch([respond(502, 'x'), respond(200, okBody)]);
    await run(['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']);
    expect(calls.bodies.map((b) => b.reasoning_effort)).toEqual(['low', 'none']);
  });

  it('esgotada a cadeia, devolve a última resposta com o body legível', async () => {
    mockFetch([
      respond(400, JSON_VALIDATE_FAILED_BODY),
      respond(400, JSON_VALIDATE_FAILED_BODY),
    ]);
    const { res, model } = await run(['a', 'b']);
    expect(res.status).toBe(400);
    expect(model).toBe('b');
    expect(await res.text()).toContain('json_validate_failed');
  });

  it('400 que é erro nosso não repete nem troca de modelo', async () => {
    const calls = mockFetch([respond(400, '{"error":{"message":"bad"}}')]);
    const { res } = await run(['a', 'b']);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('bad');
    expect(calls.models).toEqual(['a']);
  });

  it('cadeia de um modelo só (visão) repete até 3 vezes nele', async () => {
    const calls = mockFetch([
      respond(503, 'x'),
      respond(400, JSON_VALIDATE_FAILED_BODY),
      respond(200, okBody),
    ]);
    const { res } = await run(['v']);
    expect(res.status).toBe(200);
    expect(calls.models).toEqual(['v', 'v', 'v']);
  });

  // Cota do free tier é por MODELO e por minuto: repetir no mesmo modelo
  // 600ms depois só queima a cota. Outro modelo tem a cota dele livre.
  it('429 em todos devolve o 429 do último com o Retry-After', async () => {
    const limited = () =>
      new Response('{"error":{"code":"rate_limit_exceeded"}}', {
        status: 429,
        headers: { 'retry-after': '7' },
      });
    const calls = mockFetch([limited(), limited()]);
    const { res } = await run(['a', 'b']);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('7');
    expect(calls.models).toEqual(['a', 'b']);
  });

  // A Groq já descontinuou dois modelos nossos (llama-3.3, llama-4-scout).
  // Corpo real de 2026-11-10 para um modelo morto.
  it('modelo descontinuado pula para o próximo em vez de falhar', async () => {
    const dead = JSON.stringify({
      error: {
        message: 'The model `x` does not exist or you do not have access to it.',
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    });
    const calls = mockFetch([respond(404, dead), respond(200, okBody)]);
    const { res, model } = await run(['morto', 'vivo']);
    expect(res.status).toBe(200);
    expect(model).toBe('vivo');
    expect(calls.models).toEqual(['morto', 'vivo']);
  });

  it('model_decommissioned também pula, e não repete no mesmo modelo', async () => {
    const dead = JSON.stringify({ error: { code: 'model_decommissioned' } });
    const calls = mockFetch([respond(400, dead), respond(200, okBody)]);
    await run(['morto', 'vivo']);
    expect(calls.models).toEqual(['morto', 'vivo']);
  });

  it('modelo morto numa cadeia de um só volta na hora (sem 3 tentativas)', async () => {
    const calls = mockFetch([
      respond(404, '{"error":{"code":"model_not_found"}}'),
    ]);
    const { res } = await run(['v']);
    expect(res.status).toBe(404);
    expect(calls.models).toEqual(['v']);
  });

  it('429 em cadeia de um modelo só volta na hora', async () => {
    const calls = mockFetch([respond(429, '{}')]);
    const { res } = await run(['v']);
    expect(res.status).toBe(429);
    expect(calls.models).toEqual(['v']);
  });
});
