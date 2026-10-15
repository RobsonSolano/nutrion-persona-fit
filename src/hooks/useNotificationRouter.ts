import { useEffect, useRef } from 'react';
import { useRouter, type Href } from 'expo-router';
import { IS_EXPO_GO } from '@/lib/platform';
import { useSessionStore } from '@/stores/useSessionStore';
import type * as NotificationsType from 'expo-notifications';
import { checkMySuspension } from '@/services/suspension';

type PushPayload = {
  event?: string;
  request_id?: string;
  message_id?: string;
  type?: string;
};

// Lazy require: em Expo Go o módulo warna no import top-level.
// Carregamos só fora do Expo Go.
function loadNotifications(): typeof NotificationsType | null {
  if (IS_EXPO_GO) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

/**
 * Faz o roteamento quando o user toca numa push notification:
 * - Cold start (app aberto pela notificação): consome o último
 *   response uma vez via consumedRef.
 * - Foreground/background tap: listener contínuo enquanto o hook
 *   está montado.
 *
 * Só navega se o user estiver autenticado — caso contrário a push
 * só abre o app e o gate de auth cuida do fluxo normal.
 *
 * Pequeno delay antes de navegar pra dar tempo do bootstrap (auth +
 * profile + gate de role) terminar antes de empurrar a rota — senão
 * o gate pode redirecionar por cima da nossa navegação.
 */
export function useNotificationRouter() {
  const router = useRouter();
  const isAuthenticated = useSessionStore((s) => !!s.session);
  const consumedColdStart = useRef(false);

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    if (!isAuthenticated) return;

    function navigate(payload: PushPayload | null | undefined) {
      if (!payload) return;
      let target: Href | null = null;
      if (payload.type === 'active_workout') {
        // Notificação local do cronômetro (ongoing ou aviso de 2h).
        target = '/treino-ativo' as Href;
      } else if (payload.event === 'new_request') {
        target = '/(coach)/solicitacoes' as Href;
      } else if (payload.event === 'request_response') {
        target = '/solicitacoes' as Href;
      } else if (payload.event === 'plan_updated') {
        // Aluno foi notificado que o plano dele foi atualizado.
        target = '/(tabs)/treino' as Href;
      } else if (payload.event === 'support_reply') {
        // Equipe respondeu uma mensagem de suporte/sugestão.
        target = (
          payload.message_id ? `/suporte/${payload.message_id}` : '/suporte'
        ) as Href;
      } else if (payload.event === 'inactivity_reminder') {
        // Lembrete de log — leva pro log rápido.
        target = '/log' as Href;
      }
      if (!target) return;
      // Pequeno delay deixa o gate de role/onboarding finalizar antes.
      // Aluno suspenso não pode furar o bloqueio via deep-link de push:
      // checa (e auto-cura) a suspensão antes de rotear. checkMySuspension
      // retorna false rápido pra não-alunos. Fail-open em erro pra não
      // quebrar notificações de todo mundo (o cold-open ainda é barrado
      // pelo gate do (tabs)/_layout).
      setTimeout(() => {
        void checkMySuspension()
          .then((suspended) =>
            router.push((suspended ? '/suspended' : target!) as Href),
          )
          .catch(() => router.push(target!));
      }, 500);
    }

    // Cold start: app aberto a partir do tap na notificação.
    if (!consumedColdStart.current) {
      consumedColdStart.current = true;
      void Notifications.getLastNotificationResponseAsync().then((res) => {
        if (res) {
          navigate(
            res.notification.request.content.data as PushPayload | null,
          );
        }
      });
    }

    // Tap enquanto app está em foreground/background.
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      navigate(res.notification.request.content.data as PushPayload | null);
    });

    return () => sub.remove();
  }, [router, isAuthenticated]);
}
