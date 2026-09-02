import { describe, it, expect } from 'vitest';
import {
  parseSanityItems,
  matchReferencia,
  enrichWithReferencia,
  parseDescricao,
  mergeKcalDoModelo,
  type ItemTabela,
} from './sanityMath.ts';

const TABELA: ItemTabela[] = [
  { nome: 'Pão francês', kcal: 300, prot: 8, carb: 58.6, gord: 3.1 },
  { nome: 'Banana, crua', kcal: 98, prot: 1.3, carb: 26, gord: 0.1 },
  { nome: 'Aveia em flocos', kcal: 394, prot: 13.9, carb: 66.6, gord: 8.5 },
  { nome: 'Mel, de abelha', kcal: 309, prot: 0, carb: 84, gord: 0 },
  { nome: 'Morango, cru', kcal: 30, prot: 0.9, carb: 6.8, gord: 0.3 },
  { nome: 'Frango, peito sem pele, grelhado', kcal: 159, prot: 32, carb: 0, gord: 2.5 },
];

describe('parseSanityItems — gramas em item string (formato antigo)', () => {
  it('extrai qty_g de "pão francês (55 g)"', () => {
    const [it] = parseSanityItems(['pão francês (55 g)']);
    expect(it.name).toBe('pão francês');
    expect(it.qty_g).toBe(55);
  });

  it('string sem gramas vira só name', () => {
    const [it] = parseSanityItems(['café']);
    expect(it).toEqual({ name: 'café' });
  });

  it('aceita vírgula decimal e espaço variável', () => {
    const [it] = parseSanityItems(['banana (90,5 g)']);
    expect(it.qty_g).toBeCloseTo(90.5);
  });
});

describe('matchReferencia', () => {
  it('casa nome exato ignorando acento/caixa/forma', () => {
    expect(matchReferencia('pão francês', TABELA)?.nome).toBe('Pão francês');
    expect(matchReferencia('BANANA', TABELA)?.nome).toBe('Banana, crua');
    expect(matchReferencia('mel', TABELA)?.nome).toBe('Mel, de abelha');
  });

  it('casa item quando é subconjunto do nome da referência', () => {
    expect(matchReferencia('aveia', TABELA)?.nome).toBe('Aveia em flocos');
  });

  it('NÃO casa mistura que não é subconjunto (granola com aveia e chia)', () => {
    expect(matchReferencia('granola com aveia e chia', TABELA)).toBeNull();
  });

  it('NÃO casa o que não está na tabela (café)', () => {
    expect(matchReferencia('café', TABELA)).toBeNull();
  });
});

describe('enrichWithReferencia — kcal por código (tabela × gramas / 100)', () => {
  it('recalcula os itens que casam e têm gramas', () => {
    const itens = parseSanityItems([
      'pão francês (55 g)',
      'banana (90 g)',
    ]);
    const out = enrichWithReferencia(itens, TABELA);
    expect(out[0]).toMatchObject({ name: 'pão francês', qty_g: 55, kcal: 165 });
    expect(out[1]).toMatchObject({ name: 'banana', qty_g: 90, kcal: 88 });
  });

  it('mantém o item quando não casa na tabela', () => {
    const itens = parseSanityItems([{ name: 'café', qty_g: 50, kcal: 1 }]);
    const out = enrichWithReferencia(itens, TABELA);
    expect(out[0]).toMatchObject({ name: 'café', kcal: 1 });
  });

  it('mantém o item quando não tem gramas', () => {
    const itens = parseSanityItems([{ name: 'banana', kcal: 200 }]);
    const out = enrichWithReferencia(itens, TABELA);
    expect(out[0].kcal).toBe(200);
  });
});

describe('parseDescricao — itens direto do texto (não depende do modelo)', () => {
  it('extrai TODOS os itens da refeição do jhonatan', () => {
    const desc =
      '90 g de banana, 50 g de morango, 5 g de granola com aveia e chia, 1 g de mel, 50 g de café, 55 g de pão francês';
    const itens = parseDescricao(desc);
    expect(itens.map((i) => i.name)).toEqual([
      'banana',
      'morango',
      'granola com aveia e chia',
      'mel',
      'café',
      'pão francês',
    ]);
    expect(itens.map((i) => i.qty_g)).toEqual([90, 50, 5, 1, 50, 55]);
  });

  it('o total via referência inclui o pão francês (o bug do 121)', () => {
    const desc = '90 g de banana, 50 g de morango, 1 g de mel, 55 g de pão francês';
    const itens = enrichWithReferencia(parseDescricao(desc), TABELA);
    const total = itens.reduce((a, i) => a + (i.kcal ?? 0), 0);
    // banana 88 + morango 15 + mel 3 + pão 165 = 271
    expect(total).toBe(271);
    expect(itens.some((i) => /pão/.test(i.name))).toBe(true);
  });

  it('descrição livre (sem gramas) → vazio (cai no modelo)', () => {
    expect(parseDescricao('um pão com café e uma banana')).toEqual([]);
  });

  it('aceita ml e "de" opcional', () => {
    const itens = parseDescricao('200 ml de leite, 30 g aveia');
    expect(itens).toEqual([
      { name: 'leite', qty_g: 200 },
      { name: 'aveia', qty_g: 30 },
    ]);
  });
});

describe('mergeKcalDoModelo — kcal de item fora da referência', () => {
  it('preenche kcal ausente a partir do item do modelo (por nome)', () => {
    const base = parseDescricao('5 g de granola com aveia e chia'); // sem kcal
    const modelo = [{ name: 'granola com aveia e chia', qty_g: 5, kcal: 22 }];
    const out = mergeKcalDoModelo(base, modelo);
    expect(out[0].kcal).toBe(22);
  });

  it('deixa como está quando o modelo não citou o item', () => {
    const base = parseDescricao('5 g de granola');
    const out = mergeKcalDoModelo(base, []);
    expect(out[0].kcal).toBeUndefined();
  });
});
