import { describe, it, expect } from 'vitest';
import { shouldPromptForUpdate } from './otaPolicy';

describe('shouldPromptForUpdate', () => {
  it('primeira execução após instalar → NÃO mostra modal (aplica silencioso no próximo cold start)', () => {
    expect(shouldPromptForUpdate({ isFirstLaunch: true })).toBe(false);
  });

  it('execução posterior → mostra o modal "Atualizar agora"', () => {
    expect(shouldPromptForUpdate({ isFirstLaunch: false })).toBe(true);
  });
});
