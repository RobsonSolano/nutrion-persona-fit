import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shouldPromptForUpdate } from '@/lib/otaPolicy';
import { parseReleaseNotes, type ReleaseNotes } from '@/lib/otaReleaseNotes';

const DISMISS_KEY = 'ota:update-dismissed-at';
const FIRST_LAUNCH_KEY = 'ota:first-launch-done';
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

type Phase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'applying'
  | 'unavailable'
  | 'error';

/**
 * Verifica updates OTA (expo-updates) no mount.
 * Se há update disponível, baixa em background e expõe `isReady=true`
 * para o consumidor renderizar um aviso. `apply()` recarrega o app.
 *
 * Anti-spam: se o usuário clicou "Mais tarde", não pergunta de novo
 * por 24h. A próxima checagem reabre o fluxo natural.
 *
 * Em Expo Go / dev (`Updates.isEnabled === false`) o hook é no-op.
 */
export function useOtaUpdate() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotes | null>(null);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    let cancelled = false;

    (async () => {
      try {
        const dismissedAt = await AsyncStorage.getItem(DISMISS_KEY);
        if (
          dismissedAt &&
          Date.now() - Number(dismissedAt) < DISMISS_WINDOW_MS
        ) {
          return;
        }

        // Primeira execução após uma instalação limpa? O binário da loja fica
        // atrás do topo do canal OTA, então há update logo de cara — mas não
        // interrompemos quem acabou de instalar com um modal de "atualizar".
        // Marcamos o flag já aqui pra essa condição valer só uma vez.
        const firstLaunchDone = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
        const isFirstLaunch = !firstLaunchDone;
        if (isFirstLaunch) {
          await AsyncStorage.setItem(FIRST_LAUNCH_KEY, String(Date.now()));
        }

        setPhase('checking');
        const check = await Updates.checkForUpdateAsync();
        if (cancelled) return;
        if (!check.isAvailable) {
          setPhase('unavailable');
          return;
        }

        // As notas viajam no manifest do update DISPONÍVEL, então quem exibe é
        // o bundle atual. Consequência: o primeiro update que trouxer esta
        // feature ainda é anunciado pelo modal genérico — a partir do seguinte
        // as notas aparecem.
        setReleaseNotes(parseReleaseNotes(check.manifest));

        setPhase('downloading');
        await Updates.fetchUpdateAsync();
        if (cancelled) return;

        // Baixado. Execução normal → sobe o modal. Primeira execução → fica
        // silencioso: o expo aplica o update no próximo cold start sozinho.
        setPhase(shouldPromptForUpdate({ isFirstLaunch }) ? 'ready' : 'idle');
      } catch (err) {
        if (cancelled) return;
        setPhase('error');
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao verificar atualização',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function apply() {
    setPhase('applying');
    try {
      await Updates.reloadAsync();
    } catch (err) {
      setPhase('error');
      setError(
        err instanceof Error ? err.message : 'Erro ao aplicar atualização',
      );
    }
  }

  async function dismiss() {
    await AsyncStorage.setItem(DISMISS_KEY, String(Date.now()));
    setPhase('idle');
  }

  return {
    isReady: phase === 'ready',
    isApplying: phase === 'applying',
    error,
    releaseNotes,
    apply,
    dismiss,
  };
}
