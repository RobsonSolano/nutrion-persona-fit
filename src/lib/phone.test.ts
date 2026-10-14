import { describe, expect, it } from 'vitest';
import { isValidPhone, maskPhoneBR, parsePhoneInput, whatsappUrl } from './phone';

describe('whatsappUrl', () => {
  it('número BR sem DDI ganha o 55 (wa.me exige o código do país)', () => {
    // Sem isso, wa.me/11987654321 vira +1 (EUA) e abre conversa com estranho.
    expect(whatsappUrl('11987654321')).toBe('https://wa.me/5511987654321');
    expect(whatsappUrl('(11) 3333-4444')).toBe('https://wa.me/551133334444');
  });

  it('número que já tem DDI fica como está', () => {
    expect(whatsappUrl('5511987654321')).toBe('https://wa.me/5511987654321');
  });
});

describe('maskPhoneBR — máscara enquanto digita', () => {
  it('vazio continua vazio', () => {
    expect(maskPhoneBR('')).toBe('');
  });

  it('abre o parêntese já no DDD', () => {
    expect(maskPhoneBR('1')).toBe('(1');
    expect(maskPhoneBR('11')).toBe('(11');
  });

  it('fecha o DDD quando começa o número', () => {
    expect(maskPhoneBR('119')).toBe('(11) 9');
    expect(maskPhoneBR('119999')).toBe('(11) 9999');
  });

  it('fixo com 10 dígitos: (11) 3333-4444', () => {
    expect(maskPhoneBR('1133334444')).toBe('(11) 3333-4444');
  });

  it('celular com 11 dígitos: (11) 99999-8888', () => {
    expect(maskPhoneBR('11999998888')).toBe('(11) 99999-8888');
  });

  it('celular incompleto já usa o hífen do celular (não pula no 11º dígito)', () => {
    expect(maskPhoneBR('11999998')).toBe('(11) 99999-8');
  });

  it('não deixa hífen pendurado — senão o backspace trava nele', () => {
    // Apagar o último dígito depois do hífen deixa "(11) 98765-"; o backspace
    // seguinte tira o hífen e a máscara não pode devolvê-lo.
    expect(maskPhoneBR('1198765')).toBe('(11) 98765');
    expect(maskPhoneBR('(11) 98765')).toBe('(11) 98765');
    expect(maskPhoneBR('(11) 98765-')).toBe('(11) 98765');
    expect(maskPhoneBR('113333')).toBe('(11) 3333');
  });

  it('ignora o que não é dígito e reaplica sobre texto já mascarado', () => {
    expect(maskPhoneBR('(11) 99999-888')).toBe('(11) 99999-888');
    expect(maskPhoneBR('(11) 3333-4444a')).toBe('(11) 3333-4444');
  });

  it('para em 11 dígitos', () => {
    expect(maskPhoneBR('119999988887')).toBe('(11) 99999-8888');
  });

  it('número salvo com DDI 55 perde o DDI', () => {
    expect(maskPhoneBR('5511999998888')).toBe('(11) 99999-8888');
  });

  it('apagar o espaço depois do DDD não trava a edição', () => {
    // "(11) 9" → apaga o 9 → "(11) " → só sobra o DDD
    expect(maskPhoneBR('(11) ')).toBe('(11');
  });

  it('o valor mascarado volta para dígitos válidos', () => {
    const digits = parsePhoneInput(maskPhoneBR('11999998888'));
    expect(digits).toBe('11999998888');
    expect(isValidPhone(digits)).toBe(true);
  });
});
