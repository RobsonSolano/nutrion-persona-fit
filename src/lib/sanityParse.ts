// Parsing das respostas do sanity check no lado do app: itens da refeição e
// extração de macros de texto quebrado. Lógica pura → testável sem RN.
//
// Compatibilidade nos DOIS sentidos, porque a edge function e o app são
// publicados por caminhos independentes (`fn:deploy` vs. OTA/store):
//  - function nova + app novo  → objetos ricos vêm no envelope `sanity.items`;
//  - function ANTIGA + app novo → envelope não existe, e os itens só existem
//    como strings dentro do `text`; convertemos pra `{ name }`;
//  - function nova + app ANTIGO → o `text` segue trazendo strings, então o app
//    velho renderiza como sempre (isso é resolvido no servidor, não aqui).

export type SanityCheckItem = {
  name: string;
  qty_g?: number;
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
};

// DUPLICAÇÃO INTENCIONAL: espelha `supabase/functions/chat-ai/sanityMath.ts`.
// Ver a nota lá — a edge function roda em Deno e não importa de `src/`.
const CAMPOS_NUM = ['qty_g', 'kcal', 'protein_g', 'carbs_g', 'fats_g'] as const;

/**
 * Coerção única de número para todo o fluxo de sanity check no app. Rejeita
 * negativo de propósito: `food_logs` tem `check (calories >= 0)`, então um
 * "-50 kcal" alucinado estouraria no INSERT — melhor virar campo vazio.
 */
export function coerceNumero(valor: unknown): number | undefined {
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

function normalizarUm(bruto: unknown): SanityCheckItem | null {
  if (typeof bruto === 'string') {
    const name = bruto.trim();
    return name ? { name } : null;
  }
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null;

  const obj = bruto as Record<string, unknown>;
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) return null;

  const item: SanityCheckItem = { name };
  for (const campo of CAMPOS_NUM) {
    const n = coerceNumero(obj[campo]);
    if (n !== undefined) item[campo] = n;
  }
  return item;
}

function normalizarLista(raw: unknown): SanityCheckItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizarUm)
    .filter((i): i is SanityCheckItem => i !== null);
}

/**
 * Itens finais a exibir. Prefere o envelope (tem gramagem e macros por item);
 * cai pras strings do `text` quando a function ainda é a antiga.
 */
export function normalizeSanityItems(
  itensDoEnvelope: unknown,
  itensDoTexto: unknown,
): SanityCheckItem[] {
  const ricos = normalizarLista(itensDoEnvelope);
  if (ricos.length > 0) return ricos;
  return normalizarLista(itensDoTexto);
}

export type MacrosDoTexto = {
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
};

/**
 * Último recurso quando o `JSON.parse` falha nos dois lados (servidor e
 * cliente): garimpa os números direto do texto com regex.
 *
 * Cuidado que justifica esta função existir separada: desde o sanity itemizado,
 * CADA item tem seu próprio `kcal` — e `items` vem ANTES de `macros` no schema.
 * Uma busca ingênua pelo primeiro `"kcal"` pegaria o do primeiro item (ex. 195
 * do arroz) achando que é o total do prato (507). Por isso começamos a busca a
 * partir do bloco `"macros"` quando ele existe.
 */
export function extractMacrosFromText(raw: string): MacrosDoTexto | undefined {
  const idx = raw.indexOf('"macros"');
  const trecho = idx >= 0 ? raw.slice(idx) : raw;

  const grab = (chave: string): number | undefined => {
    const re = new RegExp(`"${chave}"\\s*:\\s*"?\\s*(-?\\d+(?:[.,]\\d+)?)`, 'i');
    const m = trecho.match(re);
    return m ? coerceNumero(m[1]) : undefined;
  };

  // Aliases: o modelo às vezes responde com os nomes em português ou com
  // "calories"/"protein" em vez dos campos do schema.
  const kcal = grab('kcal') ?? grab('calories') ?? grab('calorias');
  if (kcal === undefined) return undefined;

  return {
    kcal,
    protein_g: grab('protein_g') ?? grab('protein') ?? grab('proteina_g') ?? grab('proteina'),
    carbs_g:
      grab('carbs_g') ?? grab('carbs') ?? grab('carbo_g') ?? grab('carboidrato_g') ?? grab('carboidratos'),
    fats_g: grab('fats_g') ?? grab('fats') ?? grab('gordura_g') ?? grab('gorduras'),
  };
}
