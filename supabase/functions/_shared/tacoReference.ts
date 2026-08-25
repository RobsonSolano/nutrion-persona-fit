// Referência nutricional para o sanity check de refeição (spec SAN-08, SAN-09).
// TS PURO (sem imports Deno) — testável por vitest. O chat-ai importa daqui.
//
// FONTE: Tabela Brasileira de Composição de Alimentos (TACO), NEPA/UNICAMP,
// com financiamento do Ministério da Saúde/MDS. Valores por 100 g do alimento
// NA FORMA INDICADA no nome. Uso liberado pelo dev em 2026-08-25 (dado público).
//
// POR QUE ESTA LISTA EXISTE: o prompt antes só dizia "use tabelas nutricionais
// brasileiras (TACO/USDA)" — instrução de texto, sem número nenhum. O modelo
// então ancorava onde queria, e a âncora mais danosa é o alimento CRU: arroz
// integral cru tem 360 kcal/100 g contra 124 cozido, e feijão vai de ~330 para
// ~78. Usar o valor seco num prato pronto infla o total de 3 a 5 vezes — e
// arroz com feijão é a base do prato brasileiro.
//
// REGRA DE CURADORIA (vale para quem for editar): só entra alimento cuja forma
// listada é a forma como ele é SERVIDO. Grão, massa e tubérculo apenas cozidos;
// fruta e folha de salada podem ser cruas; farinha, aveia e amendoim são
// consumidos assim mesmo. Há teste automatizado impedindo grão/massa cru aqui.
// Subconjunto curado de propósito: cobre o prato brasileiro comum sem estourar
// o orçamento de tokens do prompt.

export type AlimentoTaco = {
  /** Nome como na TACO, incluindo a forma de preparo. */
  nome: string;
  /** Por 100 g. */
  kcal: number;
  prot: number;
  carb: number;
  gord: number;
};

