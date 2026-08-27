import { describe, expect, it } from 'vitest';
import { computeBaselineGoals } from './baselineGoals';

describe('computeBaselineGoals', () => {
  it('homem 80kg/180cm/1990 perda de gordura → déficit', () => {
    const g = computeBaselineGoals({
      sex: 'm', birthYear: 1990, weightKg: 80, heightCm: 180, goalType: 'lose_fat',
    });
    // bmr=800+1125-180+5=1750; tdee=2450; -400=2050 (idade 2026-1990=36)
    expect(g.calorie_goal).toBe(2050);
    expect(g.protein_goal_g).toBe(144); // 80*1.8
    expect(g.water_goal_ml).toBe(2800); // 80*35
  });

  it('ganho de massa → superávit', () => {
    const base = computeBaselineGoals({ sex:'m', birthYear:1990, weightKg:80, heightCm:180, goalType:'maintain' });
    const gain = computeBaselineGoals({ sex:'m', birthYear:1990, weightKg:80, heightCm:180, goalType:'gain_muscle' });
    expect(gain.calorie_goal).toBe(base.calorie_goal + 250); // maintain=tdee, gain=tdee+250
  });

  it('mulher usa a constante -161', () => {
    const h = computeBaselineGoals({ sex:'f', birthYear:1990, weightKg:80, heightCm:180, goalType:'maintain' });
    const m = computeBaselineGoals({ sex:'m', birthYear:1990, weightKg:80, heightCm:180, goalType:'maintain' });
    expect(m.calorie_goal).toBeGreaterThan(h.calorie_goal);
  });

  it('dados faltando cai em defaults seguros, sem NaN', () => {
    const g = computeBaselineGoals({ sex:null, birthYear:null, weightKg:null, heightCm:null, goalType:null });
    expect(Number.isFinite(g.calorie_goal)).toBe(true);
    expect(g.calorie_goal).toBeGreaterThanOrEqual(800);
    expect(g.protein_goal_g).toBe(126); // 70*1.8
  });

  it('clampa valores absurdos pra faixas seguras', () => {
    const g = computeBaselineGoals({ sex:'m', birthYear:2010, weightKg:300, heightCm:250, goalType:'gain_muscle' });
    expect(g.calorie_goal).toBeLessThanOrEqual(6000);
    expect(g.protein_goal_g).toBeLessThanOrEqual(400);
    expect(g.water_goal_ml).toBeLessThanOrEqual(8000);
  });
});
