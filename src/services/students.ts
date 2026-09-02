import { supabase } from './supabase';
import type {
  DisabilityType,
  GoalType,
  Profile,
  Sex,
  WeeklyFrequency,
} from '@/types/database';
import type { OnboardingPlan } from './onboarding';
import { parseNeedsUpgrade } from '@/lib/needsUpgrade';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const FN = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

export type StudentLite = Pick<
  Profile,
  | 'id'
  | 'full_name'
  | 'avatar_url'
  | 'weight_kg'
  | 'height_cm'
  | 'goal_type'
  | 'created_at'
  | 'onboarding_completed_at'
  | 'suspended_at'
>;

export type StudentDetailed = Profile;

export type StudentRoutineLite = {
  id: string;
  name: string;
  modality: string;
  description: string | null;
  exercises_count: number;
  created_at: string;
  sort_order: number;
};

export type StudentDetail = {
  profile: Profile;
  routines: StudentRoutineLite[];
};

export async function getStudentDetail(
  studentId: string,
): Promise<StudentDetail> {
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', studentId)
    .single();
  if (pErr) throw pErr;

  const { data: routines, error: rErr } = await supabase
    .from('workout_routines')
    .select('id, name, modality, description, created_at, sort_order, exercises:workout_routine_exercises(count)')
    .eq('user_id', studentId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (rErr) throw rErr;

  const routinesLite = (routines ?? []).map((r) => {
    const { exercises, ...rest } = r as {
      id: string;
      name: string;
      modality: string;
      description: string | null;
      created_at: string;
      sort_order: number;
      exercises: { count: number }[] | null;
    };
    return {
      ...rest,
      exercises_count: exercises?.[0]?.count ?? 0,
    };
  });

  return {
    profile: profile as Profile,
    routines: routinesLite,
  };
}

export type CreateStudentInput = {
  email: string;
  password: string;
  full_name: string;
  sex?: Sex | null;
  birth_year?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  goal_type?: GoalType | null;
  goal_weight_kg?: number | null;
  goal_target_date?: string | null;
  practices_sport?: boolean | null;
  sports?: string[] | null;
  weekly_frequency?: WeeklyFrequency | null;
  water_goal_ml?: number | null;
  allergies?: string | null;
  physical_limitations?: string | null;
  has_disability?: boolean | null;
  disability_types?: DisabilityType[];
  disability_notes?: string | null;
  bio?: string | null;
};

async function callFn<T>(name: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login de novo.');

  const res = await fetch(FN(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // Gating do billing-core: 402 needs_upgrade → erro tipado pro paywall.
    const nu = parseNeedsUpgrade(res.status, text);
    if (nu) throw nu;
    let code = '';
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      code = typeof parsed?.error === 'string' ? parsed.error : '';
      detail = parsed?.detail ?? parsed?.error ?? text;
    } catch {
      // raw
    }
    // Preserva o CÓDIGO do erro (ex: email_already_registered) na mensagem pra o
    // parseError (GlobalAlertProvider) mapear pra texto claro de forma confiável,
    // sem depender do texto cru do servidor (que varia).
    const label = code && code !== detail ? `${code} · ${detail}` : detail;
    throw new Error(`${res.status} · ${label}`);
  }

  return (await res.json()) as T;
}

/** Lista os alunos do professor logado. */
export async function listStudents(): Promise<StudentLite[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessão expirada.');

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, avatar_url, weight_kg, height_cm, goal_type, created_at, onboarding_completed_at, suspended_at',
    )
    .eq('coach_id', user.id)
    .eq('role', 'aluno')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StudentLite[];
}

export async function createStudent(
  input: CreateStudentInput,
): Promise<{ student: Profile }> {
  return callFn<{ student: Profile }>('coach-create-student', input);
}

export async function generatePlanForStudent(
  studentId: string,
  options: { skipRoutines?: boolean } = {},
): Promise<{ plan: OnboardingPlan }> {
  return callFn<{ plan: OnboardingPlan }>('coach-generate-plan', {
    student_id: studentId,
    skip_routines: options.skipRoutines ?? false,
  });
}

export async function saveStudentPlan(
  studentId: string,
  plan: OnboardingPlan,
): Promise<{ profile: Profile; routines: { id: string; name: string }[] }> {
  return callFn('coach-save-student-plan', { student_id: studentId, plan });
}

/** Envia email pro aluno com email + senha (Gmail SMTP via edge function). */
export async function sendStudentCredentials(
  studentId: string,
  password: string,
): Promise<{ ok: true; sent_to: string }> {
  return callFn('coach-send-credentials', {
    student_id: studentId,
    password,
  });
}

export type UpdateStudentPatch = Partial<{
  full_name: string | null;
  sex: 'm' | 'f' | 'o' | null;
  birth_year: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  goal_type: 'lose_fat' | 'maintain' | 'gain_muscle' | 'reduce_body_fat' | null;
  goal_weight_kg: number | null;
  goal_target_date: string | null;
  practices_sport: boolean | null;
  sports: string[] | null;
  weekly_frequency: string | null;
  water_goal_ml: number | null;
  daily_calorie_goal: number | null;
  protein_goal_g: number | null;
  carbs_goal_g: number | null;
  allergies: string | null;
  physical_limitations: string | null;
  has_disability: boolean | null;
  disability_types: DisabilityType[];
  disability_notes: string | null;
  bio: string | null;
}>;

export async function updateStudent(
  studentId: string,
  patch: UpdateStudentPatch,
): Promise<{ student: Profile }> {
  return callFn<{ student: Profile }>('coach-update-student', {
    student_id: studentId,
    patch,
  });
}

/**
 * Desvincula um aluno do coach: o aluno vira `role='comum'`,
 * perde `coach_id`, e o coach perde acesso aos dados dele. Notas
 * privadas do coach são apagadas. Plan revisions têm coach_id
 * setado pra null (aluno mantém histórico). Aluno recebe push
 * `coach_unlinked` fire-and-forget.
 *
 * Substitui a antiga `deleteStudent` (que excluía a conta do
 * aluno). Coach não tem mais esse poder — LGPD/loja exige que
 * apenas o próprio usuário possa excluir a própria conta.
 */
export async function unlinkStudent(studentId: string): Promise<{ ok: true }> {
  return callFn<{ ok: true }>('coach-unlink-student', {
    student_id: studentId,
  });
}

/**
 * Define o conjunto de alunos ATIVOS do professor. Os de fora ficam suspensos
 * (sem acesso ao app até serem reativados ou o professor fazer upgrade).
 * Substitui a lógica destrutiva de "escolher quem fica" (que desvinculava).
 */
export async function setActiveStudents(
  activeIds: string[],
): Promise<{ ok: true }> {
  return callFn<{ ok: true }>('coach-set-active-students', {
    active_ids: activeIds,
  });
}
