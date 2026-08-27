import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyTemplates,
  archiveTemplate,
  createTemplate,
  deleteTemplate,
  fetchTemplateDetail,
  listTemplates,
  replaceTemplateExercises,
  unarchiveTemplate,
  updateTemplate,
} from '@/services/templates';
import { queryKeys } from '@/lib/queryKeys';
import { studentDetailKey } from './useStudents';
import { useAuth } from './useAuth';
import type {
  Modality,
  TemplateExerciseInsert,
  WorkoutTemplate,
} from '@/types/database';

export function useTemplates(options: { archived?: boolean } = {}) {
  const archived = options.archived ?? false;
  const { user } = useAuth();
  const coachId = user?.id;
  return useQuery({
    queryKey: coachId
      ? queryKeys.templates(coachId, archived)
      : ['templates', 'none', archived ? 'archived' : 'active'],
    queryFn: () => listTemplates(coachId!, { archived }),
    enabled: !!coachId,
  });
}

export function useTemplateDetail(templateId: string | null | undefined) {
  return useQuery({
    queryKey: templateId
      ? queryKeys.templateDetail(templateId)
      : ['template-detail', 'none'],
    queryFn: () => fetchTemplateDetail(templateId!),
    enabled: !!templateId,
  });
}

export function useCreateTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      modality: Modality;
      groupId: string | null;
      description: string | null;
      exercises: TemplateExerciseInsert[];
    }) => {
      if (!user?.id) throw new Error('Sessão expirada.');
      return createTemplate({ coachId: user.id, ...params });
    },
    onSuccess: () => {
      if (!user?.id) return;
      void qc.invalidateQueries({
        queryKey: queryKeys.templates(user.id, false),
      });
    },
  });
}

export function useUpdateTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      patch: Partial<
        Pick<
          WorkoutTemplate,
          'name' | 'group_id' | 'modality' | 'description' | 'is_archived'
        >
      >;
      exercises?: TemplateExerciseInsert[];
    }) => {
      const updated = await updateTemplate(params.id, params.patch);
      if (params.exercises) {
        await replaceTemplateExercises(params.id, params.exercises);
      }
      return updated;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: queryKeys.templateDetail(vars.id),
      });
      if (user?.id) {
        void qc.invalidateQueries({
          queryKey: ['templates', user.id],
        });
      }
    },
  });
}

export function useArchiveTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => archiveTemplate(templateId),
    onSuccess: () => {
      if (!user?.id) return;
      void qc.invalidateQueries({
        queryKey: ['templates', user.id],
      });
    },
  });
}

export function useUnarchiveTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => unarchiveTemplate(templateId),
    onSuccess: () => {
      if (!user?.id) return;
      void qc.invalidateQueries({
        queryKey: ['templates', user.id],
      });
    },
  });
}

export function useDeleteTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => deleteTemplate(templateId),
    onSuccess: () => {
      if (!user?.id) return;
      void qc.invalidateQueries({
        queryKey: ['templates', user.id],
      });
    },
  });
}

export function useApplyTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { studentId: string; templateIds: string[] }) =>
      applyTemplates(params),
    onSuccess: (_data, vars) => {
      // A aba Plano do aluno lê as rotinas do `student_detail` (getStudentDetail
      // traz profile + routines juntos), NÃO de `routines`. Invalidar só
      // `routines` deixava a tela em 0 treinos até navegar e voltar — o
      // template era aplicado no servidor, mas a UI não recarregava.
      void qc.invalidateQueries({ queryKey: studentDetailKey(vars.studentId) });
      void qc.invalidateQueries({
        queryKey: queryKeys.routines(vars.studentId),
      });
    },
  });
}
