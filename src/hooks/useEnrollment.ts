import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  blockUser,
  cancelMyRequest,
  getCoachPublicProfile,
  listBlockedUsers,
  listCoachRequests,
  getMyCoachRating,
  listMyRequests,
  markRequestSeen,
  rateCoach,
  requestCoach,
  respondToEnrollment,
  searchCoaches,
  unblockUser,
  type RespondAction,
  type SearchFilters,
} from '@/services/enrollment';
import { useAuth } from './useAuth';
import { queryKeys } from '@/lib/queryKeys';

export const coachSearchKey = (f: SearchFilters) =>
  ['coach_search', f.uf ?? '', f.city ?? '', (f.specialties ?? []).join(','),
   f.serviceMode ?? '', f.query ?? ''] as const;
export const coachPublicKey = (id: string) => ['coach_public', id] as const;
export const myRequestsKey = (uid: string) => ['my_enrollment_requests', uid] as const;
export const coachRequestsKey = (uid: string) => ['coach_enrollment_requests', uid] as const;
export const blockedKey = (uid: string) => ['coach_blocks', uid] as const;

export function useCoachSearch(filters: SearchFilters, enabled = true) {
  return useQuery({
    queryKey: coachSearchKey(filters),
    queryFn: () => searchCoaches(filters),
    enabled,
    staleTime: 60_000,
  });
}

export function useCoachPublicProfile(coachId: string | null) {
  return useQuery({
    queryKey: coachPublicKey(coachId ?? 'none'),
    queryFn: () => getCoachPublicProfile(coachId!),
    enabled: !!coachId,
    staleTime: 30_000,
  });
}

export function useMyEnrollmentRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: myRequestsKey(user?.id ?? 'anon'),
    queryFn: listMyRequests,
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

/**
 * Desfechos que o usuário ainda não viu. Alimenta o aviso na abertura do
 * app — que NÃO depende de push: a permissão de notificação pode estar
 * negada, e o usuário precisa saber que virou aluno (ou que não virou).
 */
export function useUnseenEnrollmentOutcomes() {
  const q = useMyEnrollmentRequests();
  const unseen = (q.data ?? []).filter(
    (r) =>
      (r.status === 'efetuado' || r.status === 'cancelado') &&
      !r.seen_by_student_at,
  );
  return { ...q, unseen };
}

export function useRequestCoach() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ coachId, message }: { coachId: string; message?: string | null }) =>
      requestCoach(coachId, message),
    onSuccess: async (_id, vars) => {
      await qc.invalidateQueries({ queryKey: myRequestsKey(user?.id ?? 'anon') });
      await qc.invalidateQueries({ queryKey: coachPublicKey(vars.coachId) });
    },
  });
}

export function useCancelMyRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: cancelMyRequest,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: myRequestsKey(user?.id ?? 'anon') });
    },
  });
}

export function useMarkRequestSeen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: markRequestSeen,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: myRequestsKey(user?.id ?? 'anon') });
    },
  });
}

export function useRateCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ coachId, stars }: { coachId: string; stars: number }) =>
      rateCoach(coachId, stars),
    onSuccess: async (_r, vars) => {
      await qc.invalidateQueries({ queryKey: coachPublicKey(vars.coachId) });
      await qc.invalidateQueries({ queryKey: ['coach_search'] });
    },
  });
}

// ---------------------------------------------------------------------
// Professor
// ---------------------------------------------------------------------

export function useCoachEnrollmentRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: coachRequestsKey(user?.id ?? 'anon'),
    queryFn: listCoachRequests,
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

export function usePendingEnrollmentCount() {
  const q = useCoachEnrollmentRequests();
  return (q.data ?? []).filter((r) => r.status === 'pendente').length;
}

export function useRespondToEnrollment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      requestId,
      action,
      cancelReason,
    }: {
      requestId: string;
      action: RespondAction;
      cancelReason?: string | null;
    }) => respondToEnrollment(requestId, action, cancelReason),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: coachRequestsKey(user?.id ?? 'anon') });
      // Aceitar cria um aluno: a lista e o entitlement mudam junto.
      await qc.invalidateQueries({ queryKey: ['students', user?.id ?? 'anon'] });
      await qc.invalidateQueries({ queryKey: queryKeys.entitlement(user?.id ?? 'anon') });
    },
  });
}

/** Média de estrelas do professor logado (agregado, sem notas individuais). */
export function useCoachRating(coachId: string | null) {
  return useQuery({
    queryKey: ['my_coach_rating', coachId ?? 'anon'],
    queryFn: getMyCoachRating,
    enabled: !!coachId,
    staleTime: 5 * 60_000,
  });
}

export function useBlockedUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: blockedKey(user?.id ?? 'anon'),
    queryFn: listBlockedUsers,
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: blockUser,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: blockedKey(user?.id ?? 'anon') });
      // O bloqueio cancela as solicitações abertas daquele par (trigger).
      await qc.invalidateQueries({ queryKey: coachRequestsKey(user?.id ?? 'anon') });
    },
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: unblockUser,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: blockedKey(user?.id ?? 'anon') });
    },
  });
}
