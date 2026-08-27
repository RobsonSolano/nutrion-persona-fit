import { describe, expect, it } from 'vitest';
import { DEFAULT_TEXT_MODEL, isRetryableGroqStatus } from './groqRetry.ts';

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
