import { Text, View } from 'react-native';
import { UserMinus } from 'lucide-react-native';
import { ConfirmModal } from '@/components/ui';
import ReasonBox from '@/components/coach/ReasonBox';
import { colors } from '@/lib/theme';
import { useMarkUnlinkNoticeSeen, useUnseenUnlinkNotices } from '@/hooks/useEnrollment';
import { useSeenGate } from '@/hooks/useSeenGate';

/**
 * Avisa o professor, na abertura do painel, que um aluno encerrou o
 * acompanhamento — com o motivo que o aluno escreveu ([TRAN]-11). Mesmo
 * motivo do aviso do lado do aluno: o push pode não chegar.
 */
export default function StudentLeftGate() {
  const { data } = useUnseenUnlinkNotices('coach');
  const markSeen = useMarkUnlinkNoticeSeen();
  const atual = data?.[0] ?? null;
  const gate = useSeenGate(atual?.id ?? null);

  if (!atual || !gate.visible) return null;

  const fechar = () => void gate.dismiss(() => markSeen.mutateAsync(atual.id));
  const nome = atual.student_name ?? 'Um aluno';
  const quando = new Date(atual.created_at).toLocaleDateString('pt-BR');

  return (
    <ConfirmModal
      visible
      onClose={fechar}
      title="Aluno encerrou o acompanhamento"
      icon={<UserMinus size={26} color={colors.warn} />}
      content={
        <View className="w-full">
          <Text className="text-text-dim text-sm text-center leading-relaxed">
            {nome} deixou de ser seu aluno em {quando}. A vaga já está livre.
          </Text>
          {atual.reason ? <ReasonBox label="Motivo" text={atual.reason} /> : null}
        </View>
      }
      actions={[{ label: 'Entendi', onPress: fechar }]}
      dismissable={false}
    />
  );
}
