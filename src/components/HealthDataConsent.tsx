import { Linking, Text } from 'react-native';
import Checkbox from '@/components/ui/Checkbox';
import { useLegalDocs } from '@/hooks/useLegalDocs';

type Props = {
  accepted: boolean;
  onChange: (next: boolean) => void;
};

/**
 * Consentimento ESPECÍFICO E DESTACADO para tratamento de dado sensível de saúde
 * (LGPD art. 11, I). Separado do aceite de Termos de propósito — o art. 11 exige que
 * o consentimento de dado sensível seja destacado. O registro é feito pela mesma via
 * dos Termos (recordLegalAcceptance grava o doc_type 'consentimento_saude').
 */
export default function HealthDataConsent({ accepted, onChange }: Props) {
  const { byType } = useLegalDocs();

  const openPrivacy = () => {
    const url = byType('privacidade')?.url;
    if (url) void Linking.openURL(url);
  };

  return (
    <Checkbox checked={accepted} onChange={onChange}>
      <Text className="text-text-dim text-[12px] leading-relaxed">
        Autorizo o tratamento dos meus dados de saúde (medidas, registros de
        alimentação e treino, fotos e conversas com a IA) para gerar metas,
        planos e recomendações personalizadas. Para gerar as análises, minhas
        fotos, registros e conversas são enviados a um provedor de IA de
        terceiros, conforme a{' '}
        <Text
          className="text-violet-soft font-semibold"
          onPress={openPrivacy}
        >
          Política de Privacidade
        </Text>
        .
      </Text>
    </Checkbox>
  );
}
