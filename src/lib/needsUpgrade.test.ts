import { describe, it, expect } from 'vitest';
import {
  NeedsUpgradeError,
  parseNeedsUpgrade,
  needsUpgradeFromInvokeError,
  needsUpgradeFromRpcError,
} from './needsUpgrade';

describe('parseNeedsUpgrade', () => {
  it('detecta 402 needs_upgrade e extrai a feature', () => {
    const err = parseNeedsUpgrade(
      402,
      '{"error":"needs_upgrade","feature":"chat"}',
    );
    expect(err).toBeInstanceOf(NeedsUpgradeError);
    expect(err?.feature).toBe('chat');
  });

  it('não mascara outro 402 que não seja needs_upgrade', () => {
    expect(parseNeedsUpgrade(402, '{"error":"other"}')).toBeNull();
  });

  it('não dispara para 402 sem feature', () => {
    expect(parseNeedsUpgrade(402, '{"error":"needs_upgrade"}')).toBeNull();
  });

  it('ignora status diferente de 402', () => {
    expect(
      parseNeedsUpgrade(429, '{"error":"needs_upgrade","feature":"chat"}'),
    ).toBeNull();
  });

  it('retorna null para body não-JSON', () => {
    expect(parseNeedsUpgrade(402, 'rate limited, try later')).toBeNull();
  });
});

describe('needsUpgradeFromInvokeError', () => {
  it('lê o body do Response em FunctionsHttpError.context', async () => {
    const fakeInvokeError = {
      name: 'FunctionsHttpError',
      context: new Response(
        '{"error":"needs_upgrade","feature":"coach_import_workout"}',
        { status: 402 },
      ),
    };
    const err = await needsUpgradeFromInvokeError(fakeInvokeError);
    expect(err).toBeInstanceOf(NeedsUpgradeError);
    expect(err?.feature).toBe('coach_import_workout');
  });

  it('retorna null para erro comum (sem context Response)', async () => {
    expect(await needsUpgradeFromInvokeError(new Error('boom'))).toBeNull();
  });

  it('retorna null quando o context não é 402', async () => {
    const e = { context: new Response('{}', { status: 500 }) };
    expect(await needsUpgradeFromInvokeError(e)).toBeNull();
  });
});

describe('needsUpgradeFromRpcError', () => {
  it('PREM-02 converte code PT402 em NeedsUpgradeError com a feature da mensagem', () => {
    const err = needsUpgradeFromRpcError({
      code: 'PT402',
      message: 'needs_upgrade:coach_discovery',
    }, 'x');
    expect(err).toBeInstanceOf(NeedsUpgradeError);
    expect(err?.feature).toBe('coach_discovery');
  });

  it('PREM-02 converte só pela mensagem needs_upgrade:', () => {
    const err = needsUpgradeFromRpcError({ message: 'needs_upgrade:coach_discovery' }, 'x');
    expect(err?.feature).toBe('coach_discovery');
  });

  it('PREM-02 PT402 sem feature na mensagem usa a feature padrão', () => {
    expect(needsUpgradeFromRpcError({ code: 'PT402', message: '' }, 'coach_discovery')?.feature).toBe(
      'coach_discovery',
    );
  });

  it('PREM-02 erro comum vira null', () => {
    expect(needsUpgradeFromRpcError({ code: '42501', message: 'permission denied' }, 'x')).toBeNull();
    expect(needsUpgradeFromRpcError(new Error('boom'), 'x')).toBeNull();
  });

  it('PREM-02 null e undefined viram null', () => {
    expect(needsUpgradeFromRpcError(null, 'x')).toBeNull();
    expect(needsUpgradeFromRpcError(undefined, 'x')).toBeNull();
  });
});
