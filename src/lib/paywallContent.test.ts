import { describe, it, expect } from 'vitest';
import { paywallContent, planContent, coachUpgradeFeature, renewalNotice, legalLinks } from './paywallContent';

describe('paywallContent', () => {
  it('chat e sanity_check apontam pro plano pessoal', () => {
    for (const f of ['chat', 'sanity_check'] as const) {
      const c = paywallContent(f);
      expect(c.planLabel.toLowerCase()).toContain('pessoal');
      expect(c.bullets.length).toBeGreaterThan(0);
      expect(c.priceHint).toBeTruthy();
    }
  });

  it('features de coach apontam pro plano de professor', () => {
    for (const f of ['coach_generate_plan', 'coach_import_workout'] as const) {
      const c = paywallContent(f);
      expect(c.planLabel.toLowerCase()).toContain('professor');
    }
  });

  it('student_limit fala de mais alunos, não de IA', () => {
    const c = paywallContent('student_limit');
    expect(c.title.toLowerCase()).toContain('aluno');
    expect(c.bullets.join(' ').toLowerCase()).not.toContain('chat ia');
  });

  it('PREM-02 coach_discovery oferece o Plano Pessoal Premium', () => {
    const c = paywallContent('coach_discovery');
    expect(c.title).toBe('Encontre um professor');
    expect(c.planLabel).toBe('Plano Pessoal Premium');
    expect(c.bullets.length).toBeGreaterThan(0);
  });

  it('ELITE-06 student_limit lista Pro 5, Premium 20 e Elite 50 alunos', () => {
    const b = paywallContent('student_limit').bullets;
    expect(b).toContain('Pro: até 5 alunos');
    expect(b).toContain('Premium: até 20 alunos');
    expect(b).toContain('Elite: até 50 alunos');
  });

  it('feature desconhecida/undefined cai num default seguro (não lança)', () => {
    expect(() => paywallContent(undefined)).not.toThrow();
    const c = paywallContent('xpto');
    expect(c.title).toBeTruthy();
    expect(c.bullets.length).toBeGreaterThan(0);
  });
});

describe('planContent', () => {
  it('professor pro: nome Pro, 5 alunos', () => {
    const c = planContent('pro', 'professor');
    expect(c.name).toBe('Pro');
    expect(c.bullets).toContain('Até 5 alunos');
  });
  it('ELITE-06 professor premium: até 20 alunos, tudo do Pro, busca e exercícios próprios', () => {
    const c = planContent('premium', 'professor');
    expect(c.name).toBe('Premium');
    expect(c.bullets).toContain('Até 20 alunos');
    expect(c.bullets).toContain('Tudo do Pro');
    expect(c.bullets.join(' ').toLowerCase()).toContain('busca');
    expect(c.bullets.join(' ').toLowerCase()).toContain('exercícios próprios');
  });
  it('ELITE-06 professor elite: até 50 alunos e tudo do Premium', () => {
    const c = planContent('elite', 'professor');
    expect(c.name).toBe('Elite');
    expect(c.bullets).toContain('Até 50 alunos');
    expect(c.bullets).toContain('Tudo do Premium');
  });
  it('comum pro: 10 mensagens e 8 análises por dia, prato por foto', () => {
    const c = planContent('pro', 'comum');
    expect(c.name).toBe('Pro');
    expect(c.bullets).toContain('10 mensagens e 8 análises de prato por dia');
    expect(c.bullets.join(' ').toLowerCase()).toContain('prato por foto');
  });
  it('PREM-04 comum premium: tudo do Pro, busca de professor, 20 mensagens e 15 análises', () => {
    const c = planContent('premium', 'comum');
    expect(c.name).toBe('Premium');
    expect(c.bullets).toContain('Tudo do Pro');
    expect(c.bullets).toContain('Encontre um professor no app');
    expect(c.bullets).toContain('20 mensagens e 15 análises de prato por dia');
  });
  it('nenhum texto de plano ou paywall diz "ilimitado"', () => {
    const features = [undefined, 'chat', 'sanity_check', 'coach_generate_plan', 'coach_import_workout', 'student_limit', 'coach_discovery'];
    const texts = features.flatMap((f) => {
      const c = paywallContent(f);
      return [c.title, c.subtitle, c.planLabel, ...c.bullets];
    });
    for (const role of ['professor', 'comum'] as const) {
      for (const tier of ['pro', 'premium', 'elite'] as const) {
        texts.push(...planContent(tier, role).bullets);
      }
    }
    expect(texts.join(' ').toLowerCase()).not.toContain('ilimitad');
  });
});

describe('student_limit: limite atingido x upgrade voluntário', () => {
  it('ELITE-06 limite atingido de fato mantém o texto de limite', () => {
    expect(paywallContent('student_limit').subtitle).toBe(
      'Você atingiu o limite de alunos do seu plano atual.',
    );
  });

  it('ELITE-06 upgrade voluntário não diz que o limite foi atingido', () => {
    const c = paywallContent('student_limit', 'upgrade');
    expect(c.subtitle).toBe('Acompanhe mais alunos com um plano maior.');
    expect(c.subtitle.toLowerCase()).not.toContain('atingiu');
    expect(c.bullets).toEqual(paywallContent('student_limit').bullets);
  });

  it('origem voluntária não altera outras features', () => {
    expect(paywallContent('chat', 'upgrade')).toEqual(paywallContent('chat'));
  });
});

describe('coachUpgradeFeature', () => {
  it('pro ou acima esbarra em limite de alunos; abaixo, na IA de professor', () => {
    expect(coachUpgradeFeature('free')).toBe('coach_generate_plan');
    expect(coachUpgradeFeature('pro')).toBe('student_limit');
    expect(coachUpgradeFeature('premium')).toBe('student_limit');
    expect(coachUpgradeFeature('elite')).toBe('student_limit');
  });
});

describe('renewalNotice ([IOS]-07)', () => {
  it('iOS cita conta Apple, 24 horas e Ajustes', () => {
    const t = renewalNotice('ios');
    expect(t).toContain('conta Apple');
    expect(t).toContain('24 horas');
    expect(t).toContain('Ajustes');
  });

  it('Android cita Google Play', () => {
    expect(renewalNotice('android')).toContain('Google Play');
  });

  it('web cai no texto Google', () => {
    expect(renewalNotice('web')).toBe(renewalNotice('android'));
  });
});

describe('legalLinks ([IOS]-07)', () => {
  it('usa as URLs do catálogo quando existem', () => {
    const l = legalLinks({ termos_uso: 'https://x/t', privacidade: 'https://x/p' });
    expect(l).toEqual({ termos: 'https://x/t', privacidade: 'https://x/p' });
  });

  it('cai no fallback do hotsite quando falta URL', () => {
    const l = legalLinks({});
    expect(l.termos).toBe('https://apppersonafit.vercel.app/legal/termos-de-uso');
    expect(l.privacidade).toBe('https://apppersonafit.vercel.app/legal/privacidade');
    expect(legalLinks({ termos_uso: '' }).termos).toBe(l.termos);
  });
});
