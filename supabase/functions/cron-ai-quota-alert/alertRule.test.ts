import { describe, expect, it } from 'vitest';
import { FAILURE_CODES, aiAlertFor } from './alertRule.ts';

describe('aiAlertFor', () => {
  it('tudo normal não alerta', () => {
    expect(aiAlertFor({ rateLimits: 2, failures: 1 })).toBeNull();
  });

  it('cota estourando alerta (regra que já existia: 10/h)', () => {
    const a = aiAlertFor({ rateLimits: 10, failures: 0 });
    expect(a?.title).toMatch(/cota/i);
    expect(a?.body).toContain('10');
  });

  // 2026-11-09: 7 falhas de um mesmo usuário em 2 dias e ninguém soube até
  // ele mandar print. 3 por hora já é sinal de modelo morto ou de JSON quebrando.
  it('falhas de IA alertam a partir de 3 por hora', () => {
    expect(aiAlertFor({ rateLimits: 0, failures: 2 })).toBeNull();
    const a = aiAlertFor({ rateLimits: 0, failures: 3 });
    expect(a?.title).toMatch(/falhando/i);
    expect(a?.body).toContain('3');
  });

  it('com os dois problemas, a falha (mais grave) vem no título e a cota no corpo', () => {
    const a = aiAlertFor({ rateLimits: 12, failures: 4 });
    expect(a?.title).toMatch(/falhando/i);
    expect(a?.body).toContain('4');
    expect(a?.body).toContain('12');
  });

  it('conta os códigos que o chat-ai e a geração de plano gravam em falha', () => {
    expect(FAILURE_CODES).toEqual(
      expect.arrayContaining([
        'groq_api_error',
        'empty_response',
        'parse_failed',
        'sanity_fallback_groq_down',
      ]),
    );
    expect(FAILURE_CODES).not.toContain('rate_limit');
  });
});
