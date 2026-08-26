import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteExercise,
  listAllExercises,
  listExerciseGroups,
  listExercisesByGroup,
  saveExercise,
} from '@/services/exercises';
import { queryKeys } from '@/lib/queryKeys';
import { useEntitlement } from './useEntitlement';
import { useProfile } from './useProfile';
import type { Exercise, Modality } from '@/types/database';

export function useExerciseGroups() {
  return useQuery({
    queryKey: queryKeys.exerciseGroups(),
    queryFn: listExerciseGroups,
    staleTime: 5 * 60 * 1000, // 5min — catálogo raramente muda
  });
}

export function useExercisesByGroup(
  groupId: string | null | undefined,
  modality: Modality,
) {
  return useQuery({
    queryKey: groupId
      ? queryKeys.exercisesByGroup(groupId, modality)
      : ['exercises-by-group', 'none', modality],
    queryFn: () => listExercisesByGroup(groupId!, modality),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Retorna um Map<exerciseId, image_urls> pra consulta rápida de imagens de
 * demonstração a partir do exercise_id guardado no draft/rotina.
 */
export function useExerciseImagesMap() {
  const q = useQuery({
    queryKey: queryKeys.allExercises(),
    queryFn: listAllExercises,
    staleTime: 60 * 60 * 1000,
  });

  const map = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const e of q.data ?? []) {
      if (e.image_urls && e.image_urls.length > 0) {
        out.set(e.id, e.image_urls);
      }
    }
    return out;
  }, [q.data]);

  return map;
}

/**
 * Map<exerciseId, video_url> dos exercícios que têm vídeo.
 *
 * Mesma query cacheada do `useExerciseImagesMap` (`allExercises()`), então
 * não custa requisição nova. Existe porque as rotinas guardam só
 * `exercise_id` — o `video_url` mora no catálogo.
 */
export function useExerciseVideoMap() {
  const q = useQuery({
    queryKey: queryKeys.allExercises(),
    queryFn: listAllExercises,
    staleTime: 60 * 60 * 1000,
  });

  return useMemo(() => {
    const out = new Map<string, string>();
    for (const e of q.data ?? []) {
      if (e.video_url) out.set(e.id, e.video_url);
    }
    return out;
  }, [q.data]);
}

/**
 * Invalida as DUAS keys de catálogo.
 *
 * A `allExercises()` é fácil de esquecer e tem `staleTime` de 60 min
 * (`useExerciseImagesMap` acima) — sem ela o exercício novo aparece no
 * picker mas fica SEM IMAGEM por até uma hora.
 *
 * `exercises-by-group` vai por prefixo, sem groupId/modality, porque um
 * exercício de modalidade `generico` entra na lista de todas as outras
 * modalidades (ver `listExercisesByGroup`) — invalidar só a combinação
 * atual deixaria as demais desatualizadas.
 */
function useInvalidateExerciseCatalog() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['exercises-by-group'] }),
      qc.invalidateQueries({ queryKey: queryKeys.allExercises() }),
    ]);
  };
}

export function useSaveExercise() {
  const invalidate = useInvalidateExerciseCatalog();
  return useMutation({
    mutationFn: saveExercise,
    onSuccess: invalidate,
  });
}

export function useDeleteExercise() {
  const invalidate = useInvalidateExerciseCatalog();
  return useMutation({
    mutationFn: (exercise: Exercise) => deleteExercise(exercise),
    onSuccess: invalidate,
  });
}

/**
 * Gate do cadastro de exercício: professor com tier premium.
 *
 * Não é só cobrança, é correção: o `RoutineEditor` é compartilhado por 6
 * telas, incluindo `app/rotina/nova.tsx` (usuário montando a própria
 * rotina). Sem este gate o botão apareceria pra aluno e pra usuário avulso.
 *
 * Fecha por padrão — enquanto profile/entitlement não resolveram, devolve
 * false. É o inverso do `useAiCoachLocked`, que libera na dúvida: aqui um
 * falso-positivo viraria escrita indevida no catálogo.
 *
 * Nota: `tier === 'premium'` só resolve com assinatura de loja. Um
 * professor `grandfather` resolve como `free` por decisão D3 do billing
 * (ver `_resolve_entitlement`), então não passa neste gate.
 */
export function useCanCreateExercise(): boolean {
  const { data: profile } = useProfile();
  const { data: entitlement } = useEntitlement();
  if (!profile || !entitlement) return false;
  return profile.role === 'professor' && entitlement.tier === 'premium';
}
