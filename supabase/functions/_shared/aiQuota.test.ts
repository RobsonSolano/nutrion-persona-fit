import { describe, it, expect } from 'vitest';
import { dailyAiQuota } from './aiQuota';

describe('dailyAiQuota', () => {
  it('PREM-03 own_tier free/pro → base', () => {
    expect(dailyAiQuota({ own_tier: 'free' })).toEqual({ chat: 10, sanity: 8 });
    expect(dailyAiQuota({ own_tier: 'pro' })).toEqual({ chat: 10, sanity: 8 });
  });

  it('PREM-03 own_tier premium/elite → 20/15', () => {
    expect(dailyAiQuota({ own_tier: 'premium' })).toEqual({ chat: 20, sanity: 15 });
    expect(dailyAiQuota({ own_tier: 'elite' })).toEqual({ chat: 20, sanity: 15 });
  });

  it('PREM-03 own_tier ausente ou null → base', () => {
    expect(dailyAiQuota({})).toEqual({ chat: 10, sanity: 8 });
    expect(dailyAiQuota({ own_tier: null })).toEqual({ chat: 10, sanity: 8 });
  });

  it('PREM-03 aluno que herda do professor (tier elite, own_tier free) → base', () => {
    expect(dailyAiQuota({ tier: 'elite', own_tier: 'free' } as { own_tier: string })).toEqual({ chat: 10, sanity: 8 });
  });
});
