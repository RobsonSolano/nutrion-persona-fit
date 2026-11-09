// Atualização do binário: fluxo nativo da Play (In-App Updates, modo
// imediato) quando der; senão, a página do app na loja.
// Lógica pura — o acesso ao módulo nativo fica no UpdateGate.

import { PLAY_APP_URL, PLAY_WEB_URL } from './playStore';
import type { AppConfig } from '../services/appConfig';
import { APPLE_APP_URL, APPLE_WEB_URL, storeKind, storeName } from './store';

/** O que importa da resposta de checkForUpdate() do expo-in-app-updates. */
export type PlayUpdateInfo = {
  updateAvailable: boolean;
  immediateAllowed?: boolean;
};

/**
 * 'native' só quando a Play já conhece a versão nova e permite o modo
 * imediato. Sem módulo (dev client antigo, instalado fora da Play) ou sem
 * resposta → 'store'.
 */
export function chooseUpdatePath(info: PlayUpdateInfo | null): 'native' | 'store' {
  return info?.updateAvailable && info.immediateAllowed ? 'native' : 'store';
}

/** Endereços de loja vindos de app_config. */
export type StoreUrls = Pick<AppConfig, 'android_store_url' | 'ios_store_url'>;

/**
 * Para onde "Atualizar" aponta: `url` é a primeira tentativa, `fallback` a
 * página web se ela falhar. No iOS nunca devolve endereço da Play ([IOS]-09).
 */
export function storeUpdateTarget(
  os: string,
  urls: Partial<StoreUrls> | null | undefined,
): { url: string; fallback: string } {
  if (storeKind(os) === 'apple') {
    return { url: urls?.ios_store_url || APPLE_APP_URL, fallback: APPLE_WEB_URL };
  }
  return { url: urls?.android_store_url || PLAY_APP_URL, fallback: PLAY_WEB_URL };
}

/** Texto padrão do aviso (o do banco, quando existe, tem prioridade no chamador). */
export function defaultUpdateMessage(os: string, blocked: boolean): string {
  const loja = storeName(os);
  return blocked
    ? `Esta versão do app não é mais suportada. Atualize na ${loja} pra continuar.`
    : `Tem uma versão nova do app na ${loja}, com melhorias e correções.`;
}
