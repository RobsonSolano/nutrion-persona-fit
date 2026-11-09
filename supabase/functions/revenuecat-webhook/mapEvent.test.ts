import { describe, it, expect } from 'vitest';
import { mapRevenueCatEvent, storeToSource } from './mapEvent';

const ev = (type: string, extra: Record<string, unknown> = {}) => ({
  event: {
    type,
    app_user_id: 'user-1',
    entitlement_ids: ['pro'],
    expiration_at_ms: 1_700_000_000_000,
    ...extra,
  },
});

describe('mapRevenueCatEvent', () => {
  it('INITIAL_PURCHASE → active/pro com period_end ISO', () => {
    const r = mapRevenueCatEvent(ev('INITIAL_PURCHASE'));
    expect(r?.userId).toBe('user-1');
    expect(r?.state).toMatchObject({ tier: 'pro', status: 'active' });
    expect(r?.state.period_end).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('período de teste da loja → in_trial', () => {
    expect(mapRevenueCatEvent(ev('INITIAL_PURCHASE', { period_type: 'TRIAL' }))?.state.status).toBe('in_trial');
  });

  it('RENEWAL/PRODUCT_CHANGE/UNCANCELLATION → active', () => {
    for (const t of ['RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION']) {
      expect(mapRevenueCatEvent(ev(t))?.state.status).toBe('active');
    }
  });

  it('CANCELLATION → canceled (mantém period_end)', () => {
    const r = mapRevenueCatEvent(ev('CANCELLATION'));
    expect(r?.state.status).toBe('canceled');
    expect(r?.state.period_end).not.toBeNull();
  });

  it('BILLING_ISSUE → active (grace)', () => {
    expect(mapRevenueCatEvent(ev('BILLING_ISSUE'))?.state.status).toBe('active');
  });

  it('EXPIRATION → free/expired', () => {
    expect(mapRevenueCatEvent(ev('EXPIRATION'))?.state).toMatchObject({ tier: 'free', status: 'expired' });
  });

  it('premium nos entitlements → premium', () => {
    expect(mapRevenueCatEvent(ev('RENEWAL', { entitlement_ids: ['premium'] }))?.state.tier).toBe('premium');
  });

  it('sem app_user_id → null', () => {
    expect(mapRevenueCatEvent({ event: { type: 'RENEWAL' } })).toBeNull();
  });

  it('tipo desconhecido → null', () => {
    expect(mapRevenueCatEvent(ev('TRANSFER'))).toBeNull();
  });

  it('sem expiration_at_ms → period_end null', () => {
    expect(mapRevenueCatEvent(ev('RENEWAL', { expiration_at_ms: undefined }))?.state.period_end).toBeNull();
  });

  it('ELITE-05 elite → tier elite', () => {
    expect(mapRevenueCatEvent(ev('INITIAL_PURCHASE', { entitlement_ids: ['elite'] }))?.state).toMatchObject({ tier: 'elite', status: 'active' });
  });

  it('ELITE-05 elite+premium → elite', () => {
    expect(mapRevenueCatEvent(ev('RENEWAL', { entitlement_ids: ['premium', 'elite'] }))?.state.tier).toBe('elite');
  });

  it('ELITE-05 CANCELLATION de elite mantém elite/canceled', () => {
    expect(mapRevenueCatEvent(ev('CANCELLATION', { entitlement_ids: ['elite'] }))?.state).toMatchObject({ tier: 'elite', status: 'canceled' });
  });

  it('ELITE-05 EXPIRATION → free', () => {
    expect(mapRevenueCatEvent(ev('EXPIRATION', { entitlement_ids: ['elite'] }))?.state).toMatchObject({ tier: 'free', status: 'expired' });
  });

  it('IOS-06 storeToSource: APP_STORE e MAC_APP_STORE → store_apple', () => {
    expect(storeToSource('APP_STORE')).toBe('store_apple');
    expect(storeToSource('MAC_APP_STORE')).toBe('store_apple');
  });

  it('IOS-06 storeToSource: PLAY_STORE → store_play', () => {
    expect(storeToSource('PLAY_STORE')).toBe('store_play');
  });

  it('IOS-06 storeToSource: ausente, null, número ou desconhecido → store_play', () => {
    for (const v of [undefined, null, 42, 'STRIPE', 'PROMOTIONAL', '', 'app_store']) {
      expect(storeToSource(v)).toBe('store_play');
    }
  });

  it('IOS-06 INITIAL_PURCHASE com APP_STORE → source store_apple', () => {
    expect(mapRevenueCatEvent(ev('INITIAL_PURCHASE', { store: 'APP_STORE' }))?.source).toBe('store_apple');
  });

  it('IOS-06 todos os tipos tratados trazem source (inclusive EXPIRATION)', () => {
    for (const t of ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'CANCELLATION', 'BILLING_ISSUE', 'EXPIRATION']) {
      expect(mapRevenueCatEvent(ev(t, { store: 'APP_STORE' }))?.source).toBe('store_apple');
      expect(mapRevenueCatEvent(ev(t))?.source).toBe('store_play');
    }
  });
});
