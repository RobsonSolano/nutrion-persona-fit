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
 * Item no formato antigo (string). Extrai a gramagem do sufixo "(55 g)" quando
 * houver — o formato que `itemsComoTexto` gera e que o modelo às vezes devolve.
 * Sem gramas, vira só `{ name }`.
 */
function parseStringItem(bruto: string): SanityItem | null {
  const s = bruto.trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*g\s*\)\s*$/i);
  if (m) {
    const name = m[1].trim();
    const qty = coerceNumero(m[2]);
    if (name) return qty !== undefined ? { name, qty_g: qty } : { name };
  }
  return { name: s };
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
      const item = parseStringItem(bruto);
      if (item) itens.push(item);
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

// ── Cálculo determinístico via referência (TACO) ──────────────────────────
// O modelo é confiável em NOMEAR o item e dar a GRAMAGEM, mas não em calcular
// kcal (subestimava). Então, quando o item casa com a referência e tem qty_g,
// o kcal vira aritmética de código (tabela × gramas / 100), não chute do LLM.

/** Só o que importa da linha da referência (mesma forma do AlimentoTaco). */
export type ItemTabela = {
  nome: string;
  kcal: number;
  prot: number;
  carb: number;
  gord: number;
};

// Preposições/ruído que não ajudam a casar nome; formas de preparo
// (cru/cozido/grelhado) NÃO entram aqui de propósito — distinguem linhas.
const STOP = new Set(['de', 'com', 'e', 'da', 'do', 'a', 'o', 'ao', 'em', 'tipo']);

export function normalizarNome(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalizarNome(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t));
}

/**
 * Casa o nome de um item com uma linha da referência, conservador: exige que
 * TODOS os tokens significativos do item estejam na linha (item ⊆ referência).
 * Isso deixa "aveia" casar com "Aveia em flocos", mas impede "granola com aveia
 * e chia" (tem granola/chia, que não estão na linha) de casar errado. Empate:
 * vence quem tem mais overlap e o nome mais enxuto. Sem match confiante → null
 * (mantém o valor que veio do modelo).
 */
export function matchReferencia(
  nome: string,
  tabela: readonly ItemTabela[],
): ItemTabela | null {
  const alvo = tokens(nome);
  if (!alvo.length) return null;

  let melhor: ItemTabela | null = null;
  let melhorScore = -Infinity;
  for (const item of tabela) {
    const refTokens = tokens(item.nome);
    const refSet = new Set(refTokens);
    if (!alvo.every((t) => refSet.has(t))) continue; // item ⊆ referência
    const overlap = alvo.filter((t) => refSet.has(t)).length;
    const score = overlap * 100 - refTokens.length;
    if (score > melhorScore) {
      melhor = item;
      melhorScore = score;
    }
  }
  return melhor;
}

/**
 * Recalcula os macros dos itens que casam com a referência e têm gramagem,
 * usando tabela × qty_g / 100. Item sem match ou sem gramas fica como veio.
 */
export function enrichWithReferencia(
  itens: SanityItem[],
  tabela: readonly ItemTabela[],
): SanityItem[] {
  return itens.map((it) => {
    if (it.qty_g === undefined || it.qty_g <= 0) return it;
    const ref = matchReferencia(it.name, tabela);
    if (!ref) return it;
    const f = it.qty_g / 100;
    return {
      ...it,
      kcal: Math.round(ref.kcal * f),
      protein_g: Math.round(ref.prot * f),
      carbs_g: Math.round(ref.carb * f),
      fats_g: Math.round(ref.gord * f),
    };
  });
}

/**
 * Extrai itens direto da DESCRIÇÃO textual ("90 g de banana, 55 g de pão
 * francês, ..."). O modelo é inconstante em enumerar (largava o pão francês);
 * quando o coach digita a gramagem, o código lista TODOS os itens de forma
 * determinística. Casa "N g|gramas|ml de <alimento>" até a próxima vírgula.
 * Descrição livre (sem gramas) → [] e o caller cai no que o modelo devolveu.
 */
export function parseDescricao(desc: unknown): SanityItem[] {
  if (typeof desc !== 'string') return [];
  const out: SanityItem[] = [];
  const re =
    /(\d+(?:[.,]\d+)?)\s*(?:g|gramas?|ml)\b\s*(?:de\s+)?([^,;.]+?)(?=\s*(?:[,;.]|$))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc)) !== null) {
    const qty = coerceNumero(m[1]);
    const name = m[2].trim().replace(/\s+/g, ' ');
    if (qty !== undefined && name) out.push({ name, qty_g: qty });
  }
  return out;
}

/**
 * Preenche kcal/macros ausentes dos itens da descrição a partir dos itens do
 * modelo (casados por nome). Serve pros alimentos fora da referência (ex:
 * granola): a gramagem vem da descrição, o kcal aproveita a estimativa do
 * modelo quando ele citou aquele item. Sem match, fica como está.
 */
export function mergeKcalDoModelo(
  base: SanityItem[],
  modelo: SanityItem[],
): SanityItem[] {
  return base.map((b) => {
    if (b.kcal !== undefined) return b;
    const alvo = normalizarNome(b.name);
    const m = modelo.find((mi) => {
      const n = normalizarNome(mi.name);
      return n === alvo || n.includes(alvo) || alvo.includes(n);
    });
    if (m && m.kcal !== undefined) {
      return {
        ...b,
        kcal: m.kcal,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fats_g: m.fats_g,
      };
    }
    return b;
  });
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
