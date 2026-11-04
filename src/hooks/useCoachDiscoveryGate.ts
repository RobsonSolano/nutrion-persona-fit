// Regra única: "comum sem Premium não acessa a descoberta de professores".
// O servidor é a autoridade (PT402); aqui só evitamos a chamada e levamos ao paywall.
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useProfile } from './useProfile';
import { useEntitlement } from './useEntitlement';
import { tierAtLeast } from '@/lib/tier';
import { NeedsUpgradeError } from '@/lib/needsUpgrade';

/** true quando o usuário é comum, o entitlement já resolveu e o tier é menor que Premium. */
export function useCoachDiscoveryLocked() {
  const profileQ = useProfile();
  const entQ = useEntitlement();
  return (
    profileQ.data?.role === 'comum' &&
    !!entQ.data &&
    !tierAtLeast(entQ.data.tier, 'premium')
  );
}

/** Leva ao paywall (replace: voltar não cai numa tela vazia) se bloqueado ou se a RPC negou. */
export function useCoachDiscoveryRedirect(locked: boolean, error: unknown) {
  const router = useRouter();
  const precisaUpgrade = locked || error instanceof NeedsUpgradeError;
  useEffect(() => {
    if (precisaUpgrade) {
      router.replace({ pathname: '/paywall', params: { feature: 'coach_discovery' } });
    }
  }, [precisaUpgrade, router]);
}
