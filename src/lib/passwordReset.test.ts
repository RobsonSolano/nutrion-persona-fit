import { describe, it, expect } from 'vitest';
import { isResetFormValid } from './passwordReset';

describe('isResetFormValid', () => {
  it('código 6 dígitos + senha ≥6 + confirmação igual → válido', () => {
    expect(
      isResetFormValid({ token: '123456', password: 'nova123', confirm: 'nova123' }),
    ).toBe(true);
  });

  it('código curto → inválido', () => {
    expect(
      isResetFormValid({ token: '123', password: 'nova123', confirm: 'nova123' }),
    ).toBe(false);
  });

  it('senha com menos de 6 → inválido', () => {
    expect(
      isResetFormValid({ token: '123456', password: 'abc', confirm: 'abc' }),
    ).toBe(false);
  });

  it('confirmação diferente → inválido', () => {
    expect(
      isResetFormValid({ token: '123456', password: 'nova123', confirm: 'nova124' }),
    ).toBe(false);
  });

  it('espaços em volta do código são ignorados', () => {
    expect(
      isResetFormValid({ token: '  123456 ', password: 'nova123', confirm: 'nova123' }),
    ).toBe(true);
  });
});
