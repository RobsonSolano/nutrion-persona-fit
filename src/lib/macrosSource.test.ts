import { describe, expect, it } from 'vitest';
import { derivarMacrosSource } from './macrosSource';

describe('derivarMacrosSource (INS-04)', () => {
  it('INS04: nunca analisou é manual', () => {
    expect(
      derivarMacrosSource({ aiKcalOriginal: null, kcalSalvo: 420 }),
    ).toBe('manual');
  });

  it('INS04: analisou e salvou o mesmo valor é ai', () => {
    expect(derivarMacrosSource({ aiKcalOriginal: 420, kcalSalvo: 420 })).toBe(
      'ai',
    );
  });

  it('INS04: analisou e corrigiu pra baixo é ai_edited', () => {
    // É o sinal que interessa: a diferença é o erro da IA medido de graça.
    expect(derivarMacrosSource({ aiKcalOriginal: 500, kcalSalvo: 350 })).toBe(
      'ai_edited',
    );
  });

  it('INS04: analisou e corrigiu pra cima também é ai_edited', () => {
    expect(derivarMacrosSource({ aiKcalOriginal: 300, kcalSalvo: 480 })).toBe(
      'ai_edited',
    );
  });

  it('INS04: analisar de novo e aceitar o novo valor é ai', () => {
    // O original guardado é sempre o da ÚLTIMA análise — é contra ele que a
    // edição do usuário faz sentido.
    expect(derivarMacrosSource({ aiKcalOriginal: 367, kcalSalvo: 367 })).toBe(
      'ai',
    );
  });

  it('INS04: kcal salvo nulo com análise ainda é ai_edited', () => {
    // Apagar o campo depois de analisar é edição, não aceite.
    expect(derivarMacrosSource({ aiKcalOriginal: 420, kcalSalvo: null })).toBe(
      'ai_edited',
    );
  });

  it('INS04: sem análise e sem valor é manual', () => {
    expect(derivarMacrosSource({ aiKcalOriginal: null, kcalSalvo: null })).toBe(
      'manual',
    );
  });
});
