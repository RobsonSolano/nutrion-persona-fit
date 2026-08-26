// Vocabulário de deficiência: rótulos, opções de formulário e formatação.
//
// Os slugs espelham o check constraint de `profiles.disability_types`
// (20260826020000_profiles_disability.sql) e o mapeamento de bloqueio em
// `supabase/functions/_shared/bodyRestrictions.ts`. Mudar um exige mudar os três.

import type { DisabilityType } from '@/types/database';

export const DISABILITY_LABEL: Record<DisabilityType, string> = {
  wheelchair_paraplegia: 'Cadeirante / paraplegia',
  amputation_lower: 'Amputação de membro inferior',
  amputation_upper: 'Amputação de membro superior',
  visual: 'Deficiência visual',
  hearing: 'Deficiência auditiva',
  other: 'Outra',
};

export const DISABILITY_OPTIONS: { value: DisabilityType; label: string }[] = [
  { value: 'wheelchair_paraplegia', label: '♿ Cadeirante / paraplegia' },
  { value: 'amputation_lower', label: '🦿 Amputação membro inferior' },
  { value: 'amputation_upper', label: '💪 Amputação membro superior' },
  { value: 'visual', label: '👁️ Deficiência visual' },
  { value: 'hearing', label: '👂 Deficiência auditiva' },
  { value: 'other', label: '📝 Outra' },
];

export const MAX_DISABILITY_NOTES = 500;

export function isDisabilityType(v: string): v is DisabilityType {
  return v in DISABILITY_LABEL;
}

/** "Outra" sem descrição não diz nada à IA — o formulário exige o texto. */
export function requiresNotes(types: DisabilityType[]): boolean {
  return types.includes('other');
}

/**
 * O formulário está preenchido de forma utilizável?
 * `has_disability` null = ainda não respondeu (o campo é opcional, então
 * isso não bloqueia o avanço — só significa "sem informação").
 */
export function isDisabilityValid(params: {
  hasDisability: boolean | null;
  types: DisabilityType[];
  notes: string;
}): boolean {
  const { hasDisability, types, notes } = params;
  if (hasDisability !== true) return true;
  if (types.length === 0) return false;
  if (requiresNotes(types) && notes.trim().length === 0) return false;
  return notes.length <= MAX_DISABILITY_NOTES;
}

/** Linha pronta pra exibição (perfil do aluno). null = nada a mostrar. */
export function formatDisability(params: {
  has_disability: boolean | null;
  disability_types: DisabilityType[] | null;
  disability_notes: string | null;
}): string | null {
  if (params.has_disability !== true) return null;
  const tipos = (params.disability_types ?? []).map((t) => DISABILITY_LABEL[t]);
  const notas = params.disability_notes?.trim();
  if (tipos.length === 0) return notas || 'Não especificado';
  return notas ? `${tipos.join(', ')} — ${notas}` : tipos.join(', ');
}
