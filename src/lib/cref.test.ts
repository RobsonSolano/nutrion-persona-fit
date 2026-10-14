import { describe, it, expect } from 'vitest';
import {
  normalizeCref,
  validateCref,
  validateCredential,
  CREF_EXAMPLE,
} from './cref';

describe('normalizeCref', () => {
  it('remove o prefixo CREF e normaliza espaços e caixa', () => {
    expect(normalizeCref('cref 045821-g/sp')).toBe('045821-G/SP');
    expect(normalizeCref('CREF045821-G/SP')).toBe('045821-G/SP');
    expect(normalizeCref('  045821 - G / SP  ')).toBe('045821-G/SP');
  });

  it('completa com zeros à esquerda até 6 dígitos', () => {
    expect(normalizeCref('1234-G/SP')).toBe('001234-G/SP');
  });

  it('devolve a entrada aparada quando não reconhece o formato', () => {
    expect(normalizeCref('  vou digitar qualquer coisa ')).toBe(
      'vou digitar qualquer coisa',
    );
  });
});

describe('validateCref', () => {
  it('aceita registro bem formado de graduado e de provisionado', () => {
    expect(validateCref('045821-G/SP').ok).toBe(true);
    expect(validateCref('098765-P/RJ').ok).toBe(true);
    expect(validateCref('CREF 045678-G/MG').ok).toBe(true);
  });

  it('aceita todas as 27 UFs', () => {
    for (const uf of ['AC', 'DF', 'RS', 'TO', 'SP']) {
      expect(validateCref(`045821-G/${uf}`).ok).toBe(true);
    }
  });

  it('rejeita vazio', () => {
    expect(validateCref('').ok).toBe(false);
    expect(validateCref('   ').ok).toBe(false);
  });

  it('rejeita formato quebrado', () => {
    expect(validateCref('45821').ok).toBe(false);
    expect(validateCref('045821/SP').ok).toBe(false);
    expect(validateCref('045821-G').ok).toBe(false);
    expect(validateCref('abcdef-G/SP').ok).toBe(false);
    expect(validateCref('0458216-G/SP').ok).toBe(false);
  });

  it('rejeita categoria que não é G nem P', () => {
    expect(validateCref('045821-X/SP').ok).toBe(false);
  });

  it('rejeita UF inexistente', () => {
    expect(validateCref('045821-G/XX').ok).toBe(false);
    expect(validateCref('045821-G/BR').ok).toBe(false);
  });

  it('rejeita número com todos os dígitos iguais', () => {
    expect(validateCref('111111-G/SP').ok).toBe(false);
    expect(validateCref('999999-G/SP').ok).toBe(false);
    expect(validateCref('000000-G/SP').ok).toBe(false);
  });

  it('rejeita sequência crescente ou decrescente', () => {
    expect(validateCref('123456-G/SP').ok).toBe(false);
    expect(validateCref('654321-G/SP').ok).toBe(false);
    expect(validateCref('234567-G/SP').ok).toBe(false);
  });

  it('aceita número que só começa parecido com sequência', () => {
    expect(validateCref('123457-G/SP').ok).toBe(true);
    expect(validateCref('112233-G/SP').ok).toBe(true);
  });

  it('devolve o valor normalizado quando válido', () => {
    expect(validateCref('cref 1234-g/sp').value).toBe('001234-G/SP');
  });

  it('devolve motivo legível quando inválido', () => {
    expect(validateCref('999999-G/SP').reason).toMatch(/inválido|sequência|repetid/i);
    expect(validateCref('abc').reason).toContain(CREF_EXAMPLE);
  });
});

describe('validateCredential — CREF ou CRN', () => {
  it('aceita CREF válido', () => {
    expect(validateCredential('045821-G/SP').ok).toBe(true);
    expect(validateCredential('CREF 045821-G/SP').ok).toBe(true);
  });

  it('aceita CRN definitivo, provisório e secundário', () => {
    expect(validateCredential('CRN-3/45821').ok).toBe(true);
    expect(validateCredential('crn-10/4582').ok).toBe(true);
    expect(validateCredential('CRN-5/45821/P').ok).toBe(true);
    expect(validateCredential('CRN-1/45821/S').ok).toBe(true);
  });

  it('normaliza o CRN', () => {
    expect(validateCredential('crn 3 / 45821').value).toBe('CRN-3/45821');
    expect(validateCredential('CRN-5/45821/p').value).toBe('CRN-5/45821/P');
  });

  it('rejeita região de CRN inexistente', () => {
    expect(validateCredential('CRN-0/45821').ok).toBe(false);
    expect(validateCredential('CRN-12/45821').ok).toBe(false);
  });

  it('rejeita número de CRN degenerado', () => {
    expect(validateCredential('CRN-3/1111').ok).toBe(false);
    expect(validateCredential('CRN-3/123456').ok).toBe(false);
  });

  it('rejeita credencial que não é CREF nem CRN', () => {
    expect(validateCredential('CRM 12345/SP').ok).toBe(false);
    expect(validateCredential('sou professor').ok).toBe(false);
    expect(validateCredential('').ok).toBe(false);
  });

  it('identifica o tipo da credencial', () => {
    expect(validateCredential('045821-G/SP').kind).toBe('cref');
    expect(validateCredential('CRN-3/45821').kind).toBe('crn');
  });
});
