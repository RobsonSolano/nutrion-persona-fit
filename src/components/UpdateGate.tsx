import { useState } from 'react';
import { Linking } from 'react-native';
import { Download } from 'lucide-react-native';
import { ConfirmModal } from '@/components/ui';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { colors } from '@/lib/theme';
import { PLAY_APP_URL, PLAY_WEB_URL } from '@/lib/playStore';

async function abrirLoja(url: string | null) {
  try {
    await Linking.openURL(url || PLAY_APP_URL);
  } catch {
    // Sem o app da Play (emulador, aparelho sem Google): a página web resolve.
    await Linking.openURL(PLAY_WEB_URL);
  }
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
  const loja = () => void abrirLoja(config?.android_store_url ?? null);

  return (
    <ConfirmModal
      visible
      onClose={() => (bloqueado ? undefined : setAdiado(true))}
      title={config?.update_title || 'Nova versão disponível'}
      message={
        config?.update_message ||
        (bloqueado
          ? 'Esta versão do app não é mais suportada. Atualize na Play Store pra continuar.'
          : 'Tem uma versão nova do app na Play Store, com melhorias e correções.')
      }
      icon={<Download size={26} color={colors.accent} />}
      actions={
        bloqueado
          ? [{ label: 'Atualizar agora', variant: 'primary', onPress: loja }]
          : [
              { label: 'Atualizar', variant: 'primary', onPress: loja },
              { label: 'Depois', variant: 'ghost', onPress: () => setAdiado(true) },
            ]
      }
      dismissable={!bloqueado}
    />
  );
}
