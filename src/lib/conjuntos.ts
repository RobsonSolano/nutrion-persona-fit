import type { PairRole } from '@/types/database';

/**
 * Séries conjuntas (bi-set) — CONJ-04.
 *
 * No banco o par são DUAS linhas irmãs de workout_routine_exercises ligadas
 * pela mesma `pair_key` (ver migration 20260915000000). Na tela elas viram UM
 * card. Esta é a única peça que faz essa tradução, e ela roda tanto sobre a
 * linha vinda do banco quanto sobre o rascunho do editor — os dois têm
 * `pair_key`/`pair_role`, então não precisa de adaptador.
 */

/** O mínimo que o agrupamento olha. Qualquer objeto com esses campos serve. */
export type Agrupavel = {
  pair_key: string | null;
  pair_role: PairRole | null;
};

export type CardConjunto<T> = {
  principal: T;
  /** Null quando o card é de exercício solto. */
  conjunto: T | null;
};

/**
 * Junta as linhas irmãs num card, **preservando a ordem de entrada**.
 *
 * Quem ordena é o caller: `fetchRoutineDetail` já entrega por `sort_order`, e
 * no editor a posição no array é a verdade (o `sort_order` só é atribuído no
 * submit). Uma função serve os dois.
 *
 * É defensivo de propósito. Prescrição de treino não pode perder exercício na
 * tela por causa de dado torto:
 * - par órfão (a irmã não veio) → a linha vira card sozinho;
 * - conjunto listado antes do principal → o par monta certo mesmo assim;
 * - terceira linha na mesma chave (o unique do banco impede, mas dado velho ou
 *   payload adulterado não) → vira card próprio em vez de ser descartada.
 */
export function agruparConjuntos<T extends Agrupavel>(
  itens: T[],
): CardConjunto<T>[] {
  const cards: CardConjunto<T>[] = [];
  // Card já aberto para cada pair_key, pra encaixar a irmã quando ela chegar.
  const abertos = new Map<string, CardConjunto<T>>();

  for (const item of itens) {
    if (item.pair_key == null) {
      cards.push({ principal: item, conjunto: null });
      continue;
    }

    const aberto = abertos.get(item.pair_key);

    // Primeira linha da chave: abre o card na posição dela, qualquer que seja o
    // papel. Se vier só ela, fica um card solto — nada some.
    if (!aberto) {
      const card: CardConjunto<T> = { principal: item, conjunto: null };
      cards.push(card);
      abertos.set(item.pair_key, card);
      continue;
    }

    // Chave repetida com o card já completo: terceira linha. Não descarta.
    if (aberto.conjunto !== null) {
      cards.push({ principal: item, conjunto: null });
      continue;
    }

    // A irmã chegou. O 'principal' é quem manda no título do card, mesmo que
    // tenha sido listado depois.
    if (item.pair_role === 'principal') {
      aberto.conjunto = aberto.principal;
      aberto.principal = item;
    } else {
      aberto.conjunto = item;
    }
  }

  return cards;
}

/** Orientação de execução do par. Constante única, usada no card e no olhinho. */
export const TEXTO_SERIE_CONJUNTA =
  'Série conjunta: faça uma série do primeiro exercício e emende direto no ' +
  'segundo, sem descanso entre eles. Descanse só no fim do par, antes de ' +
  'começar a próxima série.';
