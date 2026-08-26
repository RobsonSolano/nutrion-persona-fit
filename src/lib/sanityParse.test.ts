import { describe, it, expect } from 'vitest';
import { extractMacrosFromText, normalizeSanityItems } from './sanityParse';

describe('normalizeSanityItems', () => {
  it('SAN-07: usa os objetos ricos do envelope quando a function os manda', () => {
    const items = normalizeSanityItems(
      [
        { name: 'Arroz branco cozido', qty_g: 150, kcal: 192, protein_g: 4, carbs_g: 42, fats_g: 0 },
        { name: 'Feijão carioca cozido', qty_g: 100, kcal: 76 },
      ],
      ['Arroz branco cozido (150 g)', 'Feijão carioca cozido (100 g)'],
    );

    expect(items).toEqual([
      { name: 'Arroz branco cozido', qty_g: 150, kcal: 192, protein_g: 4, carbs_g: 42, fats_g: 0 },
      { name: 'Feijão carioca cozido', qty_g: 100, kcal: 76 },
    ]);
  });

  it('SAN-11: function ANTIGA (sem envelope) → converte as strings do texto em {name}', () => {
    // App novo falando com function que ainda não foi deployada.
    const items = normalizeSanityItems(undefined, ['arroz', 'feijão', 'ovo frito']);

    expect(items).toEqual([{ name: 'arroz' }, { name: 'feijão' }, { name: 'ovo frito' }]);
  });

  it('SAN-11: envelope vazio também cai pro texto (não engole os itens)', () => {
    expect(normalizeSanityItems([], ['arroz'])).toEqual([{ name: 'arroz' }]);
  });

  it('SAN-07: item do envelope sem nome utilizável é descartado', () => {
    const items = normalizeSanityItems(
      [{ kcal: 100 }, { name: '  ' }, null, 'arroz solto', { name: 'ovo', kcal: 70 }],
      undefined,
    );

    expect(items).toEqual([{ name: 'arroz solto' }, { name: 'ovo', kcal: 70 }]);
  });

  it('SAN-07: número vindo como string é coagido', () => {
    expect(normalizeSanityItems([{ name: 'azeite', qty_g: '10', kcal: '88' }], undefined)).toEqual([
      { name: 'azeite', qty_g: 10, kcal: 88 },
    ]);
  });

  it('SAN-07: nenhuma das duas fontes → lista vazia, sem lançar', () => {
    expect(normalizeSanityItems(undefined, undefined)).toEqual([]);
    expect(normalizeSanityItems(null, null)).toEqual([]);
    expect(normalizeSanityItems('arroz', 'feijão')).toEqual([]);
    expect(normalizeSanityItems(42, {})).toEqual([]);
  });

  it('SAN-11: string já formatada com gramagem é preservada como nome', () => {
    expect(normalizeSanityItems(undefined, ['Arroz branco cozido (150 g)'])).toEqual([
      { name: 'Arroz branco cozido (150 g)' },
    ]);
  });
});

describe('extractMacrosFromText', () => {
  // Fallback de último recurso: só roda quando o JSON.parse falha nos DOIS lados
  // (servidor e cliente). Com itens tendo `kcal` próprio e vindo ANTES de
  // `macros` no schema, uma busca ingênua pegaria o kcal do primeiro item.
  const quebrado =
    '{"items":[{"name":"arroz","qty_g":150,"kcal":195,"protein_g":4,"carbs_g":42,"fats_g":0},' +
    '{"name":"feijao","qty_g":100,"kcal":62,"protein_g":5,"carbs_g":11,"fats_g":1}],' +
    '"consistency":"ok,"macros":{"kcal":507,"protein_g":30,"carbs_g":60,"fats_g":12},"feedback":"..."}';

  it('SAN-02: pega o TOTAL de "macros", não o kcal do primeiro item', () => {
    expect(extractMacrosFromText(quebrado)).toEqual({
      kcal: 507,
      protein_g: 30,
      carbs_g: 60,
      fats_g: 12,
    });
  });

  it('SAN-03: sem bloco "macros", cai para a busca no texto inteiro', () => {
    expect(extractMacrosFromText('{"kcal":320,"protein_g":22}')).toEqual({
      kcal: 320,
      protein_g: 22,
      carbs_g: undefined,
      fats_g: undefined,
    });
  });

  it('SAN-03: aceita número em string e vírgula decimal', () => {
    expect(extractMacrosFromText('"macros":{"kcal":"410","fats_g":"9,5"}')?.kcal).toBe(410);
    expect(extractMacrosFromText('"macros":{"kcal":"410","fats_g":"9,5"}')?.fats_g).toBe(9.5);
  });

  it('SAN-03: kcal negativo é rejeitado (food_logs tem check calories >= 0)', () => {
    expect(extractMacrosFromText('"macros":{"kcal":-50}')).toBeUndefined();
  });

  it('SAN-03: aceita os aliases de nome que o modelo às vezes usa', () => {
    // Preserva o comportamento que existia no service: o Llama já devolveu
    // "calorias"/"proteina" em vez dos nomes do schema.
    expect(extractMacrosFromText('{"calorias":380,"proteina":25,"carboidratos":40,"gorduras":10}')).toEqual({
      kcal: 380,
      protein_g: 25,
      carbs_g: 40,
      fats_g: 10,
    });
    expect(extractMacrosFromText('{"calories":300,"protein":20}')?.kcal).toBe(300);
    expect(extractMacrosFromText('{"calories":300,"protein":20}')?.protein_g).toBe(20);
  });

  it('SAN-03: texto sem kcal nenhum → undefined', () => {
    expect(extractMacrosFromText('não consegui analisar')).toBeUndefined();
  });
});
