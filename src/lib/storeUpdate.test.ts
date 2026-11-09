import { describe, expect, it } from 'vitest';
import { chooseUpdatePath, defaultUpdateMessage, storeUpdateTarget } from './storeUpdate';
import { PLAY_APP_URL, PLAY_WEB_URL } from './playStore';

describe('chooseUpdatePath — atualização nativa ou link da loja ([INA]-01, -02, -05)', () => {
  it('Play com versão nova e modo imediato permitido: nativa', () => {
    expect(chooseUpdatePath({ updateAvailable: true, immediateAllowed: true })).toBe('native');
  });

  it('sem módulo nativo ou sem resposta da Play: link da loja', () => {
    expect(chooseUpdatePath(null)).toBe('store');
  });

  it('Play ainda não conhece a versão nova: link da loja', () => {
    expect(chooseUpdatePath({ updateAvailable: false, immediateAllowed: false })).toBe('store');
  });

  it('versão nova, mas modo imediato não permitido: link da loja', () => {
    expect(chooseUpdatePath({ updateAvailable: true, immediateAllowed: false })).toBe('store');
    expect(chooseUpdatePath({ updateAvailable: true })).toBe('store');
  });
});

describe('storeUpdateTarget — destino da atualização por plataforma ([IOS]-09)', () => {
  const cfg = { android_store_url: null, ios_store_url: null };
  const appleDefault = { url: 'itms-apps://apps.apple.com/', fallback: 'https://apps.apple.com/' };

  it.each([
    ['sem ios_store_url', null],
    ['ios_store_url vazia', ''],
  ])('iOS %s: App Store, nunca a Play', (_nome, ios) => {
    expect(storeUpdateTarget('ios', { ...cfg, ios_store_url: ios })).toEqual(appleDefault);
  });

  it('iOS com ios_store_url: usa a do banco', () => {
    const url = 'https://apps.apple.com/br/app/personafit/id123';
    expect(storeUpdateTarget('ios', { ...cfg, ios_store_url: url }).url).toBe(url);
  });

  it('iOS ignora android_store_url', () => {
    const r = storeUpdateTarget('ios', { ...cfg, android_store_url: 'market://details?id=x' });
    expect(r).toEqual(appleDefault);
  });

  it('config ausente cai no padrão da loja', () => {
    expect(storeUpdateTarget('ios', null)).toEqual(appleDefault);
    expect(storeUpdateTarget('android', undefined)).toEqual({
      url: PLAY_APP_URL,
      fallback: PLAY_WEB_URL,
    });
  });

  it('Android: igual a hoje (android_store_url ou Play) e ignora ios_store_url', () => {
    expect(storeUpdateTarget('android', cfg)).toEqual({ url: PLAY_APP_URL, fallback: PLAY_WEB_URL });
    const r = storeUpdateTarget('android', {
      android_store_url: 'market://details?id=y',
      ios_store_url: 'https://apps.apple.com/x',
    });
    expect(r.url).toBe('market://details?id=y');
    expect(r.fallback).toBe(PLAY_WEB_URL);
  });
});

describe('defaultUpdateMessage — textos padrão por loja ([IOS]-09)', () => {
  it.each([
    ['ios', 'App Store'],
    ['android', 'Play Store'],
  ])('%s cita %s, bloqueado ou recomendado', (os, loja) => {
    const bloqueado = defaultUpdateMessage(os, true);
    const recomendado = defaultUpdateMessage(os, false);
    expect(bloqueado).toContain(loja);
    expect(recomendado).toContain(loja);
    expect(bloqueado).toContain('não é mais suportada');
    expect(recomendado).not.toContain('não é mais suportada');
  });
});
