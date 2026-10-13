import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { IS_EXPO_GO } from '@/lib/platform';
import { supabase } from './supabase';
import type * as NotificationsType from 'expo-notifications';
import type * as DeviceType from 'expo-device';

// Em Expo Go (SDK 53+) o `expo-notifications` warna no momento do import
// ("Android Push notifications functionality... was removed from Expo Go"),
// mesmo sem ser usado. Carregamos os módulos lazy só fora do Expo Go.
function loadNotifications(): typeof NotificationsType | null {
  if (IS_EXPO_GO) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

function loadDevice(): typeof DeviceType | null {
  if (IS_EXPO_GO) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-device');
}

/**
 * Comportamento do listener de foreground: mostra a notificação
 * mesmo com o app aberto. Sem isso, em foreground o user não vê
 * nada (silencioso).
 *
 * No Expo Go (SDK 53+), push remoto foi removido — pular a config
 * pra evitar warning "Android Push notifications functionality...
 * was removed from Expo Go". Em dev/preview/production builds,
 * roda normal.
 */
export function configurePushHandler() {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Cria o canal padrão do Android. Sem canal, a notificação cai num
 * "default" sem som/vibração. Roda no startup, idempotente.
 *
 * Pulado em Expo Go (mesmo motivo do configurePushHandler).
 */
export async function ensureAndroidChannel() {
  const Notifications = loadNotifications();
  if (!Notifications) return;
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Persona Fit',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#39ff14',
  });
}

export type RegisterResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'permission_denied' | 'not_device' | 'no_project_id' | 'unknown'; detail?: string };

/**
 * Pede permissão (se necessário), pega o Expo Push Token e salva em
 * profiles.expo_push_token. Chamado pelo toggle no perfil.
 *
 * Em emulador iOS push real não funciona — retorna `not_device`.
 * Android emulator com Google Play Services funciona normal.
 */
/**
 * O SO já concedeu permissão de push? Consulta SEM abrir prompt.
 *
 * Serve pra distinguir "o usuário recusou" de "o token sumiu mas a permissão
 * continua lá" — o segundo caso é re-registrável em silêncio, sem incomodar
 * ninguém, e é o que acontece depois de todo logout (o signOut limpa o token
 * de propósito, pra quem sai não receber push no aparelho de outra pessoa).
 */
export async function hasPushPermission(): Promise<boolean> {
  const Notifications = loadNotifications();
  const Device = loadDevice();
  if (!Notifications || !Device?.isDevice) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function registerForPushNotifications(): Promise<RegisterResult> {
  const Notifications = loadNotifications();
  const Device = loadDevice();
  if (!Notifications || !Device) {
    return {
      ok: false,
      reason: 'not_device',
      detail:
        'Push remoto não funciona no Expo Go (SDK 53+). Use development build ou APK.',
    };
  }
  if (!Device.isDevice) {
    return { ok: false, reason: 'not_device' };
  }

  // Permissão.
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  // ProjectId é obrigatório pro Expo Push token novo (SDK 49+).
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as unknown as { easConfig?: { projectId?: string } })?.easConfig
      ?.projectId;
  if (!projectId) {
    return {
      ok: false,
      reason: 'no_project_id',
      detail:
        'EAS projectId não configurado. Rode "eas init" antes de usar push em build.',
    };
  }

  let tokenResp: NotificationsType.ExpoPushToken;
  try {
    tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (err) {
    return {
      ok: false,
      reason: 'unknown',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const token = tokenResp.data;

  // Salva no profile do user atual.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, reason: 'unknown', detail: 'Sessão expirada.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', user.id);
  if (error) {
    return {
      ok: false,
      reason: 'unknown',
      detail: error.message,
    };
  }

  return { ok: true, token };
}

/** Remove o token do banco. User não recebe mais push. */
export async function unregisterPushNotifications(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: null })
    .eq('id', user.id);
  if (error) {
    console.warn('[push] unregister error:', error.message);
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const PUSH_FN_URL = `${SUPABASE_URL}/functions/v1/send-push-notification`;

export type PushEvent = 'new_request' | 'request_response';

/**
 * Dispara uma push notification via edge function. Fire-and-forget —
 * não bloqueia o fluxo do caller. Erros são apenas logados (a feature
 * principal não pode quebrar por causa de push).
 */
export function triggerPushNotification(
  event: PushEvent,
  requestId: string,
): void {
  void (async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(PUSH_FN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ event, request_id: requestId }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(
          `[push] trigger ${event} failed: ${res.status} ${detail}`,
        );
      }
    } catch (err) {
      console.warn('[push] trigger error:', err);
    }
  })();
}
