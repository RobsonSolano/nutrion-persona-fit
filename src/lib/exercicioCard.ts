import { agruparConjuntos, type Agrupavel, type CardConjunto } from './conjuntos';
import type { MetricType } from '@/types/database';

/**
 * Tradução de "linha de prescrição" para "o que a tela mostra".
 *
 * Existe porque três telas precisam do mesmo caminho — o editor, o detalhe da
 * rotina e o detalhe do template: agrupar as linhas irmãs em cards e enriquecer
 * cada exercício com o que mora no catálogo (imagens, vídeo, descrição), que a
 * prescrição não guarda (ela só tem `exercise_id`).
 *
 * O enriquecimento acontece numa passada só. Separar a descrição das mídias não
 * protegeria nada: os três mapas saem da mesma query cacheada, então trazer a
 * descrição junto custa um `Map.get` por exercício e evita que cada tela precise
 * fiar o catálogo em dois pontos diferentes.
 */

/** O que a prescrição guarda e o card exibe. */
export type ReadableExercise = {
  exercise_id: string | null;
  exercise_name: string;
  equipment: string | null;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  duration_min: number | null;
  metric_type?: MetricType;
  distance_min_m?: number | null;
  distance_max_m?: number | null;
  cadence_rpm?: number | null;
  notes: string | null;
};

/** Um exercício com o que o catálogo acrescenta.
 *
 *  Genérico pra não apagar o tipo de origem: quem entrega `RoutineExercise`
 *  continua enxergando o `id` da linha do outro lado, que é o que serve de key
 *  no React. Sem isso a tela cairia em `nome + índice`, e reordenar remontaria
 *  o card errado. */
export type ExercicioExibivelDe<T extends ReadableExercise> = {
  exercise: T;
  imageUrls: string[] | null;
  /** Vídeo salvo no catálogo. Sem ele, o play cai na busca pelo nome. */
  videoUrl: string | null;
  /** Descrição do catálogo (DESC-04). Null → texto genérico no olhinho. */
  description: string | null;
};

export type ExercicioExibivel = ExercicioExibivelDe<ReadableExercise>;

/** O que o olhinho exibe: um exercício, ou os dois de uma série conjunta.
 *  É o mesmo card da lista — não precisa de conversão. */
export type PreviewConjunto = CardConjunto<ExercicioExibivel>;

/** Os três mapas do catálogo, todos vindos da mesma query cacheada. */
export type CatalogoMaps = {
  imagesMap: Map<string, string[]>;
  videoMap: Map<string, string>;
  descriptionMap: Map<string, string>;
};

/** Agrupa as linhas em cards e pendura o catálogo em cada exercício. */
export function montarCardsExibiveis<T extends ReadableExercise & Agrupavel>(
  exercicios: T[],
  maps: CatalogoMaps,
): CardConjunto<ExercicioExibivelDe<T>>[] {
  return agruparConjuntos(exercicios).map((card) => ({
    principal: exibivel(card.principal, maps),
    conjunto: card.conjunto ? exibivel(card.conjunto, maps) : null,
  }));
}

/** Há imagem em pelo menos um dos exercícios do card? Sem nenhuma, a tela não
 *  oferece o olhinho — é o comportamento que ela já tinha. */
export function cardTemImagens<T extends ReadableExercise>(
  card: CardConjunto<ExercicioExibivelDe<T>>,
): boolean {
  return (
    (card.principal.imageUrls?.length ?? 0) > 0 ||
    (card.conjunto?.imageUrls?.length ?? 0) > 0
  );
}

function exibivel<T extends ReadableExercise>(
  exercise: T,
  { imagesMap, videoMap, descriptionMap }: CatalogoMaps,
): ExercicioExibivelDe<T> {
  const id = exercise.exercise_id;
  return {
    exercise,
    imageUrls: id ? imagesMap.get(id) ?? null : null,
    videoUrl: id ? videoMap.get(id) ?? null : null,
    description: id ? descriptionMap.get(id) ?? null : null,
  };
}
