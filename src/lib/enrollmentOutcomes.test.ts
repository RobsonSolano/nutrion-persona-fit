import { describe, expect, it } from 'vitest';
import { outcomesToAnnounce } from './enrollmentOutcomes';

const base = {
  coach_id: 'coach-a',
  seen_by_student_at: null as string | null,
};

describe('outcomesToAnnounce — o que o aviso de abertura mostra', () => {
  it('aceite não visto do professor atual é anunciado', () => {
    const r = [{ ...base, id: '1', status: 'efetuado' as const }];
    expect(outcomesToAnnounce(r, 'coach-a').map((x) => x.id)).toEqual(['1']);
  });

  it('aceite já visto não volta', () => {
    const r = [{ ...base, id: '1', status: 'efetuado' as const, seen_by_student_at: '2026-10-13' }];
    expect(outcomesToAnnounce(r, 'coach-a')).toEqual([]);
  });

  it('aceite de quem já não é seu professor não é anunciado (desvinculado antes de ver)', () => {
    const r = [{ ...base, id: '1', status: 'efetuado' as const }];
    expect(outcomesToAnnounce(r, null)).toEqual([]);
    expect(outcomesToAnnounce(r, 'coach-b')).toEqual([]);
  });

  it('recusa continua sendo anunciada, tenha ou não professor', () => {
    const r = [{ ...base, id: '1', status: 'cancelado' as const }];
    expect(outcomesToAnnounce(r, null).map((x) => x.id)).toEqual(['1']);
  });

  it('pendente e em andamento não são desfecho', () => {
    const r = [
      { ...base, id: '1', status: 'pendente' as const },
      { ...base, id: '2', status: 'andamento' as const },
    ];
    expect(outcomesToAnnounce(r, null)).toEqual([]);
  });
});
