import { describe, it, expect } from 'vitest';
import { needsStudentChoice } from './downgrade';

const base = {
  role: 'professor',
  source: 'store_play',
  studentCount: 8,
  studentLimit: 5,
};

describe('needsStudentChoice', () => {
  it('professor acima do limite, não-grandfather → true', () => {
    expect(needsStudentChoice(base)).toBe(true);
  });

  it('grandfather acima do limite → false (não-destrutivo, D5)', () => {
    expect(needsStudentChoice({ ...base, source: 'grandfather' })).toBe(false);
  });

  it('dentro do limite → false', () => {
    expect(needsStudentChoice({ ...base, studentCount: 5 })).toBe(false);
  });

  it('não-professor → false', () => {
    expect(needsStudentChoice({ ...base, role: 'comum' })).toBe(false);
  });

  it('limite null (sem limite) → false', () => {
    expect(needsStudentChoice({ ...base, studentLimit: null })).toBe(false);
  });

  it('ELITE-03 premium com 25 alunos e limite 20 → precisa escolher', () => {
    expect(
      needsStudentChoice({ ...base, studentCount: 25, studentLimit: 20 }),
    ).toBe(true);
  });
});
