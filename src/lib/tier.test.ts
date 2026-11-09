import { describe, it, expect } from 'vitest';
import {
  TIER_LABEL,
  tierAtLeast,
} from './tier';

describe('tier', () => {
  it('ELITE-01 ordem free<pro<premium<elite', () => {
    expect(tierAtLeast('pro', 'free')).toBe(true);
    expect(tierAtLeast('free', 'pro')).toBe(false);
    expect(tierAtLeast('premium', 'pro')).toBe(true);
    expect(tierAtLeast('pro', 'premium')).toBe(false);
    expect(tierAtLeast('elite', 'premium')).toBe(true);
    expect(tierAtLeast('premium', 'elite')).toBe(false);
  });

  it('ELITE-01 rótulos dos tiers', () => {
    expect(TIER_LABEL).toEqual({
      free: 'Free',
      pro: 'Pro',
      premium: 'Premium',
      elite: 'Elite',
    });
  });

  it('ELITE-04 tierAtLeast(elite, premium) é true', () => {
    expect(tierAtLeast('elite', 'premium')).toBe(true);
    expect(tierAtLeast('premium', 'premium')).toBe(true);
    expect(tierAtLeast('pro', 'premium')).toBe(false);
    expect(tierAtLeast('free', 'pro')).toBe(false);
  });

  it('ELITE-04 tier null, undefined ou desconhecido vale free', () => {
    expect(tierAtLeast(null, 'premium')).toBe(false);
    expect(tierAtLeast(undefined, 'premium')).toBe(false);
    expect(tierAtLeast('platina', 'premium')).toBe(false);
    expect(tierAtLeast(null, 'free')).toBe(true);
    expect(tierAtLeast('platina', 'pro')).toBe(false);
  });
});
