import { describe, expect, it } from 'vitest';
import { hasUnseenReply, supportErrorMessage, unreadReplies, validateSupportMessage } from './support';

describe('validateSupportMessage — [SUP]-02', () => {
  it('aceita título de 3+ e descrição preenchida', () => {
    expect(validateSupportMessage({ title: 'Erro no treino', body: 'Tela branca' })).toBeNull();
  });
  it('título curto', () => {
    expect(validateSupportMessage({ title: ' oi ', body: 'x' })).toBe('Escreva um título com pelo menos 3 letras.');
  });
  it('descrição vazia', () => {
    expect(validateSupportMessage({ title: 'Erro no treino', body: '   ' })).toBe('Conte o que aconteceu na descrição.');
  });
  it('limites de tamanho', () => {
    expect(validateSupportMessage({ title: 'a'.repeat(121), body: 'x' })).toBe('O título passou de 120 caracteres.');
    expect(validateSupportMessage({ title: 'Erro', body: 'x'.repeat(2001) })).toBe('A descrição passou de 2000 caracteres.');
  });
});

describe('supportErrorMessage', () => {
  it('traduz o limite diário e cai no genérico no resto', () => {
    expect(supportErrorMessage('daily_limit')).toMatch(/limite de mensagens/);
    expect(supportErrorMessage('qualquer coisa')).toBe('Não consegui enviar agora. Tenta de novo em instantes.');
  });
});

describe('unreadReplies', () => {
  it('conta respostas que a pessoa ainda não abriu', () => {
    expect(
      unreadReplies([
        { reply: 'oi', reply_seen_at: null },
        { reply: 'oi', reply_seen_at: '2026-10-15T10:00:00Z' },
        { reply: null, reply_seen_at: null },
      ]),
    ).toBe(1);
  });
});

describe('hasUnseenReply', () => {
  it('só com resposta e sem leitura', () => {
    expect(hasUnseenReply({ reply: 'oi', reply_seen_at: null })).toBe(true);
    expect(hasUnseenReply({ reply: null, reply_seen_at: null })).toBe(false);
  });
});
