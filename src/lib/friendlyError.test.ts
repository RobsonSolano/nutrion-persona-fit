import { describe, expect, it } from 'vitest';
import { INSTABILIDADE, friendlyMessage, parseError } from './friendlyError';

describe('parseError', () => {
  it('não mostra o erro do Groq do print de 2026-11-09', () => {
    const err = new Error(
      "502 · 400: Failed to validate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
    );
    expect(parseError(err)).toEqual({
      title: 'Instabilidade',
      message: INSTABILIDADE,
    });
  });

  it('5xx genérico vira instabilidade', () => {
    expect(parseError(new Error('500 · boom')).message).toBe(INSTABILIDADE);
  });

  it('rate limit mantém os segundos do servidor', () => {
    const r = parseError(new Error('rate_limit · Aguarda ~45s e tenta de novo.'));
    expect(r.title).toBe('Muitas requisições');
    expect(r.message).toContain('~45s');
  });

  it('cota diária tipada (DailyLimitError tem message "daily_limit") não vaza o código', () => {
    const r = parseError(new Error('daily_limit'));
    expect(r.title).toBe('Limite diário');
    expect(r.message).not.toContain('daily_limit');
  });

  it('sem conexão', () => {
    expect(parseError(new TypeError('Network request failed')).title).toBe(
      'Sem conexão',
    );
  });

  it('mensagem já amigável do próprio app passa intacta', () => {
    const msg =
      'Essa foto ainda está grande demais pra IA processar. Tenta uma foto menor ou mais simples.';
    expect(parseError(new Error(msg)).message).toBe(msg);
  });

  describe('defesa: texto técnico sem prefixo HTTP não chega ao usuário', () => {
    it.each([
      'Failed to validate JSON',
      'new row violates row-level security policy for table "food_logs"',
      'duplicate key value violates unique constraint "x_pkey"',
      "Cannot read properties of undefined (reading 'id')",
      'undefined is not an object (evaluating x.y)',
      'JSON Parse error: Unexpected character: <',
      'Edge Function returned a non-2xx status code',
    ])('%s', (raw) => {
      expect(parseError(new Error(raw)).message).toBe(INSTABILIDADE);
    });
  });

  it('valor não-Error também é tratado', () => {
    expect(parseError('500 · x').message).toBe(INSTABILIDADE);
  });
});

describe('friendlyMessage', () => {
  // Para telas que usam Alert.alert(título de contexto, mensagem): troca só a
  // mensagem crua, o título "Não consegui salvar" etc. continua da tela.
  it('traduz erro técnico', () => {
    expect(
      friendlyMessage(new Error('new row violates row-level security policy')),
    ).toBe(INSTABILIDADE);
  });

  it('mantém mensagem amigável', () => {
    expect(friendlyMessage(new Error('Sessão expirada. Faça login de novo.'))).toBe(
      'Sua sessão expirou. Faça login novamente pra continuar.',
    );
  });

  it('erro sem mensagem não vira tela vazia', () => {
    expect(friendlyMessage(new Error(''))).toBe(INSTABILIDADE);
    expect(friendlyMessage(undefined)).toBe(INSTABILIDADE);
  });
});
