import { supabase } from './supabase';
import { parseNeedsUpgrade } from '@/lib/needsUpgrade';
import { parseDailyLimit } from '@/lib/dailyLimit';
import {
  coerceNumero,
  extractMacrosFromText,
  normalizeSanityItems,
  type SanityCheckItem,
} from '@/lib/sanityParse';

export type { SanityCheckItem };

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const FN_URL = `${SUPABASE_URL}/functions/v1/chat-ai`;

export type SanityCheckResult = {
  /** Itens da refeição. Objetos desde o sanity itemizado (SAN-07); a
   *  normalização em `@/lib/sanityItems` cobre a resposta da function antiga. */
  items?: SanityCheckItem[];
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
 * Tenta achar macros mesmo que o modelo tenha posto fora do objeto "macros"
 * — em padroes tipo {"kcal":N, "protein_g":N, ...} no top-level, ou strings.
 * Garante que ao menos kcal exista — sem kcal nao adianta retornar.
 */
function extractMacros(parsed: Record<string, unknown>): SanityCheckResult['macros'] | undefined {
  const inner = (parsed.macros ?? parsed) as Record<string, unknown>;
  const kcal = coerceNumero(inner.kcal ?? inner.calories ?? inner.calorias);
  const protein_g = coerceNumero(inner.protein_g ?? inner.protein ?? inner.proteina_g ?? inner.proteina);
  const carbs_g = coerceNumero(inner.carbs_g ?? inner.carbs ?? inner.carbo_g ?? inner.carboidrato_g ?? inner.carboidratos);
  const fats_g = coerceNumero(inner.fats_g ?? inner.fats ?? inner.gordura_g ?? inner.gorduras);
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
  const envelopeItems = (data as { sanity?: { items?: unknown } })?.sanity?.items;

  // Defensive: se o JSON.parse falhou (modelo retornou JSON invalido,
  // ex: chave malformada por instrucoes conflitantes), ainda assim
  // extraimos macros direto do texto bruto via regex como ultimo recurso.
  if (!parsed) {
    const fallbackMacros = extractMacrosFromText(rawText);
    return {
      feedback: rawText,
      items: normalizeSanityItems(envelopeItems, undefined),
      macros: fallbackMacros,
      raw: rawText,
    };
  }
  // Mesmo com JSON parseado, o modelo pode ter colocado macros como string
  // ou fora do objeto "macros". coerceNumber + extractMacros normalizam.
  const macros = extractMacros(parsed as Record<string, unknown>);
  return {
    ...(parsed as Partial<SanityCheckResult>),
    items: normalizeSanityItems(
      envelopeItems,
      (parsed as { items?: unknown }).items,
    ),
    macros,
    raw: rawText,
  } as SanityCheckResult;
}
