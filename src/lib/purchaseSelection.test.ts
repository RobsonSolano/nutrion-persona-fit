import { describe, it, expect } from 'vitest';
import type { FeatureKey, Tier } from '@/types/billing';
import { selectProductId, findPackage, availablePlans, type Role } from './purchaseSelection';

const pkg = (identifier: string) => ({ product: { identifier } });
const offerings = {
  all: {
    comum: { availablePackages: [pkg('nutrion_comum_pro:mensal')] },
    professor: {
      availablePackages: [
        pkg('nutrion_prof_pro:mensal'),
        pkg('nutrion_prof_premium:mensal'),
        pkg('nutrion_prof_elite:mensal'),
      ],
    },
  },
};

describe('selectProductId', () => {
  const sel = (
    role: Role | null,
    currentTier: Tier,
    feature?: FeatureKey,
  ) => selectProductId({ role, feature, currentTier });

  it('aluno nunca compra → null (IA herdada do professor, C4)', () => {
    expect(sel('aluno', 'free', 'chat')).toBeNull();
  });

  it('role ausente → null (defensivo)', () => {
    expect(sel(null, 'free', 'chat')).toBeNull();
  });

  it('PREM-04 comum free + IA pessoal → nutrion_comum_pro', () => {
    expect(sel('comum', 'free', 'chat')).toBe('nutrion_comum_pro');
    expect(sel('comum', 'free', 'sanity_check')).toBe('nutrion_comum_pro');
  });

  it('PREM-02 comum free + coach_discovery → nutrion_comum_premium', () => {
    expect(sel('comum', 'free', 'coach_discovery')).toBe('nutrion_comum_premium');
  });

  it('PREM-04 comum pro → nutrion_comum_premium', () => {
    expect(sel('comum', 'pro', 'chat')).toBe('nutrion_comum_premium');
    expect(sel('comum', 'pro', 'coach_discovery')).toBe('nutrion_comum_premium');
  });

  it('PREM-04 comum premium ou elite → null', () => {
    expect(sel('comum', 'premium', 'coach_discovery')).toBeNull();
    expect(sel('comum', 'elite')).toBeNull();
  });

  it('ELITE-06 professor free → nutrion_prof_pro', () => {
    expect(sel('professor', 'free', 'coach_generate_plan')).toBe('nutrion_prof_pro');
    expect(sel('professor', 'free', 'student_limit')).toBe('nutrion_prof_pro');
  });

  it('ELITE-06 professor pro + limite de alunos → nutrion_prof_premium', () => {
    expect(sel('professor', 'pro', 'student_limit')).toBe('nutrion_prof_premium');
  });

  it('ELITE-06 professor premium + limite de alunos → nutrion_prof_elite', () => {
    expect(sel('professor', 'premium', 'student_limit')).toBe('nutrion_prof_elite');
  });

  it('ELITE-06 professor elite → null (maior plano)', () => {
    expect(sel('professor', 'elite', 'student_limit')).toBeNull();
  });

  it('professor pro + feature de IA (já coberta pelo pro) → null', () => {
    expect(sel('professor', 'pro', 'coach_generate_plan')).toBeNull();
  });
});

describe('findPackage', () => {
  it('acha por prefixo productId:basePlan (formato Google)', () => {
    expect(findPackage(offerings, 'nutrion_comum_pro')?.product.identifier).toBe(
      'nutrion_comum_pro:mensal',
    );
    expect(findPackage(offerings, 'nutrion_prof_premium')?.product.identifier).toBe(
      'nutrion_prof_premium:mensal',
    );
  });

  it('acha por igualdade exata', () => {
    const exact = { all: { o: { availablePackages: [pkg('nutrion_comum_pro')] } } };
    expect(findPackage(exact, 'nutrion_comum_pro')?.product.identifier).toBe(
      'nutrion_comum_pro',
    );
  });

  it('[IOS]-05 acha os 5 IDs iOS (sem sufixo :mensal)', () => {
    const ids = [
      'nutrion_prof_pro',
      'nutrion_prof_premium',
      'nutrion_prof_elite',
      'nutrion_comum_pro',
      'nutrion_comum_premium',
    ];
    const ios = { all: { o: { availablePackages: ids.map((i) => pkg(i)) } } };
    for (const id of ids) {
      expect(findPackage(ios, id)?.product.identifier).toBe(id);
    }
  });

  it('não achou → null', () => {
    expect(findPackage(offerings, 'inexistente')).toBeNull();
  });

  it('offerings null/undefined → null (defensivo)', () => {
    expect(findPackage(null, 'nutrion_comum_pro')).toBeNull();
    expect(findPackage(undefined, 'nutrion_comum_pro')).toBeNull();
  });
});

describe('availablePlans', () => {
  const ids = (role: Role | null, currentTier: Tier) =>
    availablePlans({ role, currentTier }).map((p) => p.productId);

  it('ELITE-06 professor free → Pro, Premium e Elite, nessa ordem', () => {
    expect(availablePlans({ role: 'professor', currentTier: 'free' })).toEqual([
      { tier: 'pro', productId: 'nutrion_prof_pro' },
      { tier: 'premium', productId: 'nutrion_prof_premium' },
      { tier: 'elite', productId: 'nutrion_prof_elite' },
    ]);
  });
  it('ELITE-06 professor pro → Premium e Elite', () => {
    expect(ids('professor', 'pro')).toEqual([
      'nutrion_prof_premium',
      'nutrion_prof_elite',
    ]);
  });
  it('ELITE-06 professor premium → só Elite', () => {
    expect(ids('professor', 'premium')).toEqual(['nutrion_prof_elite']);
  });
  it('ELITE-06 professor elite → nada', () => {
    expect(ids('professor', 'elite')).toEqual([]);
  });
  it('PREM-04 comum free → Pro e Premium', () => {
    expect(availablePlans({ role: 'comum', currentTier: 'free' })).toEqual([
      { tier: 'pro', productId: 'nutrion_comum_pro' },
      { tier: 'premium', productId: 'nutrion_comum_premium' },
    ]);
  });
  it('PREM-04 comum pro → só Premium', () => {
    expect(ids('comum', 'pro')).toEqual(['nutrion_comum_premium']);
  });
  it('PREM-04 comum premium e elite → nada', () => {
    expect(ids('comum', 'premium')).toEqual([]);
    expect(ids('comum', 'elite')).toEqual([]);
  });
  it('aluno e role indefinido → nada', () => {
    expect(ids('aluno', 'free')).toEqual([]);
    expect(ids(null, 'free')).toEqual([]);
  });
  it('quem tem produto recomendado tem plano na lista, e ele está nela', () => {
    for (const role of ['aluno', 'comum', 'professor', null] as const) {
      for (const tier of ['free', 'pro', 'premium', 'elite'] as const) {
        for (const feature of [
          undefined,
          'chat',
          'coach_discovery',
          'student_limit',
        ] as const) {
          const rec = selectProductId({ role, feature, currentTier: tier });
          if (rec) expect(ids(role, tier)).toContain(rec);
        }
      }
    }
  });
});
