import { describe, it, expect } from 'vitest';
import { novoIdLocal } from './idLocal';

describe('novoIdLocal', () => {
  it('CONJ-09: chamadas seguidas não repetem, nem dentro do mesmo milissegundo', () => {
    // O editor gera uma id por exercício dentro de um único map — todas no
    // mesmo ms. É exatamente este cenário que o contador protege.
    const chaves = new Set(Array.from({ length: 500 }, () => novoIdLocal()));

    expect(chaves.size).toBe(500);
  });

  it('CONJ-09: não usa API nativa — só string serializável', () => {
    const chave = novoIdLocal();

    expect(typeof chave).toBe('string');
    expect(chave.length).toBeGreaterThan(0);
  });
});
