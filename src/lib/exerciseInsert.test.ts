import { describe, it, expect } from 'vitest';
import { toExerciseInsert } from './exerciseInsert';
import type { RoutineExercise } from '@/types/database';

const base: RoutineExercise = {
  id: 'row-1',
  routine_id: 'rot-1',
  exercise_id: 'ex-1',
  exercise_name: 'Supino reto',
  equipment: 'barra',
  sort_order: 2,
  sets: 4,
  reps_min: 8,
  reps_max: 12,
  weight_min_kg: 60,
  weight_max_kg: 80,
  duration_min: null,
  metric_type: 'strength',
  distance_min_m: null,
  distance_max_m: null,
  cadence_rpm: null,
  notes: 'cadência 2-1-2',
};

describe('toExerciseInsert', () => {
  it('tira id/routine_id e preserva todo o resto', () => {
    const insert = toExerciseInsert(base);

    expect(insert).not.toHaveProperty('id');
    expect(insert).not.toHaveProperty('routine_id');
    expect(insert).toEqual({
      exercise_id: 'ex-1',
      exercise_name: 'Supino reto',
      equipment: 'barra',
      sort_order: 2,
      sets: 4,
      reps_min: 8,
      reps_max: 12,
      weight_min_kg: 60,
      weight_max_kg: 80,
      duration_min: null,
      metric_type: 'strength',
      distance_min_m: null,
      distance_max_m: null,
      cadence_rpm: null,
      notes: 'cadência 2-1-2',
    });
  });

  it('CAR-01: preserva as métricas de cárdio', () => {
    const insert = toExerciseInsert({
      ...base,
      exercise_name: 'Esteira (corrida)',
      metric_type: 'cardio',
      distance_min_m: 3000,
      distance_max_m: 5000,
      duration_min: 30,
      cadence_rpm: null,
      sets: null,
      reps_min: null,
      reps_max: null,
      weight_min_kg: null,
      weight_max_kg: null,
    });

    expect(insert.metric_type).toBe('cardio');
    expect(insert.distance_min_m).toBe(3000);
    expect(insert.distance_max_m).toBe(5000);
    expect(insert.duration_min).toBe(30);
  });

  it('CAR-07: dado gravado antes da migration (campos ausentes) cai nos defaults', () => {
    // Simula linha lida antes das colunas existirem.
    const antigo = { ...base } as Partial<RoutineExercise>;
    delete antigo.metric_type;
    delete antigo.distance_min_m;
    delete antigo.distance_max_m;
    delete antigo.cadence_rpm;

    const insert = toExerciseInsert(antigo as RoutineExercise);

    expect(insert.metric_type).toBe('strength');
    expect(insert.distance_min_m).toBeNull();
    expect(insert.distance_max_m).toBeNull();
    expect(insert.cadence_rpm).toBeNull();
  });
});
