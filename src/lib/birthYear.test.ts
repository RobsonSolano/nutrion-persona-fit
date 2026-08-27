import { describe, it, expect } from 'vitest';
import { isValidBirthYear, MIN_BIRTH_YEAR } from './birthYear';

describe('isValidBirthYear', () => {
  const CURRENT = 2026;

  it('aceita ano completo dentro do intervalo', () => {
    expect(isValidBirthYear(1999, CURRENT)).toBe(true);
    expect(isValidBirthYear(1980, CURRENT)).toBe(true);
  });

  it('aceita os limites (1900 e ano atual)', () => {
    expect(isValidBirthYear(MIN_BIRTH_YEAR, CURRENT)).toBe(true);
    expect(isValidBirthYear(CURRENT, CURRENT)).toBe(true);
  });

  it('rejeita idade digitada no lugar do ano (o bug do 46)', () => {
    expect(isValidBirthYear(46, CURRENT)).toBe(false);
  });

  it('rejeita antes de 1900', () => {
    expect(isValidBirthYear(1899, CURRENT)).toBe(false);
  });

  it('rejeita ano no futuro', () => {
    expect(isValidBirthYear(CURRENT + 1, CURRENT)).toBe(false);
  });

  it('rejeita não-inteiros e NaN', () => {
    expect(isValidBirthYear(1999.5, CURRENT)).toBe(false);
    expect(isValidBirthYear(Number.NaN, CURRENT)).toBe(false);
  });
});
