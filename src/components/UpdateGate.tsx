import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { Download } from 'lucide-react-native';
import { ConfirmModal } from '@/components/ui';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { colors } from '@/lib/theme';
import {
  chooseUpdatePath,
  defaultUpdateMessage,
  storeUpdateTarget,
  type StoreUrls,
} from '@/lib/storeUpdate';

async function abrirLoja(urls: Partial<StoreUrls> | null | undefined) {
  const { url, fallback } = storeUpdateTarget(Platform.OS, urls);
  try {
    await Linking.openURL(url);
  } catch {
    // Sem o app da loja (emulador, aparelho sem loja instalada): a página web resolve.
    await Linking.openURL(fallback);
  }
}

type InAppUpdates = typeof import('expo-in-app-updates');
let inAppUpdates: InAppUpdates | null | undefined;

/**
 * O módulo nativo só existe a partir do binário 1.5.0, e o pacote chama
 * requireNativeModule já na importação. try/catch em volta do require NÃO
 * protege: o Metro roda a inicialização do módulo num guard próprio e reporta
 * o erro como fatal (no release, derruba o app). Por isso pergunta antes se o
 * módulo nativo existe — requireOptionalNativeModule devolve null em vez de
 * lançar — e só então importa o pacote ([INA]-04).
 */
function moduloInApp(): InAppUpdates | null {
  if (inAppUpdates === undefined) {
    inAppUpdates = requireOptionalNativeModule('ExpoInAppUpdates')
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require('expo-in-app-updates') as InAppUpdates)
      : null;
  }
  return inAppUpdates;
}

/**
 * Atualização nativa da Play (modo imediato: tela cheia com download,
 * instalação e reinício) quando a Play já tem a versão nova; senão, a página
 * da loja ([INA]-01, -02). Cancelar o fluxo nativo deixa o aviso como está
 * ([INA]-03) — na mínima, segue bloqueado.
 */
async function atualizar(urls: Partial<StoreUrls> | null | undefined) {
  const mod = Platform.OS === 'android' ? moduloInApp() : null;
  try {
    const info = mod ? await mod.checkForUpdate() : null;
    if (mod && chooseUpdatePath(info) === 'native' && (await mod.startUpdate(true))) return;
  } catch {
    // Play indisponível ou erro no fluxo nativo: o link resolve.
  }
  await abrirLoja(urls);
}

/**
 * Atualização do binário pela loja ([ATU]). Fica na raiz: vale até
 * deslogado. Abaixo da versão mínima não fecha; abaixo da recomendada tem
 * "Depois", que esconde até a próxima abertura do app.
 */
export default function UpdateGate() {
  const { requirement, config } = useAppUpdate();
  const [adiado, setAdiado] = useState(false);

  if (requirement === 'none' || (requirement === 'recommended' && adiado)) return null;

  const bloqueado = requirement === 'blocked';
  const onAtualizar = () => void atualizar(config);

  return (
    <ConfirmModal
      visible
      onClose={() => (bloqueado ? undefined : setAdiado(true))}
      title={config?.update_title || 'Nova versão disponível'}
      message={
        config?.update_message || defaultUpdateMessage(Platform.OS, bloqueado)
      }
      icon={<Download size={26} color={colors.accent} />}
      actions={
        bloqueado
          ? [{ label: 'Atualizar agora', variant: 'primary', onPress: onAtualizar }]
          : [
              { label: 'Atualizar', variant: 'primary', onPress: onAtualizar },
              { label: 'Depois', variant: 'ghost', onPress: () => setAdiado(true) },
            ]
      }
      dismissable={!bloqueado}
    />
  );
}
