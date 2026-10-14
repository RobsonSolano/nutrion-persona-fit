import { describe, expect, it } from 'vitest';
import { compareVersions, updateRequirement } from './appVersion';

describe('compareVersions — [ATU]-07', () => {
  it('compara parte a parte, numericamente', () => {
    expect(compareVersions('1.4.0', '1.5.0')).toBe(-1);
    expect(compareVersions('1.5.0', '1.4.0')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1); // não é ordem de texto
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
  });

  it('partes faltando valem zero', () => {
    expect(compareVersions('1.5', '1.5.0')).toBe(0);
    expect(compareVersions('1', '1.0.1')).toBe(-1);
  });

  it('ignora sufixo e espaço', () => {
    expect(compareVersions('1.5.0-beta', '1.5.0')).toBe(0);
    expect(compareVersions(' 1.5.0 ', '1.5.0')).toBe(0);
  });
});

describe('updateRequirement — [ATU]-01, -02, -04', () => {
  it('abaixo da mínima bloqueia', () => {
    expect(updateRequirement('1.4.0', '1.5.0', '1.5.0')).toBe('blocked');
  });

  it('entre a mínima e a recomendada sugere', () => {
    expect(updateRequirement('1.4.0', '1.3.0', '1.5.0')).toBe('recommended');
    expect(updateRequirement('1.4.0', null, '1.5.0')).toBe('recommended');
  });

  it('na recomendada ou acima, nada', () => {
    expect(updateRequirement('1.5.0', '1.5.0', '1.5.0')).toBe('none');
    expect(updateRequirement('1.6.0', '1.5.0', '1.5.0')).toBe('none');
  });

  it('sem versões configuradas, nada', () => {
    expect(updateRequirement('1.4.0', null, null)).toBe('none');
    expect(updateRequirement('1.4.0', '', '  ')).toBe('none');
  });

  it('sem versão instalada conhecida, nunca bloqueia', () => {
    expect(updateRequirement(null, '9.0.0', '9.0.0')).toBe('none');
  });

  it('versão instalada que não parece versão (ex: hash de fingerprint) nunca bloqueia', () => {
    // runtimeVersion só é "1.4.0" com a política appVersion; com fingerprint vira hash.
    expect(updateRequirement('a3f9c21e0b7d', '1.5.0', '1.5.0')).toBe('none');
    expect(updateRequirement('', '1.5.0', null)).toBe('none');
  });

  it('mínima maior que a recomendada (erro de digitação): vale a mínima', () => {
    expect(updateRequirement('1.4.0', '1.6.0', '1.5.0')).toBe('blocked');
  });
});
