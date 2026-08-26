// Montagem e validação do payload de exercício criado pelo professor.
//
// Puro de propósito: o form vive num modal com react-native, mas a decisão
// de "isso é válido?" e "qual linha vai pro banco?" fica aqui, testável.

import { normalizeYouTubeUrl } from './youtubeUrl';
import type {
  Exercise,
  ExerciseVisibility,
  Modality,
} from '@/types/database';

const NOME_MIN = 3;
/** `exercises.name` não tem check no banco, mas nome gigante deixa o picker
 *  ilegível — corta aqui, com mensagem, em vez de deixar entrar. */
const NOME_MAX = 80;

export type ExerciseFormValues = {
  name: string;
  groupId: string;
  modality: Modality;
  equipment: string;
  visibility: ExerciseVisibility;
  videoUrl: string;
  requiresLowerLimbs: boolean;
};

export type ExerciseValidationError = {
  field: 'name' | 'groupId' | 'videoUrl';
  message: string;
};

export type ExerciseRowInsert = {
  group_id: string;
  name: string;
  equipment: string | null;
  modality: Modality;
  owner_id: string;
  visibility: ExerciseVisibility;
  video_url: string | null;
  image_urls: string[] | null;
  requires_lower_limbs: boolean;
};

/** Chave de comparação pro dedup: sem acento, sem caixa, espaço colapsado.
 *  "Supino  RÉTO " e "supino reto" são o mesmo exercício pro professor. */
export function normalizeExerciseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Exercício já existente com o mesmo nome no mesmo grupo, ou null.
 * `ignoreId` existe pro modo edição: sem ele, salvar o exercício sem mudar
 * o nome acusaria ele mesmo como duplicata.
 */
export function findDuplicateExercise(
  name: string,
  groupId: string,
  catalog: Exercise[],
  ignoreId?: string,
): Exercise | null {
  const alvo = normalizeExerciseName(name);
  if (!alvo) return null;
  return (
    catalog.find(
      (e) =>
        e.id !== ignoreId &&
        e.group_id === groupId &&
        normalizeExerciseName(e.name) === alvo,
    ) ?? null
  );
}

/**
 * Estado inicial do toggle "Exige uso das pernas?", derivado do grupo.
 *
 * Vem da distribuição real do catálogo (2026-08-26): no grupo `legs`, 50 de
 * 50 exigem perna; `cardio` 33 de 36; `core` 30 de 37; `full_body` 26 de 40.
 * Do outro lado, `chest` 0 de 25, `biceps` 0 de 14, `triceps` 0 de 13,
 * `back` 8 de 32, `shoulders` 3 de 23.
 *
 * Grupo desconhecido cai em `true` — é o lado seguro: some do plano de quem
 * declarou restrição em vez de aparecer indevidamente.
 */
const GRUPOS_SEM_PERNA = new Set([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
]);

export function defaultRequiresLowerLimbs(groupSlug: string | null): boolean {
  if (!groupSlug) return true;
  return !GRUPOS_SEM_PERNA.has(groupSlug);
}

export function validateExerciseForm(
  values: ExerciseFormValues,
): ExerciseValidationError[] {
  const erros: ExerciseValidationError[] = [];

  const nome = values.name.trim();
  if (!nome) {
    erros.push({ field: 'name', message: 'Dá um nome pro exercício.' });
  } else if (nome.length < NOME_MIN) {
    erros.push({
      field: 'name',
      message: `O nome precisa de pelo menos ${NOME_MIN} caracteres.`,
    });
  } else if (nome.length > NOME_MAX) {
    erros.push({
      field: 'name',
      message: `O nome passa de ${NOME_MAX} caracteres.`,
    });
  }

  if (!values.groupId) {
    erros.push({ field: 'groupId', message: 'Escolhe o grupo muscular.' });
  }

  // Vídeo é opcional; só valida se veio algo.
  if (values.videoUrl.trim() && !normalizeYouTubeUrl(values.videoUrl)) {
    erros.push({ field: 'videoUrl', message: 'Link do YouTube inválido.' });
  }

  return erros;
}

export function buildExerciseRow(args: {
  values: ExerciseFormValues;
  ownerId: string;
  imageUrls: string[];
}): ExerciseRowInsert {
  const { values, ownerId, imageUrls } = args;
  return {
    group_id: values.groupId,
    name: values.name.trim(),
    equipment: values.equipment.trim() || null,
    modality: values.modality,
    owner_id: ownerId,
    visibility: values.visibility,
    video_url: values.videoUrl.trim()
      ? normalizeYouTubeUrl(values.videoUrl)
      : null,
    image_urls: imageUrls.length > 0 ? imageUrls : null,
    requires_lower_limbs: values.requiresLowerLimbs,
  };
}
