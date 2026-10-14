// Versão do app instalado × versões configuradas no banco (app_config).
// Lógica pura, testável sem expo-updates.

export type UpdateRequirement = 'blocked' | 'recommended' | 'none';

function parts(v: string): number[] {
  // "1.5.0-beta" → [1, 5, 0]: o sufixo não entra na comparação.
  return v
    .trim()
    .split(/[^0-9.]/)[0]
    .split('.')
    .map((p) => Number.parseInt(p, 10) || 0);
}

/** -1 se a < b, 0 se iguais, 1 se a > b — numérico por partes ("1.10" > "1.9"). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

const configurada = (v: string | null | undefined): v is string => !!v && v.trim() !== '';

/** "1.4.0", "1.5" ou "2" — e não um hash de fingerprint nem texto livre. */
const pareceVersao = (v: string | null | undefined): v is string =>
  !!v && /^\d+(\.\d+)*$/.test(v.trim());

/**
 * Abaixo da mínima bloqueia; abaixo da recomendada sugere; o resto passa.
 * Sem versão instalada reconhecível, nunca bloqueia — não dá pra afirmar que
 * está desatualizado (ex: se a política de runtime virar fingerprint, a
 * versão instalada vira hash).
 */
export function updateRequirement(
  installed: string | null | undefined,
  minVersion: string | null | undefined,
  recommendedVersion: string | null | undefined,
): UpdateRequirement {
  if (!pareceVersao(installed)) return 'none';
  if (configurada(minVersion) && compareVersions(installed, minVersion) < 0) return 'blocked';
  if (configurada(recommendedVersion) && compareVersions(installed, recommendedVersion) < 0) {
    return 'recommended';
  }
  return 'none';
}
