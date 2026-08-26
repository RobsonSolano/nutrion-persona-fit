import { describe, it, expect } from 'vitest';
import {
  aplicarTetoDensidade,
  extrairJsonDoTexto,
  itemsComoTexto,
  parseSanityItems,
  reconcileMacros,
  sumItems,
} from './sanityMath';

describe('parseSanityItems', () => {
  it('SAN-01: itens bem formados preservam nome e os cinco números', () => {
    const items = parseSanityItems([
      { name: 'Arroz branco cozido', qty_g: 150, kcal: 192, protein_g: 4, carbs_g: 42, fats_g: 0 },
      { name: 'Feijão carioca cozido', qty_g: 100, kcal: 76, protein_g: 5, carbs_g: 14, fats_g: 1 },
    ]);

    expect(items).toEqual([
      { name: 'Arroz branco cozido', qty_g: 150, kcal: 192, protein_g: 4, carbs_g: 42, fats_g: 0 },
      { name: 'Feijão carioca cozido', qty_g: 100, kcal: 76, protein_g: 5, carbs_g: 14, fats_g: 1 },
    ]);
  });

  it('SAN-05: item legado em string vira {name}, sem derrubar os demais', () => {
    const items = parseSanityItems(['arroz', { name: 'ovo', kcal: 70 }]);

    expect(items).toEqual([{ name: 'arroz' }, { name: 'ovo', kcal: 70 }]);
  });

  it('SAN-05: item sem nome utilizável é descartado', () => {
    const items = parseSanityItems([
      { kcal: 200 },
      { name: '   ' },
      '',
      null,
      42,
      { name: 'frango grelhado', kcal: 165 },
    ]);

    expect(items).toEqual([{ name: 'frango grelhado', kcal: 165 }]);
  });

  it('SAN-01: número vindo como string é coagido (inclusive com vírgula decimal)', () => {
    const items = parseSanityItems([
      { name: 'azeite', qty_g: '10', kcal: '88', fats_g: '9,9' },
    ]);

    expect(items).toEqual([{ name: 'azeite', qty_g: 10, kcal: 88, fats_g: 9.9 }]);
  });

  it('SAN-01: qty_g ausente não invalida o item — só impede avaliar densidade', () => {
    expect(parseSanityItems([{ name: 'salada', kcal: 30 }])).toEqual([
      { name: 'salada', kcal: 30 },
    ]);
  });

  it('SAN-01: raw que não é array → lista vazia, sem lançar', () => {
    expect(parseSanityItems(null)).toEqual([]);
    expect(parseSanityItems(undefined)).toEqual([]);
    expect(parseSanityItems('arroz e feijão')).toEqual([]);
    expect(parseSanityItems({ name: 'arroz' })).toEqual([]);
  });
});

describe('sumItems', () => {
  it('SAN-02: soma os itens e arredonda para inteiro (food_logs guarda integer)', () => {
    const macros = sumItems([
      { name: 'arroz', kcal: 192.4, protein_g: 4.2, carbs_g: 42.1, fats_g: 0.3 },
      { name: 'feijão', kcal: 76.2, protein_g: 5.1, carbs_g: 13.6, fats_g: 0.6 },
    ]);

    expect(macros).toEqual({ kcal: 269, protein_g: 9, carbs_g: 56, fats_g: 1 });
  });

  it('SAN-02: item sem qty_g mas com kcal CONTA na soma', () => {
    const macros = sumItems([
      { name: 'arroz', qty_g: 150, kcal: 190, protein_g: 4, carbs_g: 42, fats_g: 0 },
      { name: 'azeite a olho', kcal: 90, fats_g: 10 },
    ]);

    expect(macros).toEqual({ kcal: 280, protein_g: 4, carbs_g: 42, fats_g: 10 });
  });

  it('SAN-02: campo ausente conta como zero', () => {
    expect(sumItems([{ name: 'arroz', kcal: 100 }])).toEqual({
      kcal: 100,
      protein_g: 0,
      carbs_g: 0,
      fats_g: 0,
    });
  });

  it('SAN-02: lista vazia → null (nada somável)', () => {
    expect(sumItems([])).toBeNull();
  });

  it('SAN-02: itens só com nome, sem número nenhum → null', () => {
    expect(sumItems([{ name: 'arroz' }, { name: 'feijão' }])).toBeNull();
  });
});

describe('reconcileMacros', () => {
  it('SAN-02: a soma dos itens vence, mesmo divergindo MUITO do total do modelo', () => {
    // É o próprio bug: o modelo infla o total. A soma é a fonte de verdade.
    const r = reconcileMacros(
      [
        { name: 'arroz', kcal: 190, protein_g: 4, carbs_g: 42, fats_g: 0 },
        { name: 'feijão', kcal: 76, protein_g: 5, carbs_g: 14, fats_g: 1 },
      ],
      { kcal: 950, protein_g: 40, carbs_g: 90, fats_g: 30 },
    );

    expect(r.source).toBe('items');
    expect(r.macros).toEqual({ kcal: 266, protein_g: 9, carbs_g: 56, fats_g: 1 });
  });

  it('SAN-03: sem itens somáveis, cai no total do modelo', () => {
    const r = reconcileMacros([], { kcal: 420, protein_g: 30, carbs_g: 40, fats_g: 12 });

    expect(r.source).toBe('model');
    expect(r.macros).toEqual({ kcal: 420, protein_g: 30, carbs_g: 40, fats_g: 12 });
  });

  it('SAN-03: itens só com nome também caem no total do modelo', () => {
    const r = reconcileMacros([{ name: 'arroz' }], { kcal: 300, protein_g: 8, carbs_g: 60, fats_g: 2 });

    expect(r.source).toBe('model');
    expect(r.macros?.kcal).toBe(300);
  });

  it('SAN-03: sem itens e sem total do modelo → source "none" e macros null', () => {
    const r = reconcileMacros([], null);

    expect(r.source).toBe('none');
    expect(r.macros).toBeNull();
  });

  it('SAN-03: total do modelo malformado (string/negativo) não passa por válido', () => {
    const r = reconcileMacros([], { kcal: 'muitas', protein_g: -5 });

    expect(r.source).toBe('none');
    expect(r.macros).toBeNull();
  });
});

