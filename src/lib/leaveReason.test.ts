import { describe, expect, it } from 'vitest';
import { LEAVE_REASON_MAX, LEAVE_REASON_MIN, leaveReasonOk } from './leaveReason';

describe('leaveReasonOk — motivo pra encerrar o acompanhamento ([TRAN]-10)', () => {
  it('limites espelham a edge function (10 a 500)', () => {
    expect(LEAVE_REASON_MIN).toBe(10);
    expect(LEAVE_REASON_MAX).toBe(500);
  });

  it('vazio, só espaço ou curto demais não vale', () => {
    expect(leaveReasonOk('')).toBe(false);
    expect(leaveReasonOk('          ')).toBe(false);
    expect(leaveReasonOk('curto')).toBe(false);
  });

  it('espaço nas pontas não conta pro mínimo', () => {
    expect(leaveReasonOk('   123456789   ')).toBe(false);
    expect(leaveReasonOk('  1234567890  ')).toBe(true);
  });

  it('acima de 500 não vale', () => {
    expect(leaveReasonOk('x'.repeat(500))).toBe(true);
    expect(leaveReasonOk('x'.repeat(501))).toBe(false);
  });
});
