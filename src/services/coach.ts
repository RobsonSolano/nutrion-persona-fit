import { supabase } from './supabase';
import type { Coach, CoachContact } from '@/types/database';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const FN_URL = `${SUPABASE_URL}/functions/v1/signup-professor`;

export type SignupProfessorInput = {
  bio?: string | null;
  cref?: string | null;
};

/**
 * Promove o user atual a `role='professor'` e cria a row em `coaches`.
 * Precisa ser chamado depois de `supabase.auth.signUp` ter criado o
 * auth.users e a sessão estar ativa.
 */
export async function promoteToProfessor(
  input: SignupProfessorInput,
): Promise<Coach> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Sessão expirada. Faça login de novo.');
  }

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.detail ?? parsed?.error ?? text;
    } catch {
      // mantém raw
    }
    throw new Error(`${res.status} · ${detail}`);
  }

  const data = (await res.json()) as { coach?: Coach };
  if (!data?.coach) {
    throw new Error('Resposta inválida da função signup-professor.');
  }
  return data.coach;
}

/** Busca o registro de coach do user atual (null se não for professor). */
export async function getMyCoach(): Promise<Coach | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('coaches')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Coach | null;
}

/**
 * Busca dados de contato/identidade do coach (junta coaches + profile).
 * Aluno vinculado pode chamar via RLS estendida em coaches_select.
 */
export async function getCoachContact(
  coachId: string,
): Promise<CoachContact | null> {
  const { data, error } = await supabase
    .from('coaches')
    .select(
      'id, bio, cref, show_contact_to_students, contact_phone, profile:profiles!inner(full_name, avatar_url)',
    )
    .eq('id', coachId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const profile = (data as unknown as { profile: { full_name: string | null; avatar_url: string | null } }).profile;
  return {
    id: data.id,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url,
    bio: data.bio,
    cref: data.cref,
    show_contact_to_students: data.show_contact_to_students,
    contact_phone: data.contact_phone,
  };
}

export type CoachSettingsPatch = {
  show_contact_to_students?: boolean;
  contact_phone?: string | null;
  bio?: string | null;
  cref?: string | null;
  // Perfil público (descoberta). is_public só vale se o resto estiver
  // preenchido — a checagem final é do servidor (is_coach_discoverable),
  // a UI só evita o opt-in que não teria efeito nenhum.
  is_public?: boolean;
  state_uf?: string | null;
  city?: string | null;
  city_ibge_code?: string | null;
  specialties?: string[];
  service_mode?: 'online' | 'presencial' | 'hibrido' | null;
};

/** O que falta pra poder aparecer na busca. Vazio = pronto. */
export function faltaParaPerfilPublico(coach: Coach | null | undefined): string[] {
  if (!coach) return ['carregando'];
  const falta: string[] = [];
  if (!coach.state_uf) falta.push('estado');
  if (!coach.city) falta.push('cidade');
  if (!coach.specialties || coach.specialties.length === 0) falta.push('especialidades');
  if (!coach.service_mode) falta.push('tipo de atendimento');
  return falta;
}

export async function updateCoachSettings(patch: CoachSettingsPatch): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessão expirada.');
  const { error } = await supabase
    .from('coaches')
    .update(patch)
    .eq('id', user.id);
  if (error) throw error;
}
