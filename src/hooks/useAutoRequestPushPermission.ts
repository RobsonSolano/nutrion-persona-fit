import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import {
  hasPushPermission,
  registerForPushNotifications,
} from '@/services/pushNotifications';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';

const STORAGE_KEY = 'push_permission_last_asked_at';
const COOLDOWN_DAYS_AFTER_DENY = 7;

/**
 * Pede permissão de push automaticamente no primeiro login após o
 * onboarding. Tenta uma vez por sessão (ref guard), e respeita
 * cooldown de 7 dias se o user negou no passado.
 *
 * Silencioso em erro (não mostra Alert) — se falhar, o user ainda
 * tem o botão "Ativar push" no Perfil como fallback.
 *
 * Deve ser chamado num layout alto-nível autenticado (ex:
 * `app/(tabs)/_layout.tsx`) — depois do gate de auth/onboarding.
 */
export function useAutoRequestPushPermission() {
  const { user } = useAuth();
  const profileQ = useProfile();
  const qc = useQueryClient();
  const triedThisSessionRef = useRef(false);

  useEffect(() => {
    // Aguarda profile carregar pra saber se já tem token
    if (!user?.id || profileQ.isLoading || !profileQ.data) return;

    // Se já tem token, não precisa pedir
    if (profileQ.data.expo_push_token) return;

    // Guard de sessão: só tenta 1x por execução do app
    if (triedThisSessionRef.current) return;
    triedThisSessionRef.current = true;

    void (async () => {
      // Permissão já concedida e token ausente: re-registra DIRETO, sem passar
      // pelo cooldown. Nenhum prompt aparece nesse caminho — o cooldown existe
      // pra não ficar perguntando a quem recusou, não pra impedir que o app
      // recupere um token que ele mesmo apagou no logout.
      //
      // Era por aqui que a base vazava: 25 dos 47 perfis estavam sem token em
      // 2026-10-01, a maioria com onboarding concluído. Quem aceitou um dia,
      // saiu da conta e voltou dentro de 7 dias ficava mudo sem motivo.
      if (await hasPushPermission()) {
        const r = await registerForPushNotifications();
        if (r.ok && user.id) {
          await qc.invalidateQueries({ queryKey: queryKeys.profile(user.id) });
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
        return;
      }

      // Daqui pra baixo o prompt do SO VAI aparecer — aí sim respeita cooldown.
      const lastAskedRaw = await AsyncStorage.getItem(STORAGE_KEY);
      const lastAsked = lastAskedRaw ? Number(lastAskedRaw) : 0;
      const cooldownMs = COOLDOWN_DAYS_AFTER_DENY * 24 * 60 * 60 * 1000;
      if (lastAsked && Date.now() - lastAsked < cooldownMs) return;

      // Marca que pediu agora — antes mesmo da resposta, pra evitar
      // pedir de novo se o user cancelar o prompt do SO
      await AsyncStorage.setItem(STORAGE_KEY, String(Date.now()));

      const result = await registerForPushNotifications();
      if (result.ok && user.id) {
        // Aceitou: invalida profile pra refletir o token novo
        await qc.invalidateQueries({ queryKey: queryKeys.profile(user.id) });
        // Limpa flag: nunca mais precisamos pedir
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
      // Se negou/falhou: flag mantida, próxima tentativa só após cooldown
    })();
  }, [user?.id, profileQ.isLoading, profileQ.data, qc]);
}
