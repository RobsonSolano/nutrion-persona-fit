// Regras que mudam entre App Store e Play Store — módulo puro (sem react-native/expo):
// quem chama passa `Platform.OS`. Tudo que não é 'ios' é tratado como Google.

import { PLAY_SUBSCRIPTIONS_URL } from './playStore';

export type StoreKind = 'apple' | 'google';

/** Gerenciar assinaturas na Apple. */
export const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

/** Página do app na App Store (esquema nativo e fallback web). */
export const APPLE_APP_URL = 'itms-apps://apps.apple.com/';
export const APPLE_WEB_URL = 'https://apps.apple.com/';

export function storeKind(os: string): StoreKind {
  return os === 'ios' ? 'apple' : 'google';
}

export function storeName(os: string): 'App Store' | 'Play Store' {
  return storeKind(os) === 'apple' ? 'App Store' : 'Play Store';
}

export function subscriptionsUrl(os: string): string {
  return storeKind(os) === 'apple' ? APPLE_SUBSCRIPTIONS_URL : PLAY_SUBSCRIPTIONS_URL;
}

/**
 * Chave pública do RevenueCat da plataforma. Recebe os valores já lidos (o Expo só embute
 * `process.env.EXPO_PUBLIC_*` com acesso literal, então o chamador lê as duas). Web/outros
 * e string vazia → undefined.
 */
export function rcApiKeyFor(
  os: string,
  keys: { ios?: string; android?: string },
): string | undefined {
  // Diferente de storeKind (que trata web como Google): sem loja nativa não há chave.
  const key = { ios: keys.ios, android: keys.android }[os as 'ios' | 'android'];
  return key || undefined;
}

/**
 * Troca de plano com opções do Google (produto antigo + proração) só no Android. No iOS a Apple
 * faz a troca dentro do grupo de assinatura, sem opções na compra.
 */
export function usesGoogleProductChange(
  os: string,
  oldProductId?: string | null,
): oldProductId is string {
  return os === 'android' && !!oldProductId;
}
