import { describe, it, expect } from 'vitest';
import { mapRevenueCatEvent, stateFromSubscriber, storeToSource, transferIds } from './mapEvent';

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

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

describe('transferIds', () => {
  it('TRANSFER → contas de origem e destino (só ids de usuário do app)', () => {
    const r = transferIds({
      event: {
        type: 'TRANSFER',
        transferred_from: [U1, '$RCAnonymousID:abc'],
        transferred_to: [U2],
      },
    });
    expect(r).toEqual({ from: [U1], to: [U2] });
  });

  it('null para outros eventos ou sem destino', () => {
    expect(transferIds({ event: { type: 'RENEWAL', app_user_id: U1 } })).toBeNull();
    expect(transferIds({ event: { type: 'TRANSFER', transferred_from: [U1], transferred_to: [] } })).toBeNull();
    expect(transferIds(null)).toBeNull();
  });
});

describe('stateFromSubscriber', () => {
  const NOW = Date.parse('2026-11-26T12:00:00Z');
  const future = '2026-12-26T12:00:00Z';
  const past = '2026-11-01T12:00:00Z';

  it('entitlement ativo da App Store → tier, active, period_end e store_apple', () => {
    const r = stateFromSubscriber(
      {
        entitlements: { premium: { expires_date: future, product_identifier: 'nutrion_comum_premium' } },
        subscriptions: { nutrion_comum_premium: { store: 'app_store', expires_date: future, period_type: 'normal', unsubscribe_detected_at: null } },
      },
      NOW,
    );
    expect(r).toEqual({
      source: 'store_apple',
      state: { tier: 'premium', status: 'active', period_end: new Date(future).toISOString() },
    });
  });

  it('cancelada mas ainda no período → canceled (acesso até period_end)', () => {
    const r = stateFromSubscriber(
      {
        entitlements: { premium: { expires_date: future, product_identifier: 'p' } },
        subscriptions: { p: { store: 'app_store', expires_date: future, period_type: 'normal', unsubscribe_detected_at: past } },
      },
      NOW,
    );
    expect(r.state.status).toBe('canceled');
  });

  it('período de teste da loja → in_trial; Play → store_play', () => {
    const r = stateFromSubscriber(
      {
        entitlements: { pro: { expires_date: future, product_identifier: 'p' } },
        subscriptions: { p: { store: 'play_store', expires_date: future, period_type: 'trial', unsubscribe_detected_at: null } },
      },
      NOW,
    );
    expect(r).toMatchObject({ source: 'store_play', state: { tier: 'pro', status: 'in_trial' } });
  });

  it('prioridade elite > premium > pro entre os ativos', () => {
    const r = stateFromSubscriber(
      {
        entitlements: {
          pro: { expires_date: future, product_identifier: 'a' },
          elite: { expires_date: future, product_identifier: 'b' },
        },
        subscriptions: { b: { store: 'app_store', expires_date: future, period_type: 'normal', unsubscribe_detected_at: null } },
      },
      NOW,
    );
    expect(r.state.tier).toBe('elite');
  });

  it('sem entitlement ativo → free/expired', () => {
    const r = stateFromSubscriber(
      { entitlements: { premium: { expires_date: past, product_identifier: 'p' } }, subscriptions: {} },
      NOW,
    );
    expect(r.state).toEqual({ tier: 'free', status: 'expired', period_end: new Date(past).toISOString() });
    expect(stateFromSubscriber({}, NOW).state.tier).toBe('free');
  });
});