export const TACO_ALIMENTOS: readonly AlimentoTaco[] = [
  { nome: 'Arroz, integral, cozido', kcal: 124, prot: 2.6, carb: 25.8, gord: 1 },
  { nome: 'Arroz, tipo 1, cozido', kcal: 128, prot: 2.5, carb: 28.1, gord: 0.2 },
  { nome: 'Feijão, carioca, cozido', kcal: 76, prot: 4.8, carb: 13.6, gord: 0.5 },
  { nome: 'Feijão, preto, cozido', kcal: 77, prot: 4.5, carb: 14, gord: 0.5 },
  { nome: 'Cuscuz de milho, cozido', kcal: 113, prot: 2.2, carb: 25.3, gord: 0.7 },
  { nome: 'Polenta, pré-cozida', kcal: 103, prot: 2.3, carb: 23.3, gord: 0.3 },
  { nome: 'Batata, inglesa, cozida', kcal: 52, prot: 1.2, carb: 11.9, gord: 0 },
  { nome: 'Batata, inglesa, frita', kcal: 267, prot: 5, carb: 35.6, gord: 13.1 },
  { nome: 'Mandioca, cozida', kcal: 125, prot: 0.6, carb: 30.1, gord: 0.3 },
  { nome: 'Farinha de mandioca', kcal: 361, prot: 1.6, carb: 87.9, gord: 0.3 },
  { nome: 'Farofa de mandioca, temperada', kcal: 406, prot: 2.1, carb: 80.3, gord: 9.1 },
  { nome: 'Aveia em flocos', kcal: 394, prot: 13.9, carb: 66.6, gord: 8.5 },
  { nome: 'Pão francês', kcal: 300, prot: 8, carb: 58.6, gord: 3.1 },
  { nome: 'Pão de forma integral', kcal: 253, prot: 9.4, carb: 49.9, gord: 3.7 },
  { nome: 'Lasanha', kcal: 164, prot: 5.8, carb: 32.5, gord: 1.2 },
  { nome: 'Arroz carreteiro', kcal: 154, prot: 10.8, carb: 11.6, gord: 7.1 },
  { nome: 'Frango, peito sem pele, grelhado', kcal: 159, prot: 32, carb: 0, gord: 2.5 },
  { nome: 'Frango, coxa com pele, assada', kcal: 215, prot: 28.5, carb: 0.1, gord: 10.4 },
  { nome: 'Frango, sobrecoxa com pele, assada', kcal: 260, prot: 28.7, carb: 0, gord: 15.2 },
  { nome: 'Carne bovina, patinho, grelhado', kcal: 219, prot: 35.9, carb: 0, gord: 7.3 },
  { nome: 'Carne bovina moída, cozida', kcal: 212, prot: 26.7, carb: 0, gord: 10.9 },
  { nome: 'Linguiça de porco, frita', kcal: 280, prot: 20.5, carb: 0, gord: 21.3 },
  { nome: 'Presunto, sem capa de gordura', kcal: 94, prot: 14.3, carb: 2.1, gord: 2.7 },
  { nome: 'Sardinha, frita', kcal: 257, prot: 33.4, carb: 0, gord: 12.7 },
  { nome: 'Atum, conserva em óleo', kcal: 166, prot: 26.2, carb: 0, gord: 6 },
  { nome: 'Ovo de galinha, frito', kcal: 240, prot: 15.6, carb: 1.2, gord: 18.6 },
  { nome: 'Coxinha de frango, frita', kcal: 283, prot: 9.6, carb: 34.5, gord: 11.8 },
  { nome: 'Pastel, de carne, frito', kcal: 388, prot: 10.1, carb: 43.8, gord: 20.1 },
  { nome: 'Pão, de queijo, assado', kcal: 363, prot: 5.1, carb: 34.2, gord: 24.6 },
  { nome: 'Azeite de oliva', kcal: 884, prot: 0, carb: 0, gord: 100 },
  { nome: 'Óleo, de soja', kcal: 884, prot: 0, carb: 0, gord: 100 },
  { nome: 'Manteiga, com sal', kcal: 726, prot: 0.4, carb: 0.1, gord: 82.4 },
  { nome: 'Queijo, minas, frescal', kcal: 264, prot: 17.4, carb: 3.2, gord: 20.2 },
  { nome: 'Requeijão cremoso', kcal: 257, prot: 9.6, carb: 2.4, gord: 23.4 },
  { nome: 'Iogurte, natural', kcal: 51, prot: 4.1, carb: 1.9, gord: 3 },
  { nome: 'Açúcar, refinado', kcal: 387, prot: 0.3, carb: 99.5, gord: 0 },
  { nome: 'Mel, de abelha', kcal: 309, prot: 0, carb: 84, gord: 0 },
  { nome: 'Chocolate, ao leite', kcal: 540, prot: 7.2, carb: 59.6, gord: 30.3 },
  { nome: 'Castanha-de-caju, torrada', kcal: 570, prot: 18.5, carb: 29.1, gord: 46.3 },
  { nome: 'Amendoim, grão', kcal: 544, prot: 27.2, carb: 20.3, gord: 43.9 },
  { nome: 'Refrigerante de cola', kcal: 34, prot: 0, carb: 8.7, gord: 0 },
  { nome: 'Alface, crua', kcal: 14, prot: 1.7, carb: 2.4, gord: 0.1 },
  { nome: 'Tomate, cru', kcal: 15, prot: 1.1, carb: 3.1, gord: 0.2 },
  { nome: 'Cenoura, crua', kcal: 34, prot: 1.3, carb: 7.7, gord: 0.2 },
  { nome: 'Couve, crua', kcal: 27, prot: 2.9, carb: 4.3, gord: 0.5 },
  { nome: 'Brócolis, cozido', kcal: 25, prot: 2.1, carb: 4.4, gord: 0.5 },
  { nome: 'Cebola, crua', kcal: 39, prot: 1.7, carb: 8.9, gord: 0.1 },
  { nome: 'Banana, crua', kcal: 98, prot: 1.3, carb: 26, gord: 0.1 },
  { nome: 'Maçã, com casca, crua', kcal: 56, prot: 0.3, carb: 15.2, gord: 0 },
  { nome: 'Laranja, crua', kcal: 37, prot: 1, carb: 8.9, gord: 0.1 },
  { nome: 'Mamão, cru', kcal: 45, prot: 0.8, carb: 11.6, gord: 0.1 },
  { nome: 'Melancia, crua', kcal: 33, prot: 0.9, carb: 8.1, gord: 0 },
  { nome: 'Batata-doce, cozida', kcal: 77, prot: 0.6, carb: 18.4, gord: 0.1 },
  { nome: 'Lentilha, cozida', kcal: 93, prot: 6.3, carb: 16.3, gord: 0.5 },
  { nome: 'Macarrão ao molho bolonhesa', kcal: 120, prot: 4.9, carb: 22.5, gord: 0.9 },
  { nome: 'Porco, lombo, assado', kcal: 210, prot: 35.7, carb: 0, gord: 6.4 },
  { nome: 'Abacate, cru', kcal: 96, prot: 1.2, carb: 6, gord: 8.4 },
];

/**
 * Bloco de referência para o system prompt do sanity check. Formato compacto
 * (sem rótulo repetido por linha) porque isso entra em TODA chamada — o custo
 * de token é recorrente.
 */
export function formatTacoForPrompt(): string {
  const linhas = TACO_ALIMENTOS.map(
    (a) => `${a.nome} = ${a.kcal} | ${a.prot} | ${a.carb} | ${a.gord}`,
  );

  return [
    'REFERÊNCIA NUTRICIONAL — Tabela TACO (NEPA/UNICAMP). Valores por 100 g do alimento NA FORMA INDICADA.',
    'Formato: alimento = kcal | proteína g | carboidrato g | gordura g',
    ...linhas,
    '',
    'REGRA CRÍTICA: use SEMPRE o valor da forma como o alimento é SERVIDO (cozido, grelhado, assado),',
    'nunca do grão seco ou do alimento cru. Arroz e feijão cozidos têm de 3 a 5 vezes menos kcal por',
    '100 g que crus — confundir os dois é o erro mais comum nesse tipo de estimativa.',
    'Alimento fora da lista: estime por analogia com o mais parecido dela.',
    'Se só souber o valor do alimento SECO/CRU, lembre que grão e massa absorvem água e rendem de',
    '2,5 a 3 vezes o peso seco ao cozinhar — divida o valor por 100 g do seco por esse fator antes',
    'de aplicar à porção cozida. Ex.: 100 g de macarrão seco (371 kcal) viram ~250-300 g cozidos.',
  ].join('\n');
}
