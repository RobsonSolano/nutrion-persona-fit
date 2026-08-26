// Métricas de exercício de cárdio (spec CAR-01..CAR-08). Lógica pura → testável
// sem RN, no padrão de `otaPolicy.ts` e `sanityParse.ts`.
//
// Cárdio usava séries/repetições/carga, que não se aplicam a uma esteira. O tipo
// vem do GRUPO do exercício (`cardio`), não da modalidade da rotina: os 10
// exercícios do grupo cardio estão todos com `modality='musculacao'` (a coluna
// nasceu depois deles), e uma rotina de musculação com 10 min de esteira no fim
// é caso comum.

import type { MetricType } from '@/types/database';

export type { MetricType };

export type CardioMetrics = {
  distance_min_m?: number | null;
  distance_max_m?: number | null;
  /** Duração em MINUTOS. Nome herdado do schema — não é "mínimo". */
  duration_min?: number | null;
  cadence_rpm?: number | null;
};

const GRUPO_CARDIO = 'cardio';

/**
 * Tipo de métrica a partir do slug do grupo do exercício. Default `strength`
 * para grupo ausente ou desconhecido — errar para o formato antigo é inofensivo,
 * errar para cárdio esconderia séries/carga de um exercício de força.
 */
export function metricTypeFromGroup(
  groupSlug: string | null | undefined,
): MetricType {
  return groupSlug?.trim().toLowerCase() === GRUPO_CARDIO ? 'cardio' : 'strength';
}

/** Número em pt-BR com no máximo uma casa: 3 → "3", 2.5 → "2,5", 0.8 → "0,8". */
function numeroPtBr(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

/**
 * Minutos → "45 min", "1h", "2h30". O schema guarda minutos (unidade canônica),
 * mas ninguém pensa "150 minutos" — pensa "duas e meia".
 */
export function formatDuracao(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Separa o total pro form preencher os campos de hora e minuto. */
export function minutosParaHoraMin(total: number | null | undefined): {
  horas: number | null;
  minutos: number | null;
} {
  if (!preenchido(total)) return { horas: null, minutos: null };
  return { horas: Math.floor(total / 60), minutos: total % 60 };
}

/** Compõe o valor que vai pro banco. Zero em ambos = não informado. */
export function horaMinParaMinutos(
  horas: number | null | undefined,
  minutos: number | null | undefined,
): number | null {
  const total = (horas ?? 0) * 60 + (minutos ?? 0);
  return total > 0 ? total : null;
}

/** Metros → "800 m", "3 km", "2,5 km". */
function formatarDistancia(metros: number): string {
  return metros < 1000 ? `${metros} m` : `${numeroPtBr(metros / 1000)} km`;
}

/** Só considera valor presente e maior que zero — zero é "não informado" aqui. */
function preenchido(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

export type ChipMetrica = {
  /** Quem consome escolhe o ícone por aqui, sem inspecionar o texto. */
  kind: 'distance' | 'duration' | 'cadence';
  label: string;
};

/**
 * Chips para exibir ao aluno, na ordem distância → tempo → cadência.
 * Campo ausente ou zerado é omitido em vez de virar "0 km".
 */
export function formatCardioMetrics(m: CardioMetrics): ChipMetrica[] {
  const chips: ChipMetrica[] = [];

  const min = preenchido(m.distance_min_m) ? m.distance_min_m : null;
  const max = preenchido(m.distance_max_m) ? m.distance_max_m : null;
  if (min !== null && max !== null) {
    // Mesma unidade nos dois lados: "100–400 m", "3–5 km".
    const emKm = min >= 1000 || max >= 1000;
    // Unidade escolhida UMA vez para a faixa inteira e anexada no fim. Formatar
    // cada lado sozinho produziria "800 m–3 km" quando a faixa cruza 1 km.
    chips.push({
      kind: 'distance',
      label: emKm
        ? `${numeroPtBr(min / 1000)}–${numeroPtBr(max / 1000)} km`
        : `${min}–${max} m`,
    });
  } else if (min !== null) {
    chips.push({ kind: 'distance', label: formatarDistancia(min) });
  } else if (max !== null) {
    chips.push({ kind: 'distance', label: formatarDistancia(max) });
  }

  if (preenchido(m.duration_min)) {
    chips.push({ kind: 'duration', label: formatDuracao(m.duration_min) });
  }
  if (preenchido(m.cadence_rpm)) {
    chips.push({ kind: 'cadence', label: `${m.cadence_rpm} RPM` });
  }

  return chips;
}

/**
 * Valida antes de salvar. Devolve a mensagem pro usuário, ou null se está ok.
 * Todos os campos são opcionais — esteira usa distância e tempo, bike usa RPM.
 */
// Tetos plausíveis, para o valor absurdo morrer aqui com mensagem clara em vez
// de estourar o int4 no INSERT e virar "não consegui salvar".
const MAX_DISTANCIA_M = 1_000_000; // 1.000 km — cobre ultramaratona com folga
const MAX_RPM = 300;
const MAX_MINUTOS = 1440; // 24 h

export function validateCardioMetrics(m: CardioMetrics): string | null {
  const negativo = (v: number | null | undefined) =>
    typeof v === 'number' && v < 0;

  if (negativo(m.distance_min_m) || negativo(m.distance_max_m)) {
    return 'A distância não pode ser negativa.';
  }
  if (negativo(m.duration_min)) return 'O tempo não pode ser negativo.';
  if (negativo(m.cadence_rpm)) return 'A cadência não pode ser negativa.';

  const acima = (v: number | null | undefined, teto: number) =>
    typeof v === 'number' && v > teto;

  if (acima(m.distance_min_m, MAX_DISTANCIA_M) || acima(m.distance_max_m, MAX_DISTANCIA_M)) {
    return `A distância parece alta demais (máximo ${MAX_DISTANCIA_M / 1000} km).`;
  }
  if (acima(m.cadence_rpm, MAX_RPM)) {
    return `A cadência parece alta demais (máximo ${MAX_RPM} RPM).`;
  }
  if (acima(m.duration_min, MAX_MINUTOS)) {
    return `O tempo parece longo demais (máximo ${MAX_MINUTOS} minutos).`;
  }

  // Zero é "não informado" aqui, igual em `preenchido()` — comparar faixa com
  // zero acusaria "máxima menor que a mínima" para um campo que ficou vazio.
  if (
    preenchido(m.distance_min_m) &&
    preenchido(m.distance_max_m) &&
    m.distance_max_m < m.distance_min_m
  ) {
    return 'A distância máxima não pode ser menor que a mínima.';
  }

  return null;
}
