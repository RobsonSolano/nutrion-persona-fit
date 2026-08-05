import { supabase } from './supabase';
import { parseNeedsUpgrade } from '@/lib/needsUpgrade';
import { parseDailyLimit } from '@/lib/dailyLimit';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const FN_URL = `${SUPABASE_URL}/functions/v1/chat-ai`;

export type SanityCheckResult = {
  items?: string[];
  consistency?: 'ok' | 'diverge' | string;
  macros?: {
    kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fats_g?: number;
  };
  feedback?: string;
  raw?: string; // resposta crua caso parse falhe
};

export type SanityCheckRequest = {
  description: string;
  imageBase64: string;
  imageMime?: 'image/jpeg' | 'image/png' | 'image/webp';
  scaleWeightG?: number;
};

function parseJsonFromText(text: string): Partial<SanityCheckResult> | null {
  // tenta extrair JSON mesmo se o modelo embrulhou em ```json ... ```
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // às vezes o JSON vem dentro de texto — tenta pegar o primeiro bloco { ... }
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Ultimo recurso quando JSON.parse falha completo — extrai numeros direto
 * do texto bruto procurando padroes "kcal": N. Acontece quando o Llama
 * inclui linha solta no top-level (ex: '"Referencia utilizada: TACO"' sem
 * valor) que invalida o JSON inteiro.
 */
function extractMacrosFromRaw(raw: string): SanityCheckResult['macros'] | undefined {
  const grab = (key: string): number | undefined => {
    // procura "key": N ou "key":N (com aspas opcionais e numero possivelmente em string)
    const re = new RegExp(`"${key}"\\s*:\\s*"?\\s*(-?\\d+(?:[.,]\\d+)?)`, 'i');
    const m = raw.match(re);
    if (!m) return undefined;
    const n = Number(m[1].replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const kcal = grab('kcal') ?? grab('calories') ?? grab('calorias');
  const protein_g = grab('protein_g') ?? grab('protein') ?? grab('proteina_g') ?? grab('proteina');
  const carbs_g = grab('carbs_g') ?? grab('carbs') ?? grab('carbo_g') ?? grab('carboidratos');
  const fats_g = grab('fats_g') ?? grab('fats') ?? grab('gordura_g') ?? grab('gorduras');
  if (kcal == null && protein_g == null && carbs_g == null && fats_g == null) {
    return undefined;
  }
  return { kcal, protein_g, carbs_g, fats_g };
}

/**
 * Extrai um numero de um valor que a IA pode ter mandado como number, string
 * ("450" ou "450 kcal"), ou null. Retorna undefined se nao conseguir.
 */
function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0].replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Tenta achar macros mesmo que o modelo tenha posto fora do objeto "macros"
 * — em padroes tipo {"kcal":N, "protein_g":N, ...} no top-level, ou strings.
 * Garante que ao menos kcal exista — sem kcal nao adianta retornar.
 */
function extractMacros(parsed: Record<string, unknown>): SanityCheckResult['macros'] | undefined {
  const inner = (parsed.macros ?? parsed) as Record<string, unknown>;
  const kcal = coerceNumber(inner.kcal ?? inner.calories ?? inner.calorias);
  const protein_g = coerceNumber(inner.protein_g ?? inner.protein ?? inner.proteina_g ?? inner.proteina);
  const carbs_g = coerceNumber(inner.carbs_g ?? inner.carbs ?? inner.carbo_g ?? inner.carboidrato_g ?? inner.carboidratos);
  const fats_g = coerceNumber(inner.fats_g ?? inner.fats ?? inner.gordura_g ?? inner.gorduras);
  if (kcal == null && protein_g == null && carbs_g == null && fats_g == null) {
    return undefined;
  }
  return { kcal, protein_g, carbs_g, fats_g };
}

export async function runSanityCheck(
  params: SanityCheckRequest,
): Promise<SanityCheckResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error('Sessão expirada. Faça login de novo.');
  }

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({
      message: params.description,
      mode: 'sanity_check',
      imageBase64: params.imageBase64,
      imageMime: params.imageMime ?? 'image/jpeg',
      scaleWeightG: params.scaleWeightG,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // Gating do billing-core: 402 needs_upgrade → erro tipado pro paywall.
    const nu = parseNeedsUpgrade(res.status, text);
    if (nu) throw nu;
    // Cota diária: 429 daily_limit → erro tipado pro aviso amigável (não erro genérico).
    const dl = parseDailyLimit(res.status, text);
    if (dl) throw dl;
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.detail ?? parsed?.error ?? text;
    } catch {
      // raw
    }
    if (res.status === 429) throw new Error(String(detail));
    if (res.status === 413) {
      throw new Error(
        'Essa foto ainda está grande demais pra IA processar. Tenta uma foto menor ou mais simples.',
      );
    }
    if (res.status === 400) {
      throw new Error(
        'A IA não conseguiu ler essa foto. Tenta outra imagem mais nítida do prato.',
      );
    }
    throw new Error(`${res.status} · ${detail}`);
  }

  const data = await res.json();
  const rawText: string = data?.text ?? '';
  const parsed = parseJsonFromText(rawText);

  // Defensive: se o JSON.parse falhou (modelo retornou JSON invalido,
  // ex: chave malformada por instrucoes conflitantes), ainda assim
  // extraimos macros direto do texto bruto via regex como ultimo recurso.
  if (!parsed) {
    const fallbackMacros = extractMacrosFromRaw(rawText);
    return {
      feedback: rawText,
      macros: fallbackMacros,
      raw: rawText,
    };
  }
  // Mesmo com JSON parseado, o modelo pode ter colocado macros como string
  // ou fora do objeto "macros". coerceNumber + extractMacros normalizam.
  const macros = extractMacros(parsed as Record<string, unknown>);
  return {
    ...(parsed as Partial<SanityCheckResult>),
    macros,
    raw: rawText,
  } as SanityCheckResult;
}
