// Atualização do binário: fluxo nativo da Play (In-App Updates, modo
// imediato) quando der; senão, a página do app na loja.
// Lógica pura — o acesso ao módulo nativo fica no UpdateGate.

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
