/**
 * Regras de login social por plataforma (puro, sem react-native/expo-*).
 * No iPhone não há login com Google nesta versão (sem login social a diretriz
 * 4.8 não exige Sign in with Apple); o Android segue como sempre.
 */

/**
 * Verificado no Supabase local (2026-11-09): conta criada só com Google
 * consegue criar senha via recuperação (OTP + updateUser) e entra com o mesmo id.
 */
export const IOS_PASSWORD_HINT_ENABLED = true;

export type LoginOptions = {
  showGoogle: boolean;
  showExpoGoGoogleTip: boolean;
  showIosPasswordHint: boolean;
};

export function loginOptions(os: string, isExpoGo: boolean): LoginOptions {
  const isIos = os === 'ios';
  return {
    showGoogle: !isIos && !isExpoGo,
    showExpoGoGoogleTip: !isIos && isExpoGo,
    showIosPasswordHint: isIos && IOS_PASSWORD_HINT_ENABLED,
  };
}
