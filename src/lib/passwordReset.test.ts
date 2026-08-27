import { describe, it, expect } from 'vitest';
import { isResetFormValid } from './passwordReset';

describe('isResetFormValid', () => {
  it('código 6 dígitos + senha ≥8 + confirmação igual → válido', () => {
    expect(
      isResetFormValid({ token: '123456', password: 'novaSenha1', confirm: 'novaSenha1' }),
    ).toBe(true);
  });

  it('código curto → inválido', () => {
    expect(
      isResetFormValid({ token: '123', password: 'novaSenha1', confirm: 'novaSenha1' }),
    ).toBe(false);
  });

  it('senha com menos de 8 → inválido', () => {
    expect(
      isResetFormValid({ token: '123456', password: 'nova12', confirm: 'nova12' }),
    ).toBe(false);
  });

  it('confirmação diferente → inválido', () => {
    expect(
      isResetFormValid({ token: '123456', password: 'novaSenha1', confirm: 'novaSenha2' }),
    ).toBe(false);
  });

  it('espaços em volta do código são ignorados', () => {
    expect(
      isResetFormValid({ token: '  123456 ', password: 'novaSenha1', confirm: 'novaSenha1' }),
    ).toBe(true);
  });
});
