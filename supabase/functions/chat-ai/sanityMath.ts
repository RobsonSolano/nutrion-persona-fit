// Soma e reconciliação dos macros do sanity check de refeição (spec SAN-01..SAN-05).
// TS PURO (sem imports Deno) — testável por vitest. O index.ts (Deno) importa daqui.
//
// Por que somar em código: o modelo estimava o total num único salto e inflava
// as calorias. Pedindo item → gramagem → kcal do item e somando aqui, o total
// deixa de ser um chute do LLM e passa a ser aritmética. O `macros` que o
// modelo escreve no top-level é ignorado quando há itens somáveis.

export type SanityItem = {
  name: string;
  qty_g?: number;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
};

export type Macros = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
};

export type Reconciliado = {
  macros: Macros | null;
  /** De onde saiu o total: soma dos itens, total do modelo, ou nada
   *  aproveitável. O caller deriva o código de telemetria daqui. */
  source: 'items' | 'model' | 'none';
};

// DUPLICAÇÃO INTENCIONAL: `src/lib/sanityItems.ts` tem coerção e normalização
// equivalentes. Não é descuido — este arquivo roda em Deno (edge function,
// deployada por `fn:deploy`) e não pode importar de `src/`, que é o bundle do
// app. Sem build step compartilhado, unificar exigiria acoplar dois artefatos
// de deploy independentes. Ao mexer na regra de coerção, mexa nos dois.
const CAMPOS_NUM = ['qty_g', 'kcal', 'protein_g', 'carbs_g', 'fats_g'] as const;

/** Aceita número ou string ("88", "9,9"). Rejeita negativo e não-finito. */
function coerceNumero(valor: unknown): number | undefined {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) && valor >= 0 ? valor : undefined;
  }
  if (typeof valor === 'string') {
    const m = valor.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  return undefined;
}

function arredondar(m: Macros): Macros {
  return {
    kcal: Math.round(m.kcal),
    protein_g: Math.round(m.protein_g),
    carbs_g: Math.round(m.carbs_g),
    fats_g: Math.round(m.fats_g),
  };
}

/**
 * Normaliza o `items` que veio do modelo. Tolera o formato antigo (item era só
 * uma string com o nome) pra não quebrar resposta em voo nem cache antigo.
 */
export function parseSanityItems(raw: unknown): SanityItem[] {
  if (!Array.isArray(raw)) return [];

  const itens: SanityItem[] = [];
  for (const bruto of raw) {
    if (typeof bruto === 'string') {
      const name = bruto.trim();
      if (name) itens.push({ name });
      continue;
    }
    if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) continue;

    const obj = bruto as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;

    const item: SanityItem = { name };
    for (const campo of CAMPOS_NUM) {
      const n = coerceNumero(obj[campo]);
      if (n !== undefined) item[campo] = n;
    }
    itens.push(item);
  }
  return itens;
}

/**
 * Soma os macros dos itens. `qty_g` não entra (é peso, não macro) — serve pra
 * avaliar densidade. Devolve null quando nenhum item traz número algum: aí não
 * há o que somar e o caller decide o fallback.
 */
