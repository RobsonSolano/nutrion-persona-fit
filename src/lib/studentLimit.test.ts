import { describe, it, expect } from 'vitest';
import { isStudentLimitReached } from './studentLimit';

describe('isStudentLimitReached', () => {
  it('bloqueia quando atinge o limite', () => {
    expect(isStudentLimitReached(5, 5)).toBe(true);
  });

  it('libera quando abaixo do limite', () => {
    expect(isStudentLimitReached(4, 5)).toBe(false);
  });

  it('nunca bloqueia quando o limite é null (comum/aluno)', () => {
    expect(isStudentLimitReached(99, null)).toBe(false);
  });

  it('ELITE-02 premium bloqueia no 20º aluno', () => {
    expect(isStudentLimitReached(20, 20)).toBe(true);
    expect(isStudentLimitReached(19, 20)).toBe(false);
  });

  it('ELITE-02 elite bloqueia no 50º aluno', () => {
    expect(isStudentLimitReached(50, 50)).toBe(true);
    expect(isStudentLimitReached(49, 50)).toBe(false);
  });

  it('bloqueia limite zero já no primeiro', () => {
    expect(isStudentLimitReached(0, 0)).toBe(true);
  });
});
