import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import { readFileAsArrayBuffer } from '@/lib/uploadFile';
import {
  buildExerciseRow,
  type ExerciseFormValues,
} from '@/lib/exercisePayload';
import type { Exercise, ExerciseGroup, Modality } from '@/types/database';

const EXERCISE_BUCKET = 'exercise-photos';
/** Demonstração de movimento — maior que o avatar (512). */
const EXERCISE_IMAGE_WIDTH = 720;
export const MAX_EXERCISE_IMAGES = 2;

export async function listExerciseGroups(): Promise<ExerciseGroup[]> {
  const { data, error } = await supabase
    .from('exercise_groups')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listExercisesByGroup(
  groupId: string,
  modality: Modality,
  opts: { allModalities?: boolean } = {},
): Promise<Exercise[]> {
  // Modalidade 'generico' (alongamentos, mobilidade, foam roll) sempre
  // acompanha a modalidade selecionada — útil pra preparar/finalizar
  // treinos de musculação, calistenia, crossfit ou corrida sem
  // precisar mudar a modalidade da rotina.
  //
  // `allModalities` mostra o grupo inteiro sem filtrar modalidade. Usado no
  // cardio: as máquinas (esteira, bike, elíptico) estão como 'musculacao'
  // porque a IA usa matching monomodal, mas na montagem MANUAL de rotina o
  // usuário quer ver todo o cardio — corrida, máquina, ar livre — junto,
  // independente da modalidade da rotina.
  let query = supabase.from('exercises').select('*').eq('group_id', groupId);

  if (!opts.allModalities) {
    const modalities =
      modality === 'generico' ? ['generico'] : [modality, 'generico'];
    query = query.in('modality', modalities);
  }

  const { data, error } = await query.order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listAllExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Sobe as imagens locais e devolve as URLs públicas, na ordem recebida.
 * URI que já é http(s) passa direto — é o caso de editar sem trocar a foto.
 *
 * Path: `<owner_id>/<timestamp>-<n>.jpg`. Timestamp e não UUID porque não há
 * lib de uuid no projeto e `expo-crypto` é módulo nativo, o que obrigaria a
 * gerar build novo. Mesmo padrão de `src/services/avatar.ts`.
 */
async function uploadExerciseImages(
  ownerId: string,
  imageUris: string[],
): Promise<string[]> {
  const stamp = Date.now();
  const out: string[] = [];

  for (const [index, uri] of imageUris
    .slice(0, MAX_EXERCISE_IMAGES)
    .entries()) {
    if (/^https?:\/\//i.test(uri)) {
      out.push(uri);
      continue;
    }

    const resized = await manipulateAsync(
      uri,
      [{ resize: { width: EXERCISE_IMAGE_WIDTH } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    );
    const buffer = await readFileAsArrayBuffer(resized.uri);
    const path = `${ownerId}/${stamp}-${index}.jpg`;

    const { error } = await supabase.storage
      .from(EXERCISE_BUCKET)
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from(EXERCISE_BUCKET).getPublicUrl(path);
    out.push(data.publicUrl);
  }

  return out;
}

/** Path dentro do bucket a partir da URL pública, ou null se não for nossa. */
function bucketPathFromPublicUrl(url: string): string | null {
  const marker = `/${EXERCISE_BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : url.slice(at + marker.length);
}

/** Best-effort: remove do Storage as imagens que saíram do exercício. */
async function removeExerciseImages(urls: string[]): Promise<void> {
  const paths = urls
    .map(bucketPathFromPublicUrl)
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  await supabase.storage.from(EXERCISE_BUCKET).remove(paths);
}

/**
 * Cria ou atualiza um exercício do professor.
 *
 * Ordem deliberada: imagens PRIMEIRO, depois uma única escrita já com
 * `image_urls` preenchido. Assim nunca existe exercício salvo sem as fotos
 * que o professor anexou. Se a escrita falhar, sobram arquivos órfãos no
 * bucket — limpeza best-effort, igual ao `cleanupOldAvatars`.
 */
export async function saveExercise(args: {
  values: ExerciseFormValues;
  imageUris: string[];
  exerciseId?: string;
}): Promise<Exercise> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessão expirada.');

  const imageUrls = await uploadExerciseImages(user.id, args.imageUris);
  const row = buildExerciseRow({
    values: args.values,
    ownerId: user.id,
    imageUrls,
  });

  const { data, error } = args.exerciseId
    ? await supabase
        .from('exercises')
        .update(row)
        .eq('id', args.exerciseId)
        .select('*')
        .single()
    : await supabase.from('exercises').insert(row).select('*').single();

  if (error) {
    // Não deixa lixo no bucket quando a escrita falhou. Só o que ESTE save
    // subiu: o que já era http(s) na entrada continua em uso pelo exercício.
    void removeExerciseImages(
      imageUrls.filter((u) => !args.imageUris.includes(u)),
    );
    if (error.code === '23505') {
      throw new Error('Já existe um exercício com esse nome nesse grupo.');
    }
    if (error.code === '42501') {
      throw new Error(
        'Cadastro de exercício é do plano Premium. Confere sua assinatura.',
      );
    }
    throw error;
  }

  return data as Exercise;
}

/**
 * Remove um exercício do professor.
 *
 * Seguro por design: `exercise_id` em `workout_routine_exercises`,
 * `workout_template_exercises` e `workout_logs` é `on delete set null`, e
 * `exercise_name` é snapshot `not null` — a rotina do aluno continua com
 * nome, séries e cargas, perdendo só imagens e vídeo.
 */
export async function deleteExercise(exercise: Exercise): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .delete()
    .eq('id', exercise.id);
  if (error) throw error;

  void removeExerciseImages(exercise.image_urls ?? []);
}
