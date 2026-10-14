// Contratação de professor: descoberta, solicitação e avaliação.
//
// Tudo passa por RPC porque a RLS de profiles só deixa o usuário ler a si
// mesmo e ao próprio coach — a busca não pode ser um SELECT direto sem
// abrir o perfil de todo mundo. A única exceção é o que o próprio usuário
// já pode ler pela RLS (as solicitações dele).

import { supabase } from './supabase';
import { parseNeedsUpgrade } from '@/lib/needsUpgrade';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const FN = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

/**
 * POST numa edge function com o token da sessão. Não lança em erro HTTP:
 * devolve status, corpo cru (pro parse de 402) e o `detail` (ou `error`)
 * do JSON quando houver — cada chamador escolhe a mensagem.
 */
async function postFn(
  name: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string; detail?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre de novo.');

  const res = await fetch(FN(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let detail: string | undefined;
  if (!res.ok) {
    try {
      const json = JSON.parse(text) as { detail?: string; error?: string };
      detail = json.detail ?? json.error;
    } catch {
      // body não-JSON (gateway fora do ar, HTML de erro) — mensagem genérica
    }
  }
  return { ok: res.ok, status: res.status, text, detail };
}

export type EnrollmentStatus = 'pendente' | 'andamento' | 'efetuado' | 'cancelado';

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pendente: 'Pendente',
  andamento: 'Em andamento',
  efetuado: 'Efetuado',
  cancelado: 'Cancelado',
};

export type CoachSearchResult = {
  coach_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  state_uf: string | null;
  city: string | null;
  specialties: string[];
  service_mode: 'online' | 'presencial' | 'hibrido' | null;
  rating_avg: number;
  rating_count: number;
};

export type CoachPublicProfile = CoachSearchResult & {
  cref: string | null;
  my_rating: number | null;
  /** Só pro próprio autor (pra editar); nunca vem de terceiros ([AVAL]-06). */
  my_comment: string | null;
  can_rate: boolean;
  open_request_status: EnrollmentStatus | null;
};

export type SearchFilters = {
  uf?: string | null;
  city?: string | null;
  specialties?: string[] | null;
  serviceMode?: string | null;
  query?: string | null;
};

export async function searchCoaches(
  filters: SearchFilters = {},
): Promise<CoachSearchResult[]> {
  const { data, error } = await supabase.rpc('search_coaches', {
    p_uf: filters.uf ?? null,
    p_city: filters.city ?? null,
    p_specialties:
      filters.specialties && filters.specialties.length > 0
        ? filters.specialties
        : null,
    p_service_mode: filters.serviceMode ?? null,
    p_query: filters.query?.trim() || null,
  });
  if (error) throw error;
  return (data ?? []) as CoachSearchResult[];
}

export async function getCoachPublicProfile(
  coachId: string,
): Promise<CoachPublicProfile | null> {
  const { data, error } = await supabase.rpc('get_coach_public_profile', {
    p_coach_id: coachId,
  });
  if (error) throw error;
  return (data ?? null) as CoachPublicProfile | null;
}

/** Erros da RPC viram Error com a mensagem já pronta pra UI. */
const REQUEST_ERROS: Record<string, string> = {
  already_student:
    'Você já é aluno de um professor. Encerre o acompanhamento atual (no seu Perfil) antes de contratar outro.',
  invalid_role: 'Esta conta não pode virar aluno.',
  coach_unavailable: 'Este professor não está disponível no momento.',
  already_requested: 'Você já tem uma solicitação aberta com este professor.',
  too_many_open:
    'Você já tem 5 solicitações em aberto. Cancele alguma ou espere uma resposta antes de enviar outra.',
  invalid_phone: 'Informe um telefone válido com DDD (10 a 13 dígitos).',
  unauthorized: 'Sessão expirada. Entre de novo.',
};

export async function requestCoach(
  coachId: string,
  contactPhone: string,
  message?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('request_coach', {
    p_coach_id: coachId,
    p_message: message ?? null,
    p_contact_phone: contactPhone,
  });
  if (error) throw error;
  const res = data as { ok: boolean; id?: string; error?: string };
  if (!res.ok) {
    throw new Error(REQUEST_ERROS[res.error ?? ''] ?? 'Não consegui enviar a solicitação.');
  }
  return res.id!;
}

export type MyEnrollmentRequest = {
  id: string;
  coach_id: string;
  status: EnrollmentStatus;
  message: string | null;
  cancel_reason: string | null;
  created_at: string;
  responded_at: string | null;
  seen_by_student_at: string | null;
  coach_name: string | null;
};

/**
 * As solicitações do próprio usuário, com o nome do professor já junto.
 * A RPC existe pra evitar o N+1: esta lista roda na abertura do app (é
 * ela que alimenta o aviso de desfecho), e buscar o nome de cada
 * professor à parte custaria uma ida ao servidor por solicitação.
 */
export async function listMyRequests(): Promise<MyEnrollmentRequest[]> {
  const { data, error } = await supabase.rpc('list_my_enrollment_requests');
  if (error) throw error;
  return (data ?? []) as MyEnrollmentRequest[];
}

export async function cancelMyRequest(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('cancel_my_enrollment_request', {
    p_id: id,
  });
  if (error) throw error;
  const res = data as { ok: boolean; error?: string };
  if (!res.ok) {
    throw new Error(
      res.error === 'not_cancelable'
        ? 'Esta solicitação não pode mais ser cancelada — o professor já está tratando dela.'
        : 'Não consegui cancelar.',
    );
  }
}

export async function markRequestSeen(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_enrollment_seen', { p_id: id });
  if (error) throw error;
}

/** Desvínculo registrado em coach_unlink_notices (pelo professor ou pelo aluno). */
export type UnlinkNotice = {
  id: string;
  coach_name: string | null;
  student_name: string | null;
  reason: string | null;
  created_at: string;
};

export type UnlinkNoticeSide = 'student' | 'coach';

/**
 * Desvínculos que o usuário ainda não viu, do lado dele:
 *   'student' → "seu professor encerrou o vínculo" (o professor iniciou)
 *   'coach'   → "aluno encerrou o acompanhamento" (o aluno iniciou, [TRAN]-11)
 */
export async function listUnseenUnlinkNotices(
  userId: string,
  side: UnlinkNoticeSide,
): Promise<UnlinkNotice[]> {
  const col = side === 'student'
    ? { owner: 'student_id', initiatedBy: 'coach', seen: 'seen_by_student_at' }
    : { owner: 'coach_id', initiatedBy: 'student', seen: 'seen_by_coach_at' };
  const { data, error } = await supabase
    .from('coach_unlink_notices')
    .select('id, coach_name, student_name, reason, created_at')
    .eq(col.owner, userId)
    .eq('initiated_by', col.initiatedBy)
    .is(col.seen, null)
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

/** O aluno encerra o acompanhamento sozinho, com motivo ([TRAN]-10). */
export async function leaveCoach(reason: string): Promise<void> {
  const res = await postFn('student-leave-coach', { reason });
  if (!res.ok) throw new Error(res.detail ?? 'Não consegui encerrar o acompanhamento.');
}

export async function markUnlinkNoticeSeen(id: string): Promise<void> {
  const { error } = await supabase.rpc('mark_unlink_notice_seen', { p_id: id });
  if (error) throw error;
}

const RATE_ERROS: Record<string, string> = {
  not_eligible: 'Só quem é ou foi aluno do professor pode avaliar.',
  invalid_comment: 'O comentário pode ter até 500 caracteres.',
};

/** Nota de 1 a 5 + comentário opcional ([AVAL]-05). Reavaliar sobrescreve. */
export async function rateCoach(
  coachId: string,
  stars: number,
  comment?: string | null,
): Promise<void> {
  const { data, error } = await supabase.rpc('rate_coach', {
    p_coach_id: coachId,
    p_stars: stars,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  const res = data as { ok: boolean; error?: string };
  if (!res.ok) {
    throw new Error(RATE_ERROS[res.error ?? ''] ?? 'Não consegui salvar a avaliação.');
  }
}

export type MyRating = { stars: number; comment: string | null };

/** A avaliação que o usuário já deu a este professor (RLS: só a própria). */
export async function getMyRatingFor(coachId: string): Promise<MyRating | null> {
  const { data, error } = await supabase
    .from('coach_ratings')
    .select('stars, comment')
    .eq('coach_id', coachId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type CoachRatingRow = {
  stars: number;
  comment: string | null;
  student_name: string | null;
  rated_at: string;
};

/** Professor: as avaliações que recebeu, com comentário ([AVAL]-08). */
export async function listMyCoachRatings(): Promise<CoachRatingRow[]> {
  const { data, error } = await supabase.rpc('list_my_coach_ratings');
  if (error) throw error;
  return (data ?? []) as CoachRatingRow[];
}

// ---------------------------------------------------------------------
// Lado do professor
// ---------------------------------------------------------------------

export type CoachEnrollmentRequest = {
  id: string;
  student_id: string;
  status: EnrollmentStatus;
  message: string | null;
  cancel_reason: string | null;
  created_at: string;
  responded_at: string | null;
  student_name: string | null;
  student_email: string | null;
  /** Telefone que o usuário deu PRA ESTE professor. Some quando recusado. */
  contact_phone: string | null;
};

/**
 * A fila do professor. O nome do solicitante vem por RPC dedicada porque
 * a RLS de profiles não expõe quem ainda não é aluno dele.
 */
export async function listCoachRequests(): Promise<CoachEnrollmentRequest[]> {
  const { data, error } = await supabase.rpc('list_coach_enrollment_requests');
  if (error) throw error;
  return (data ?? []) as CoachEnrollmentRequest[];
}

export type RespondAction = 'andamento' | 'efetuado' | 'cancelado';

export async function respondToEnrollment(
  requestId: string,
  action: RespondAction,
  cancelReason?: string | null,
): Promise<void> {
  const res = await postFn('coach-respond-enrollment', {
    request_id: requestId,
    action,
    cancel_reason: cancelReason ?? null,
  });
  if (!res.ok) {
    // 402 vira o upsell padrão do app (mesma trilha do coach-create-student).
    const upgrade = parseNeedsUpgrade(res.status, res.text);
    if (upgrade) throw upgrade;
    throw new Error(res.detail ?? 'Não consegui responder a solicitação.');
  }
}

/**
 * Último telefone que o usuário informou. Pré-preenche a próxima
 * solicitação — ninguém quer redigitar o próprio número.
 */
export async function getMyLastContactPhone(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_last_contact_phone');
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Média do próprio professor. Vem por RPC porque a RLS de coach_ratings
 * não deixa nem o avaliado ler as notas — só o agregado, sem quem deu o quê.
 */
export async function getMyCoachRating(): Promise<{ avg: number; count: number }> {
  const { data, error } = await supabase.rpc('my_coach_rating');
  if (error) throw error;
  const r = data as { avg: number; count: number } | null;
  return { avg: Number(r?.avg ?? 0), count: Number(r?.count ?? 0) };
}

// ---------------------------------------------------------------------
// Bloqueio
// ---------------------------------------------------------------------

export type BlockedUser = {
  user_id: string;
  full_name: string | null;
  created_at: string;
};

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('list_coach_blocks');
  if (error) throw error;
  return (data ?? []) as BlockedUser[];
}

export async function blockUser(userId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const coachId = sessionData.session?.user.id;
  if (!coachId) throw new Error('Sessão expirada. Entre de novo.');
  const { error } = await supabase
    .from('coach_blocks')
    .insert({ coach_id: coachId, user_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const coachId = sessionData.session?.user.id;
  if (!coachId) throw new Error('Sessão expirada. Entre de novo.');
  const { error } = await supabase
    .from('coach_blocks')
    .delete()
    .eq('coach_id', coachId)
    .eq('user_id', userId);
  if (error) throw error;
}
