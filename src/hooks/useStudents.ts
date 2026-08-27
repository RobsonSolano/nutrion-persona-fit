import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStudent,
  generatePlanForStudent,
  getStudentDetail,
  listStudents,
  saveStudentPlan,
  sendStudentCredentials,
  setActiveStudents,
  unlinkStudent,
  updateStudent,
  type CreateStudentInput,
  type UpdateStudentPatch,
} from '@/services/students';
import {
  createRoutine,
  deleteRoutine,
  replaceRoutineExercises,
  updateRoutine,
} from '@/services/routines';
import { getStudentTracking } from '@/services/studentTracking';
import type { OnboardingPlan } from '@/services/onboarding';
import type {
  Modality,
  RoutineExerciseInsert,
  WorkoutRoutine,
} from '@/types/database';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from './useAuth';

const studentsKey = (coachId: string) => ['students', coachId] as const;
export const studentDetailKey = (studentId: string) =>
  ['student_detail', studentId] as const;
const studentTrackingKey = (studentId: string) =>
  ['student_tracking', studentId] as const;

export function useStudents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: studentsKey(user?.id ?? 'anon'),
    queryFn: listStudents,
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

export function useStudentDetail(studentId: string | null) {
  return useQuery({
    queryKey: studentDetailKey(studentId ?? 'none'),
    queryFn: () => {
      if (!studentId) throw new Error('student_id ausente');
      return getStudentDetail(studentId);
    },
    enabled: !!studentId,
    staleTime: 15_000,
  });
}

/**
 * Aderência semanal + snapshot do dia. Buscado em paralelo com o
 * detail do aluno; staleTime curto pra refletir logs frescos quando
 * o professor abre a tela.
 */
export function useStudentTracking(studentId: string | null) {
  return useQuery({
    queryKey: studentTrackingKey(studentId ?? 'none'),
    queryFn: () => {
      if (!studentId) throw new Error('student_id ausente');
      return getStudentTracking(studentId);
    },
    enabled: !!studentId,
    staleTime: 30_000,
  });
}

/**
 * Versão batch — pega tracking de N alunos em paralelo via useQueries.
 * Usado na lista pra mostrar % de aderência por aluno sem fan-out de
 * mutations. Cada query tem cache próprio compartilhado com
 * useStudentTracking individual.
 */
export function useStudentsTracking(studentIds: string[]) {
  return useQueries({
    queries: studentIds.map((id) => ({
      queryKey: studentTrackingKey(id),
      queryFn: () => getStudentTracking(id),
      staleTime: 30_000,
    })),
  });
}

export function useCreateStudent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudentInput) => createStudent(input),
    onSuccess: () => {
      if (user?.id) {
        void qc.invalidateQueries({ queryKey: studentsKey(user.id) });
      }
    },
  });
}

export function useGenerateStudentPlan() {
  return useMutation({
    mutationFn: (input: { studentId: string; skipRoutines?: boolean }) =>
      generatePlanForStudent(input.studentId, {
        skipRoutines: input.skipRoutines,
      }),
  });
}

export function useSaveStudentPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { studentId: string; plan: OnboardingPlan }) =>
      saveStudentPlan(params.studentId, params.plan),
    onSuccess: (_data, vars) => {
      if (user?.id) {
        void qc.invalidateQueries({ queryKey: studentsKey(user.id) });
      }
      void qc.invalidateQueries({
        queryKey: studentDetailKey(vars.studentId),
      });
    },
  });
}

export function useSendStudentCredentials() {
  return useMutation({
    mutationFn: (params: { studentId: string; password: string }) =>
      sendStudentCredentials(params.studentId, params.password),
  });
}

export function useUpdateStudent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      studentId: string;
      patch: UpdateStudentPatch;
    }) => updateStudent(params.studentId, params.patch),
    onSuccess: (_data, vars) => {
      if (user?.id) {
        void qc.invalidateQueries({ queryKey: studentsKey(user.id) });
      }
      void qc.invalidateQueries({
        queryKey: studentDetailKey(vars.studentId),
      });
    },
  });
}

/**
 * Desvincula um aluno do coach. Aluno vira `role='comum'`, perde
 * `coach_id`, coach perde acesso aos dados. Notas privadas do
 * coach sobre o aluno são apagadas. Aluno recebe push avisando.
 *
 * Substitui o antigo `useDeleteStudent` (que excluía a conta do
 * aluno). Coach não tem mais esse poder — LGPD/loja exige que
 * apenas o próprio usuário possa excluir a própria conta.
 */
export function useUnlinkStudent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => unlinkStudent(studentId),
    onSuccess: () => {
      if (user?.id) {
        void qc.invalidateQueries({ queryKey: studentsKey(user.id) });
      }
    },
  });
}

/**
 * Define o conjunto de alunos ATIVOS (os demais ficam suspensos). Usado pela
 * tela escolher-alunos após um downgrade. Invalida lista + entitlement.
 */
export function useSetActiveStudents() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activeIds: string[]) => setActiveStudents(activeIds),
    onSuccess: () => {
      if (user?.id) {
        void qc.invalidateQueries({ queryKey: studentsKey(user.id) });
        void qc.invalidateQueries({ queryKey: queryKeys.entitlement(user.id) });
      }
    },
  });
}

/**
 * Edita uma rotina existente que pertence a um aluno do professor.
 * Reusa updateRoutine + replaceRoutineExercises (mesmo path do
 * editor pessoal). RLS permite a escrita pra coach do user_id da
 * rotina (migration 20260508).
 */
export function useUpdateStudentRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      routineId: string;
      patch: Partial<
        Pick<
          WorkoutRoutine,
          'name' | 'group_id' | 'modality' | 'description' | 'is_archived'
        >
      >;
      exercises?: RoutineExerciseInsert[];
    }) => {
      const updated = await updateRoutine(params.routineId, params.patch);
      if (params.exercises) {
        await replaceRoutineExercises(params.routineId, params.exercises);
      }
      return updated;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: studentDetailKey(vars.studentId),
      });
      void qc.invalidateQueries({
        queryKey: queryKeys.routineDetail(vars.routineId),
      });
    },
  });
}

/**
 * Cria uma rotina nova pra um aluno, marcando created_by_coach pra que
 * o aluno não consiga editar/deletar pelo app dele (lock). RLS permite
 * a escrita via routines_insert_coach (migration 20260508).
 */
export function useCreateStudentRoutine() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      name: string;
      modality: Modality;
      groupId: string | null;
      description: string | null;
      exercises: RoutineExerciseInsert[];
    }) => {
      if (!user?.id) throw new Error('Sessão expirada.');
      return createRoutine({
        userId: params.studentId,
        name: params.name,
        modality: params.modality,
        groupId: params.groupId,
        description: params.description,
        exercises: params.exercises,
        createdByCoach: user.id,
      });
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: studentDetailKey(vars.studentId),
      });
    },
  });
}

/**
 * Deleta uma rotina de um aluno do professor (hard delete, cascata
 * remove os exercícios da rotina). RLS permite via routines_delete_coach
 * (migration 20260508). Usado quando o coach quer substituir o plano
 * gerado pela IA pelos treinos dele.
 */
export function useDeleteStudentRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { studentId: string; routineId: string }) =>
      deleteRoutine(params.routineId),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: studentDetailKey(vars.studentId),
      });
    },
  });
}
