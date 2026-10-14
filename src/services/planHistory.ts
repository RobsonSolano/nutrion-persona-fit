import { supabase } from './supabase';

export type PlanRevision = {
  id: string;
  student_id: string;
  // null depois do desvínculo: a revisão fica com o aluno e sai do alcance do ex-professor.
  coach_id: string | null;
  rationale: string | null;
  calorie_goal: number | null;
  protein_goal_g: number | null;
  water_goal_ml: number | null;
  created_at: string;
  routines_count: number;
};

export type PlanRevisionRoutineExercise = {
  exercise_name: string;
  equipment: string | null;
  sort_order: number;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  duration_min: number | null;
  notes: string | null;
};

export type PlanRevisionRoutine = {
  id: string;
  name: string;
  description: string | null;
  modality: string;
  exercises: PlanRevisionRoutineExercise[];
};

export type PlanRevisionDetail = {
  revision: PlanRevision;
  routines: PlanRevisionRoutine[];
};

export async function listStudentPlanRevisions(
  studentId: string,
): Promise<PlanRevision[]> {
  // Conta rotinas por revisão num único round-trip via PostgREST aggregate.
  const { data, error } = await supabase
    .from('student_plan_revisions')
    .select('*, routines:workout_routines(count)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r) => {
    const { routines, ...rest } = r as PlanRevision & {
      routines: { count: number }[] | null;
    };
    return {
      ...rest,
      routines_count: routines?.[0]?.count ?? 0,
    };
  });
}

export async function getPlanRevisionDetail(
  revisionId: string,
): Promise<PlanRevisionDetail> {
  const { data: revision, error: revErr } = await supabase
    .from('student_plan_revisions')
    .select('*')
    .eq('id', revisionId)
    .single();
  if (revErr) throw revErr;

  const { data: routines, error: rErr } = await supabase
    .from('workout_routines')
    .select(
      'id, name, description, modality, exercises:workout_routine_exercises(exercise_name, equipment, sort_order, sets, reps_min, reps_max, weight_min_kg, weight_max_kg, duration_min, notes)',
    )
    .eq('plan_revision_id', revisionId)
    .order('created_at', { ascending: true });
  if (rErr) throw rErr;

  const normalized = (routines ?? []).map((r) => {
    const { exercises, ...rest } = r as PlanRevisionRoutine & {
      exercises: PlanRevisionRoutineExercise[] | null;
    };
    const sortedExercises = (exercises ?? []).sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    return { ...rest, exercises: sortedExercises };
  });

  return {
    revision: { ...(revision as PlanRevision), routines_count: normalized.length },
    routines: normalized,
  };
}
