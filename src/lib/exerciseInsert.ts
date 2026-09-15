import type {
  RoutineExercise,
  RoutineExerciseInsert,
  TemplateExercise,
} from '@/types/database';

/**
 * Mapeia um exercício lido do banco para o formato de insert, tirando as chaves
 * de identidade. `RoutineExercise` e `TemplateExercise` têm os mesmos campos —
 * só diferem em `routine_id`/`template_id` —, então uma função serve às duas.
 *
 * Existe porque esse mapeamento estava copiado em 5 telas (duplicação anterior
 * a esta feature): duplicar o campo a campo significa que toda métrica nova
 * obriga a editar os 5 lugares na mão, e esquecer um é silencioso.
 * O `?? 'strength'` / `?? null` cobre linha lida antes da migration rodar.
 */
export function toExerciseInsert(
  e: RoutineExercise | TemplateExercise,
): Omit<RoutineExerciseInsert, 'routine_id'> {
  return {
    exercise_id: e.exercise_id,
    exercise_name: e.exercise_name,
    equipment: e.equipment,
    sort_order: e.sort_order,
    sets: e.sets,
    reps_min: e.reps_min,
    reps_max: e.reps_max,
    weight_min_kg: e.weight_min_kg,
    weight_max_kg: e.weight_max_kg,
    duration_min: e.duration_min,
    metric_type: e.metric_type ?? 'strength',
    distance_min_m: e.distance_min_m ?? null,
    distance_max_m: e.distance_max_m ?? null,
    cadence_rpm: e.cadence_rpm ?? null,
    // Série conjunta: preservar o par ao copiar/duplicar. Perder estes dois
    // campos aqui desfaria o bi-set silenciosamente em qualquer tela que
    // reaproveite a prescrição.
    pair_key: e.pair_key ?? null,
    pair_role: e.pair_role ?? null,
    notes: e.notes,
  };
}