export function sumItems(itens: SanityItem[]): Macros | null {
  const temNumero = itens.some(
    (i) =>
      i.kcal !== undefined ||
      i.protein_g !== undefined ||
      i.carbs_g !== undefined ||
      i.fats_g !== undefined,
  );
  if (!temNumero) return null;

  const total = itens.reduce<Macros>(
    (acc, i) => ({
      kcal: acc.kcal + (i.kcal ?? 0),
      protein_g: acc.protein_g + (i.protein_g ?? 0),
      carbs_g: acc.carbs_g + (i.carbs_g ?? 0),
      fats_g: acc.fats_g + (i.fats_g ?? 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0 },
  );
  return arredondar(total);
}

function normalizarMacrosDoModelo(raw: unknown): Macros | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const kcal = coerceNumero(o.kcal);
  if (kcal === undefined) return null;

  return arredondar({
    kcal,
    protein_g: coerceNumero(o.protein_g) ?? 0,
    carbs_g: coerceNumero(o.carbs_g) ?? 0,
    fats_g: coerceNumero(o.fats_g) ?? 0,
  });
}

/**
 * Decide o total final. A soma dos itens SEMPRE vence quando existe — inclusive
 * (e principalmente) quando diverge muito do total que o modelo escreveu, já que
 * essa divergência é exatamente o bug sendo corrigido.
 */
export function reconcileMacros(
  itens: SanityItem[],
  macrosDoModelo: unknown,
): Reconciliado {
  const soma = sumItems(itens);
  if (soma) return { macros: soma, source: 'items' };

  const doModelo = normalizarMacrosDoModelo(macrosDoModelo);
  if (doModelo) return { macros: doModelo, source: 'model' };

  return { macros: null, source: 'none' };
}

/**
 * Rótulos em texto dos itens, pro campo `text` da resposta (SAN-11).
 *
 * A function e o app são publicados por caminhos independentes, então a
 * function nova conversa com apps antigos por um tempo. O app em produção
 * renderiza `items` como `<Text>{item}</Text>` — receber objeto ali crasharia
 * ("Objects are not valid as a React child"). Mandando strings no `text`, o app
 * antigo segue funcionando e ainda ganha os macros já reconciliados; o app novo
 * lê os objetos ricos do envelope.
 */
export function itemsComoTexto(itens: SanityItem[]): string[] {
  // `> 0` e não `!== undefined`: o modelo às vezes manda qty_g:0 junto de kcal,
  // e "arroz (0 g)" no chip fica pior que só "arroz".
  return itens.map((i) =>
    i.qty_g && i.qty_g > 0 ? `${i.name} (${Math.round(i.qty_g)} g)` : i.name,
  );
}

/**
 * Extrai o objeto JSON da resposta do modelo. `response_format: json_object`
 * já pede JSON limpo, mas há histórico do Llama embrulhar em cerca de markdown
 * ou prefaciar com texto — daí as duas tentativas. Devolve null quando não há
 * objeto aproveitável, e aí o caller mantém a resposta crua (o cliente tem
 * fallback próprio por regex).
 */
export function extrairJsonDoTexto(texto: string): Record<string, unknown> | null {
  const limpo = texto
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const tentar = (candidato: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(candidato);
      return typeof v === 'object' && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const direto = tentar(limpo);
  if (direto) return direto;

  const bloco = limpo.match(/\{[\s\S]*\}/);
  return bloco ? tentar(bloco[0]) : null;
}

/**
 * Teto físico de densidade calórica: 9 kcal por grama, que é gordura pura.
 * Nada comestível passa disso, então acima é erro aritmético do modelo e não
 * estimativa pessimista.
 *
 * Deliberadamente NÃO é um teto "de prato" (4-5 kcal/g), que pegaria mais
 * casos: 15 g de azeite sozinhos dão ~8,8 kcal/g e seriam corrigidos pra baixo
 * indevidamente. Prefere pegar menos e nunca errar contra o usuário.
 */
export const KCAL_POR_GRAMA_MAX = 9;

export type TetoAplicado = {
  macros: Macros;
  /** Fator de correção aplicado, ou null quando nada foi mexido. */
  fator: number | null;
};

/**
 * Corrige o total quando a densidade calórica é fisicamente impossível.
 *
 * Escala os QUATRO macros pelo mesmo fator: corrigir só o kcal deixaria total
 * e macros brigando entre si — exatamente o problema que a reconciliação
 * resolve. Sem peso na balança não há como avaliar densidade, então passa
 * intacto.
 */
export function aplicarTetoDensidade(
  macros: Macros,
  scaleWeightG: number | undefined,
): TetoAplicado {
  if (!scaleWeightG || scaleWeightG <= 0) return { macros, fator: null };

  const teto = scaleWeightG * KCAL_POR_GRAMA_MAX;
  if (!(macros.kcal > teto)) return { macros, fator: null };

  const fator = teto / macros.kcal;
  return {
    macros: {
      kcal: Math.round(teto),
      protein_g: Math.round(macros.protein_g * fator),
      carbs_g: Math.round(macros.carbs_g * fator),
      fats_g: Math.round(macros.fats_g * fator),
    },
    fator,
  };
}
