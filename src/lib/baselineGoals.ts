// Metas nutricionais determinísticas (Mifflin-St Jeor), sem IA.
//
// POR QUE EXISTE: um coach FREE tem direito a alunos (student_limit) mas não à
// IA de professor (ai_coach). O cadastro por template precisa de metas (kcal,
// proteína, água) pro app do aluno funcionar, e essas metas vinham da IA. Sem
// isso, o free nunca cadastrava. Aqui o cálculo é o MESMO do fallback do
// servidor (_shared/fallbackPlan.ts) — espelhado no cliente pra não depender de
// uma chamada de função gated.

import type { GoalType, Sex } from '@/types/database';

export type BaselineGoalsInput = {
  sex: Sex | null;
  birthYear: number | null;
  weightKg: number | null;
  heightCm: number | null;
  goalType: GoalType | null;
};

export type BaselineGoals = {
  calorie_goal: number;
  protein_goal_g: number;
  water_goal_ml: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Mifflin-St Jeor + fator de atividade conservador (1.4) + ajuste por
 * objetivo. Defaults seguros quando falta dado (mesmos do servidor).
 */
export function computeBaselineGoals(input: BaselineGoalsInput): BaselineGoals {
  const weight = input.weightKg ?? 70;
  const height = input.heightCm ?? 170;
  const age =
    input.birthYear != null
      ? new Date().getFullYear() - input.birthYear
      : 30;
  const sexMale = input.sex === 'm';

  const bmr = sexMale
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161;
  const tdee = bmr * 1.4;

  let calorie = tdee;
  if (input.goalType === 'lose_fat' || input.goalType === 'reduce_body_fat') {
    calorie = tdee - 400;
  } else if (input.goalType === 'gain_muscle') {
    calorie = tdee + 250;
  }

  return {
    calorie_goal: clamp(calorie, 800, 6000),
    protein_goal_g: clamp(weight * 1.8, 40, 400),
    water_goal_ml: clamp(weight * 35, 1000, 8000),
  };
}
