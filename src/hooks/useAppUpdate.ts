import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { getAppConfig } from '@/services/appConfig';
import { updateRequirement } from '@/lib/appVersion';

/**
 * Versão do binário instalado. runtimeVersion vem do binário e não muda com
 * OTA — mas só é "1.4.0" porque a política de runtime é appVersion
 * (app.config.ts). Se virar fingerprint, vira hash, e updateRequirement
 * passa a tratar como desconhecida (nunca bloqueia). Em dev o expo-updates
 * fica desligado e cai na versão do app.config.
 */
const installedVersion: string | null =
  Updates.runtimeVersion ?? Constants.expoConfig?.version ?? null;

/**
 * Situação do app frente à app_config: 'blocked' | 'recommended' | 'none'.
 * Erro ou sem rede → 'none': a checagem nunca impede o uso por falha dela
 * ([ATU]-06).
 */
export function useAppUpdate() {
  const q = useQuery({
    queryKey: ['app_config'],
    queryFn: getAppConfig,
    staleTime: 60 * 60_000,
  });
  const requirement = q.data
    ? updateRequirement(installedVersion, q.data.min_version, q.data.recommended_version)
    : 'none';
  return { requirement, blocked: requirement === 'blocked', config: q.data ?? null };
}
