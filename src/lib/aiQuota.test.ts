import { describe, expect, it } from 'vitest';
import { dailyAiQuota, quotaState } from './aiQuota';

describe('aiQuota (cliente)', () => {
  it.each([
    ['free', 10, 8],
    ['pro', 10, 8],
    ['premium', 20, 15],
    ['elite', 20, 15],
    [undefined, 10, 8],
  ] as const)('PREM-03 own_tier %s: chat %i, sanity %i', (own_tier, chat, sanity) => {
    expect(dailyAiQuota(own_tier)).toEqual({ chat, sanity });
  });

  it('PREM-03 aluno que herda do professor fica na cota base', () => {
    // Só own_tier conta: o tier efetivo (herdado) não entra na assinatura.
    expect(dailyAiQuota('free')).toEqual({
      chat: 10,
      sanity: 8,
    });
  });

  it('PREM-03 chat premium não bloqueia na 11ª', () => {
    expect(quotaState(10, 20, true).limitReached).toBe(false);
    expect(quotaState(20, 20, true).limitReached).toBe(true);
    expect(quotaState(10, 10, true).limitReached).toBe(true);
  });

  it('PREM-03 sem entitlement não bloqueia', () => {
    expect(quotaState(8, 8, false).limitReached).toBe(false);
    expect(quotaState(10, 10, false).limitReached).toBe(false);
  });

  it('PREM-03 remaining nunca fica negativo', () => {
    expect(quotaState(25, 20, true).remaining).toBe(0);
    expect(quotaState(5, 20, true)).toEqual({
      limit: 20,
      remaining: 15,
      limitReached: false,
    });
  });

  it('PREM-03 espelho do cliente bate com o helper das edge functions', async () => {
    // Caminho em variável: o tsc não analisa supabase/ (imports .ts do Deno); o vitest resolve.
    const serverPath = '../../supabase/functions/_shared/aiQuota.ts';
    const { dailyAiQuota: serverQuota } = (await import(/* @vite-ignore */ serverPath)) as {
      dailyAiQuota: (e: { own_tier?: string | null }) => { chat: number; sanity: number };
    };
    for (const own_tier of ['free', 'pro', 'premium', 'elite', undefined, null, 'x']) {
      expect(dailyAiQuota(own_tier)).toEqual(
        serverQuota({ own_tier }),
      );
    }
  });
});
