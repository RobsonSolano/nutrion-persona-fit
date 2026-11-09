import { describe, it, expect } from 'vitest';
import { loginOptions, IOS_PASSWORD_HINT_ENABLED } from './socialLogin';

describe('loginOptions', () => {
  it('android fora do Expo Go: mostra Google, sem dicas', () => {
    expect(loginOptions('android', false)).toEqual({
      showGoogle: true,
      showExpoGoGoogleTip: false,
      showIosPasswordHint: false,
    });
  });

  it('android no Expo Go: sem Google, mostra dica do Expo Go', () => {
    expect(loginOptions('android', true)).toEqual({
      showGoogle: false,
      showExpoGoGoogleTip: true,
      showIosPasswordHint: false,
    });
  });

  it('ios fora do Expo Go: sem Google, sem dica do Expo Go, dica de senha', () => {
    expect(loginOptions('ios', false)).toEqual({
      showGoogle: false,
      showExpoGoGoogleTip: false,
      showIosPasswordHint: IOS_PASSWORD_HINT_ENABLED,
    });
  });

  it('ios no Expo Go: nada de Google nem dica do Expo Go', () => {
    expect(loginOptions('ios', true)).toEqual({
      showGoogle: false,
      showExpoGoGoogleTip: false,
      showIosPasswordHint: IOS_PASSWORD_HINT_ENABLED,
    });
  });

  it('web conta como "não ios"', () => {
    expect(loginOptions('web', false).showGoogle).toBe(true);
  });
});
