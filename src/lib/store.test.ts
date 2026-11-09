import { describe, it, expect } from 'vitest';
import {
  storeKind,
  storeName,
  subscriptionsUrl,
  rcApiKeyFor,
  usesGoogleProductChange,
  APPLE_SUBSCRIPTIONS_URL,
} from './store';
import { PLAY_SUBSCRIPTIONS_URL } from './playStore';

describe('[IOS]-05/08 regras de loja por plataforma', () => {
  it('storeKind: ios → apple; o resto → google', () => {
    expect(storeKind('ios')).toBe('apple');
    expect(storeKind('android')).toBe('google');
    expect(storeKind('web')).toBe('google');
  });

  it('storeName: nome da loja da plataforma', () => {
    expect(storeName('ios')).toBe('App Store');
    expect(storeName('android')).toBe('Play Store');
    expect(storeName('web')).toBe('Play Store');
  });

  it('subscriptionsUrl: Apple no iOS, Play nos demais', () => {
    expect(APPLE_SUBSCRIPTIONS_URL).toBe('https://apps.apple.com/account/subscriptions');
    expect(subscriptionsUrl('ios')).toBe(APPLE_SUBSCRIPTIONS_URL);
    expect(subscriptionsUrl('android')).toBe(PLAY_SUBSCRIPTIONS_URL);
    expect(subscriptionsUrl('web')).toBe(PLAY_SUBSCRIPTIONS_URL);
  });

  describe('rcApiKeyFor', () => {
    const keys = { ios: 'appl_x', android: 'goog_y' };
    it('escolhe a chave da plataforma', () => {
      expect(rcApiKeyFor('ios', keys)).toBe('appl_x');
      expect(rcApiKeyFor('android', keys)).toBe('goog_y');
    });
    it('web e desconhecidos → undefined', () => {
      expect(rcApiKeyFor('web', keys)).toBeUndefined();
      expect(rcApiKeyFor('windows', keys)).toBeUndefined();
    });
    it('sem a chave da plataforma → undefined (não usa a da outra)', () => {
      expect(rcApiKeyFor('ios', { android: 'goog_y' })).toBeUndefined();
      expect(rcApiKeyFor('android', { ios: 'appl_x' })).toBeUndefined();
    });
    it('string vazia → undefined', () => {
      expect(rcApiKeyFor('ios', { ios: '', android: 'g' })).toBeUndefined();
      expect(rcApiKeyFor('android', { ios: 'a', android: '' })).toBeUndefined();
    });
  });

  describe('usesGoogleProductChange', () => {
    it('android com produto antigo → true', () => {
      expect(usesGoogleProductChange('android', 'nutrion_prof_pro')).toBe(true);
    });
    it('android sem produto antigo → false', () => {
      expect(usesGoogleProductChange('android', null)).toBe(false);
      expect(usesGoogleProductChange('android', undefined)).toBe(false);
      expect(usesGoogleProductChange('android', '')).toBe(false);
    });
    it('ios nunca usa proração do Google', () => {
      expect(usesGoogleProductChange('ios', 'nutrion_prof_pro')).toBe(false);
    });
    it('web → false', () => {
      expect(usesGoogleProductChange('web', 'nutrion_prof_pro')).toBe(false);
    });
  });
});
