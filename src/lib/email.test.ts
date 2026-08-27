import { describe, it, expect } from 'vitest';
import { isValidEmail } from './email';

describe('isValidEmail', () => {
  it('aceita e-mail bem formado', () => {
    expect(isValidEmail('nome@dominio.com')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('joao.silva+tag@empresa.com.br')).toBe(true);
  });

  it('normaliza espaços nas pontas antes de validar', () => {
    expect(isValidEmail('  nome@dominio.com  ')).toBe(true);
  });

  it('rejeita string vazia ou sem @', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('nome')).toBe(false);
  });

  it('rejeita sem parte local ou sem domínio', () => {
    expect(isValidEmail('@dominio.com')).toBe(false);
    expect(isValidEmail('nome@')).toBe(false);
  });

  it('rejeita domínio sem ponto (TLD)', () => {
    expect(isValidEmail('nome@dominio')).toBe(false);
  });

  it('rejeita espaço no meio', () => {
    expect(isValidEmail('nome @dominio.com')).toBe(false);
    expect(isValidEmail('nome@dom inio.com')).toBe(false);
  });

  it('rejeita dois @', () => {
    expect(isValidEmail('nome@@dominio.com')).toBe(false);
  });
});
