import { describe, expect, it } from 'vitest';
import { chooseUpdatePath } from './storeUpdate';

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
