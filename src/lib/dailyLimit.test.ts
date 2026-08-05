import { describe, it, expect } from 'vitest';
import { parseDailyLimit, DailyLimitError } from './dailyLimit';

describe('parseDailyLimit', () => {
  it('429 daily_limit com limit → DailyLimitError com o limite', () => {
    const err = parseDailyLimit(429, JSON.stringify({ error: 'daily_limit', limit: 8 }));
    expect(err).toBeInstanceOf(DailyLimitError);
    expect(err?.limit).toBe(8);
  });

  it('429 daily_limit sem campo limit → DailyLimitError com limit null', () => {
    const err = parseDailyLimit(429, JSON.stringify({ error: 'daily_limit' }));
    expect(err).toBeInstanceOf(DailyLimitError);
    expect(err?.limit).toBeNull();
  });

  it('429 com outro erro → null (segue tratamento normal)', () => {
    expect(parseDailyLimit(429, JSON.stringify({ error: 'algo_outro' }))).toBeNull();
  });

  it('429 body não-JSON → null', () => {
    expect(parseDailyLimit(429, 'Rate limited')).toBeNull();
  });

  it('status diferente de 429 → null', () => {
    expect(parseDailyLimit(402, JSON.stringify({ error: 'daily_limit', limit: 8 }))).toBeNull();
    expect(parseDailyLimit(200, JSON.stringify({ error: 'daily_limit', limit: 8 }))).toBeNull();
  });
});
