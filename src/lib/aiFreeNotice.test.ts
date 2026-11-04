import { describe, it, expect } from 'vitest';
import { showTemporaryFreeNotice, aiFreeNoticeText } from './aiFreeNotice';
import { AI_QUOTA_BASE, AI_QUOTA_PREMIUM, dailyAiQuota } from './aiQuota';

describe('showTemporaryFreeNotice', () => {
  it('PREM-03 aviso de "temporariamente gratuito" só para quem não tem plano pago', () => {
    expect(showTemporaryFreeNotice('free')).toBe(true);
    expect(showTemporaryFreeNotice('pro')).toBe(false);
    expect(showTemporaryFreeNotice('premium')).toBe(false);
    expect(showTemporaryFreeNotice('elite')).toBe(false);
  });

  it('entitlement ainda não resolvido não mostra o aviso (evita piscar)', () => {
    expect(showTemporaryFreeNotice(undefined)).toBe(false);
  });
});

const full = (t: { before: string; highlight: string; after: string }) =>
  t.before + t.highlight + t.after;

describe('aiFreeNoticeText', () => {
  it('devolve o trecho em destaque separado do antes e do depois', () => {
    const t = aiFreeNoticeText({ quota: AI_QUOTA_BASE, maxChars: 255, earlyAdopter: false });
    expect(t.highlight).toBe('temporariamente gratuitos');
    expect(t.before.endsWith('são ')).toBe(true);
    expect(t.after.startsWith('.')).toBe(true);
  });

  it('PREM-03 usa os números da cota do app, não valores fixos', () => {
    const t = full(aiFreeNoticeText({ quota: dailyAiQuota('free'), maxChars: 255, earlyAdopter: false }));
    expect(t).toContain(`Chat (${AI_QUOTA_BASE.chat}/dia · 255 caracteres)`);
    expect(t).toContain(`Análise de prato (${AI_QUOTA_BASE.sanity}/dia)`);
    expect(t).not.toContain('5/dia');
    const p = full(aiFreeNoticeText({ quota: AI_QUOTA_PREMIUM, maxChars: 255, earlyAdopter: false }));
    expect(p).toContain('20/dia');
    expect(p).toContain('15/dia');
  });

  it('early adopter mantém a frase de acesso futuro; demais, a frase padrão', () => {
    const base = { quota: AI_QUOTA_BASE, maxChars: 255 };
    expect(full(aiFreeNoticeText({ ...base, earlyAdopter: true }))).toContain('early adopter');
    expect(full(aiFreeNoticeText({ ...base, earlyAdopter: false }))).toContain('Aproveita');
  });
});
