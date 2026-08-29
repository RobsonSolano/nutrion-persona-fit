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
    'Você já é aluno de um professor. Peça o desvínculo antes de contratar outro.',
  invalid_role: 'Esta conta não pode virar aluno.',
  coach_unavailable: 'Este professor não está disponível no momento.',
  already_requested: 'Você já tem uma solicitação aberta com este professor.',
  unauthorized: 'Sessão expirada. Entre de novo.',
};

export async function requestCoach(
  coachId: string,
  message?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('request_coach', {
    p_coach_id: coachId,
    p_message: message ?? null,
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
 * As solicitações do próprio usuário. O nome do professor vem da RPC de
 * perfil público, não de um join: a RLS de profiles não deixa ler o nome
 * de quem ainda não é seu coach.
 */
export async function listMyRequests(): Promise<MyEnrollmentRequest[]> {
  const { data, error } = await supabase
    .from('coach_enrollment_requests')
    .select(
      'id, coach_id, status, message, cancel_reason, created_at, responded_at, seen_by_student_at',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Omit<MyEnrollmentRequest, 'coach_name'>[];
  const nomes = new Map<string, string | null>();
  await Promise.all(
    [...new Set(rows.map((r) => r.coach_id))].map(async (id) => {
      try {
        const p = await getCoachPublicProfile(id);
        nomes.set(id, p?.full_name ?? null);
      } catch {
        // Professor que saiu da busca (ficou privado, caiu de plano, bloqueou)
        // continua no histórico — só sem nome.
        nomes.set(id, null);
      }
    }),
  );

  return rows.map((r) => ({ ...r, coach_name: nomes.get(r.coach_id) ?? null }));
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

export async function rateCoach(coachId: string, stars: number): Promise<void> {
  const { data, error } = await supabase.rpc('rate_coach', {
    p_coach_id: coachId,
    p_stars: stars,
  });
  if (error) throw error;
  const res = data as { ok: boolean; error?: string };
  if (!res.ok) {
    throw new Error(
      res.error === 'not_eligible'
        ? 'Só quem foi aluno do professor pode avaliar.'
        : 'Não consegui salvar a avaliação.',
    );
  }
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
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre de novo.');

  const res = await fetch(FN('coach-respond-enrollment'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({
      request_id: requestId,
      action,
      cancel_reason: cancelReason ?? null,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    // 402 vira o upsell padrão do app (mesma trilha do coach-create-student).
    const upgrade = parseNeedsUpgrade(res.status, text);
    if (upgrade) throw upgrade;
    let detail: string | undefined;
    try {
      const json = JSON.parse(text) as { detail?: string; error?: string };
      detail = json.detail ?? json.error;
    } catch {
      // body não-JSON (gateway fora do ar, HTML de erro) — mensagem genérica
    }
    throw new Error(detail ?? 'Não consegui responder a solicitação.');
  }
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
