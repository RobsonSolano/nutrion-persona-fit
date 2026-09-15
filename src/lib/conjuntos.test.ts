import { describe, it, expect } from 'vitest';
import { TEXTO_SERIE_CONJUNTA, agruparConjuntos } from './conjuntos';
import type { PairRole } from '@/types/database';

/** Fixture mínima: só o que agruparConjuntos olha, mais um nome pra asserção. */
function ex(
  nome: string,
  pair_key: string | null = null,
  pair_role: PairRole | null = null,
) {
  return { nome, pair_key, pair_role };
}

describe('agruparConjuntos', () => {
  it('CONJ-04: duas linhas com a mesma pair_key viram UM card', () => {
    const cards = agruparConjuntos([
      ex('Elevação lateral', 'p1', 'principal'),
      ex('Elevação frontal', 'p1', 'conjunto'),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].principal.nome).toBe('Elevação lateral');
    expect(cards[0].conjunto?.nome).toBe('Elevação frontal');
  });

  it('CONJ-04: exercício solto (pair_key null) vira card com conjunto null', () => {
    const cards = agruparConjuntos([ex('Supino reto')]);

    expect(cards).toHaveLength(1);
    expect(cards[0].principal.nome).toBe('Supino reto');
    expect(cards[0].conjunto).toBeNull();
  });

  it('CONJ-04: vários soltos não são agrupados entre si', () => {
    const cards = agruparConjuntos([
      ex('Supino reto'),
      ex('Crucifixo'),
      ex('Tríceps corda'),
    ]);

    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.conjunto === null)).toBe(true);
  });

  it('CONJ-04: par órfão (só uma linha da chave) NÃO some da tela', () => {
    const cards = agruparConjuntos([
      ex('Supino reto'),
      ex('Elevação lateral', 'p1', 'principal'), // a irmã não veio
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[1].principal.nome).toBe('Elevação lateral');
    expect(cards[1].conjunto).toBeNull();
  });

  it('CONJ-04: órfão que é só o conjunto vira card sozinho, não some', () => {
    const cards = agruparConjuntos([ex('Elevação frontal', 'p1', 'conjunto')]);

    expect(cards).toHaveLength(1);
    expect(cards[0].principal.nome).toBe('Elevação frontal');
    expect(cards[0].conjunto).toBeNull();
  });

  it('CONJ-04: agrupa por chave mesmo quando as linhas não estão adjacentes', () => {
    const cards = agruparConjuntos([
      ex('Elevação lateral', 'p1', 'principal'),
      ex('Supino reto'),
      ex('Elevação frontal', 'p1', 'conjunto'),
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0].principal.nome).toBe('Elevação lateral');
    expect(cards[0].conjunto?.nome).toBe('Elevação frontal');
    expect(cards[1].principal.nome).toBe('Supino reto');
  });

  it('CONJ-04: o card ocupa a posição da PRIMEIRA linha da chave', () => {
    const cards = agruparConjuntos([
      ex('Agachamento'),
      ex('Elevação lateral', 'p1', 'principal'),
      ex('Elevação frontal', 'p1', 'conjunto'),
      ex('Remada'),
    ]);

    expect(cards.map((c) => c.principal.nome)).toEqual([
      'Agachamento',
      'Elevação lateral',
      'Remada',
    ]);
  });

  it('CONJ-04: ordem de entrada é preservada (o caller já ordena)', () => {
    const cards = agruparConjuntos([
      ex('Terceiro'),
      ex('Primeiro'),
      ex('Segundo'),
    ]);

    expect(cards.map((c) => c.principal.nome)).toEqual([
      'Terceiro',
      'Primeiro',
      'Segundo',
    ]);
  });

  it('CONJ-04: conjunto listado antes do principal ainda monta o par certo', () => {
    const cards = agruparConjuntos([
      ex('Elevação frontal', 'p1', 'conjunto'),
      ex('Elevação lateral', 'p1', 'principal'),
    ]);

    expect(cards).toHaveLength(1);
    expect(cards[0].principal.nome).toBe('Elevação lateral');
    expect(cards[0].conjunto?.nome).toBe('Elevação frontal');
  });

  it('CONJ-04: terceira linha com a mesma chave vira card próprio, não é descartada', () => {
    // O unique do banco impede isso, mas dado velho ou payload adulterado não
    // pode fazer exercício sumir da prescrição.
    const cards = agruparConjuntos([
      ex('Elevação lateral', 'p1', 'principal'),
      ex('Elevação frontal', 'p1', 'conjunto'),
      ex('Crucifixo inverso', 'p1', 'conjunto'),
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0].conjunto?.nome).toBe('Elevação frontal');
    expect(cards[1].principal.nome).toBe('Crucifixo inverso');
    expect(cards[1].conjunto).toBeNull();
  });

  it('CONJ-04: dois pares diferentes não se misturam', () => {
    const cards = agruparConjuntos([
      ex('Elevação lateral', 'p1', 'principal'),
      ex('Elevação frontal', 'p1', 'conjunto'),
      ex('Rosca direta', 'p2', 'principal'),
      ex('Tríceps testa', 'p2', 'conjunto'),
    ]);

    expect(cards).toHaveLength(2);
    expect(cards[0].conjunto?.nome).toBe('Elevação frontal');
    expect(cards[1].principal.nome).toBe('Rosca direta');
    expect(cards[1].conjunto?.nome).toBe('Tríceps testa');
  });

  it('CONJ-04: lista vazia devolve lista vazia', () => {
    expect(agruparConjuntos([])).toEqual([]);
  });

  it('CONJ-04: não muta a lista recebida', () => {
    const entrada = [
      ex('Elevação lateral', 'p1', 'principal'),
      ex('Elevação frontal', 'p1', 'conjunto'),
    ];
    const copia = [...entrada];

    agruparConjuntos(entrada);

    expect(entrada).toEqual(copia);
    expect(entrada).toHaveLength(2);
  });
});

describe('TEXTO_SERIE_CONJUNTA', () => {
  it('CONJ-11: explica emendar sem descanso e descansar no fim do par', () => {
    expect(TEXTO_SERIE_CONJUNTA).toContain('sem descanso');
    expect(TEXTO_SERIE_CONJUNTA).toContain('fim do par');
  });
});