describe('itemsComoTexto', () => {
  it('SAN-11: item com gramagem vira "nome (150 g)" pro app antigo', () => {
    expect(
      itemsComoTexto([
        { name: 'Arroz branco cozido', qty_g: 150, kcal: 192 },
        { name: 'Feijão carioca cozido', qty_g: 100 },
      ]),
    ).toEqual(['Arroz branco cozido (150 g)', 'Feijão carioca cozido (100 g)']);
  });

  it('SAN-11: item sem gramagem vira só o nome', () => {
    expect(itemsComoTexto([{ name: 'salada', kcal: 30 }])).toEqual(['salada']);
  });

  it('SAN-11: gramagem fracionada é arredondada no rótulo', () => {
    expect(itemsComoTexto([{ name: 'azeite', qty_g: 9.6 }])).toEqual(['azeite (10 g)']);
  });

  it('SAN-11: lista vazia → array vazio', () => {
    expect(itemsComoTexto([])).toEqual([]);
  });
});

describe('extrairJsonDoTexto', () => {
  it('SAN-02: JSON puro é parseado', () => {
    expect(extrairJsonDoTexto('{"items":[],"macros":{"kcal":100}}')).toEqual({
      items: [],
      macros: { kcal: 100 },
    });
  });

  it('SAN-02: JSON embrulhado em cerca de markdown é parseado', () => {
    expect(extrairJsonDoTexto('```json\n{"macros":{"kcal":42}}\n```')).toEqual({
      macros: { kcal: 42 },
    });
  });

  it('SAN-02: JSON no meio de texto solto é recuperado', () => {
    expect(
      extrairJsonDoTexto('Claro! Aqui vai: {"macros":{"kcal":7}} — espero ter ajudado'),
    ).toEqual({ macros: { kcal: 7 } });
  });

  it('SAN-03: texto sem JSON → null (caller mantém a resposta crua)', () => {
    expect(extrairJsonDoTexto('não consegui analisar o prato')).toBeNull();
  });

  it('SAN-03: JSON malformado → null, sem lançar', () => {
    expect(extrairJsonDoTexto('{"macros": {"kcal": }')).toBeNull();
  });

  it('SAN-03: array no topo não serve como resposta → null', () => {
    expect(extrairJsonDoTexto('["arroz","feijão"]')).toBeNull();
  });
});

describe('aplicarTetoDensidade (INS-02)', () => {
  const m = (kcal: number, p = 10, c = 20, f = 5) => ({
    kcal,
    protein_g: p,
    carbs_g: c,
    fats_g: f,
  });

  it('INS02: sem peso na balança não mexe em nada', () => {
    const r = aplicarTetoDensidade(m(5000), undefined);
    expect(r.macros).toEqual(m(5000));
    expect(r.fator).toBeNull();
  });

  it('INS02: densidade plausível passa intacta', () => {
    // 400 kcal em 300 g = 1,33 kcal/g — prato normal.
    const r = aplicarTetoDensidade(m(400), 300);
    expect(r.macros.kcal).toBe(400);
    expect(r.fator).toBeNull();
  });

  it('INS02: azeite puro NÃO é corrigido', () => {
    // 15 g de azeite = ~132 kcal = 8,8 kcal/g. Está abaixo do teto físico de
    // propósito: um teto "de prato" (4-5) puniria quem pesou só o azeite.
    const r = aplicarTetoDensidade(m(132), 15);
    expect(r.fator).toBeNull();
  });

  it('INS02: impossível fisicamente é corrigido pro teto', () => {
    // 3000 kcal em 200 g = 15 kcal/g. Nada comestível chega lá.
    const r = aplicarTetoDensidade(m(3000), 200);
    expect(r.macros.kcal).toBe(1800); // 200 g x 9 kcal/g
    expect(r.fator).toBeCloseTo(0.6, 5);
  });

  it('INS02: macros escalam no MESMO fator do total', () => {
    // Corrigir só o kcal deixaria total e macros brigando — o problema que a
    // reconciliação da onda 2a resolveu.
    const r = aplicarTetoDensidade(m(3000, 100, 200, 50), 200);
    expect(r.macros.protein_g).toBe(60);
    expect(r.macros.carbs_g).toBe(120);
    expect(r.macros.fats_g).toBe(30);
  });

  it('INS02: peso zero ou negativo é ignorado (evita divisão por zero)', () => {
    expect(aplicarTetoDensidade(m(500), 0).fator).toBeNull();
    expect(aplicarTetoDensidade(m(500), -10).fator).toBeNull();
  });

  it('INS02: kcal zero não vira NaN', () => {
    const r = aplicarTetoDensidade(m(0, 0, 0, 0), 100);
    expect(r.macros.kcal).toBe(0);
    expect(r.fator).toBeNull();
  });

  it('INS02: exatamente no teto não é corrigido', () => {
    const r = aplicarTetoDensidade(m(900), 100); // 9,0 kcal/g
    expect(r.fator).toBeNull();
  });
});
