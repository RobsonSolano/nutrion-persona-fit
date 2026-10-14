import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  blockUser,
  cancelMyRequest,
  getCoachPublicProfile,
  listBlockedUsers,
  listCoachRequests,
  getMyCoachRating,
  getMyRatingFor,
  listMyCoachRatings,
  getMyLastContactPhone,
  listMyRequests,
  leaveCoach,
  listUnseenUnlinkNotices,
  markRequestSeen,
  markUnlinkNoticeSeen,
  rateCoach,
  requestCoach,
  respondToEnrollment,
  searchCoaches,
  unblockUser,
  type RespondAction,
  type SearchFilters,
  type UnlinkNoticeSide,
} from '@/services/enrollment';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { queryKeys } from '@/lib/queryKeys';
import { outcomesToAnnounce } from '@/lib/enrollmentOutcomes';

export const coachSearchKey = (f: SearchFilters) =>
  ['coach_search', f.uf ?? '', f.city ?? '', (f.specialties ?? []).join(','),
   f.serviceMode ?? '', f.query ?? ''] as const;
export const coachPublicKey = (id: string) => ['coach_public', id] as const;
export const myRequestsKey = (uid: string) => ['my_enrollment_requests', uid] as const;
const unlinkNoticesKey = (uid: string) => ['unlink_notices', uid] as const;
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
 * Aceite de quem já não é o professor dele não entra (ver outcomesToAnnounce).
 */
export function useUnseenEnrollmentOutcomes() {
  const q = useMyEnrollmentRequests();
  const profileQ = useProfile();
  const unseen = profileQ.data
    ? outcomesToAnnounce(q.data ?? [], profileQ.data.coach_id)
    : [];
  return { ...q, unseen };
}

/** Telefone da última solicitação, pra pré-preencher o campo. */
export function useMyLastContactPhone() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my_last_contact_phone', user?.id ?? 'anon'],
    queryFn: getMyLastContactPhone,
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}

export function useRequestCoach() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({
      coachId,
      contactPhone,
      message,
    }: {
      coachId: string;
      contactPhone: string;
      message?: string | null;
    }) => requestCoach(coachId, contactPhone, message),
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

/**
 * Desvínculos não vistos do lado do usuário — mesmo motivo do aviso de
 * desfecho: o push pode não chegar, e o vínculo muda o que dá pra fazer.
 */
export function useUnseenUnlinkNotices(side: UnlinkNoticeSide) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...unlinkNoticesKey(user?.id ?? 'anon'), side],
    queryFn: () => listUnseenUnlinkNotices(user!.id, side),
    enabled: !!user?.id,
    staleTime: 15_000,
  });
}

/**
 * Há aviso de vínculo pendente? É o que os avisos remotos esperam ([MOD]-02)
 * — mesma regra e mesmas queries (em cache) dos gates de vínculo. Um hook por
 * lado: o professor não consulta desfecho de contratação.
 */
export function useHasPendingStudentLinkNotice(): boolean {
  const unlink = useUnseenUnlinkNotices('student');
  const { unseen } = useUnseenEnrollmentOutcomes();
  return (unlink.data?.length ?? 0) > 0 || unseen.length > 0;
}

export function useHasPendingCoachLinkNotice(): boolean {
  const left = useUnseenUnlinkNotices('coach');
  return (left.data?.length ?? 0) > 0;
}

export function useMarkUnlinkNoticeSeen() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: markUnlinkNoticeSeen,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: unlinkNoticesKey(user?.id ?? 'anon') });
    },
  });
}

/**
 * Aluno encerra o acompanhamento ([TRAN]-10). Muda role, plano, permissões
 * de edição e o que aparece em quase toda tela — invalida tudo.
 */
export function useLeaveCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: leaveCoach,
    onSuccess: async () => {
      await qc.invalidateQueries();
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

const myRatingKey = (coachId: string) => ['my_rating_for', coachId] as const;

export function useRateCoach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      coachId,
      stars,
      comment,
    }: {
      coachId: string;
      stars: number;
      comment?: string | null;
    }) => rateCoach(coachId, stars, comment),
    onSuccess: async (_r, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: coachPublicKey(vars.coachId) }),
        qc.invalidateQueries({ queryKey: myRatingKey(vars.coachId) }),
        qc.invalidateQueries({ queryKey: ['coach_search'] }),
      ]);
    },
  });
}

/** A avaliação que o usuário já deu a este professor (pra pré-preencher). */
export function useMyRatingFor(coachId: string | null) {
  return useQuery({
    queryKey: myRatingKey(coachId ?? 'none'),
    queryFn: () => getMyRatingFor(coachId!),
    enabled: !!coachId,
  });
}

/** Professor: avaliações recebidas, com comentário ([AVAL]-08). */
export function useMyCoachRatings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my_coach_ratings', user?.id ?? 'anon'],
    queryFn: listMyCoachRatings,
    enabled: !!user?.id,
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
