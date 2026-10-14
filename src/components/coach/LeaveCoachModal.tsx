import { useState } from 'react';
import { Text, View } from 'react-native';
import { UserMinus } from 'lucide-react-native';
import { ConfirmModal, Input } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { useLeaveCoach } from '@/hooks/useEnrollment';
import { LEAVE_REASON_MAX, LEAVE_REASON_MIN, leaveReasonOk } from '@/lib/leaveReason';
import { colors } from '@/lib/theme';

type Props = {
  visible: boolean;
  coachName: string | null;
  onClose: () => void;
};

/**
 * O aluno encerra o acompanhamento sozinho ([TRAN]-10). Motivo obrigatório,
 * e a tela avisa antes que o professor vai ler ([TRAN]-11).
 */
export default function LeaveCoachModal({ visible, coachName, onClose }: Props) {
  const [reason, setReason] = useState('');
  const leave = useLeaveCoach();
  const alert = useAlert();
  const nome = coachName ?? 'seu professor';

  function fechar() {
    setReason('');
    onClose();
  }

  async function encerrar() {
    try {
      await leave.mutateAsync(reason.trim());
      fechar();
      alert.showAlert({
        title: 'Acompanhamento encerrado',
        message: 'Seus registros e treinos continuam com você, e agora você pode editá-los.',
        type: 'success',
      });
    } catch (err) {
      alert.showAlert({
        title: 'Não consegui encerrar',
        message: err instanceof Error ? err.message : 'Tente de novo em instantes.',
        type: 'error',
      });
    }
  }

  return (
    <ConfirmModal
      visible={visible}
      onClose={fechar}
      title="Encerrar acompanhamento"
      icon={<UserMinus size={26} color={colors.warn} />}
      content={
        <View className="w-full gap-3">
          <Text className="text-text-dim text-sm text-center leading-relaxed">
            Você deixa de ser aluno de {nome}. Seus registros e treinos continuam com você, e
            você volta a editá-los. Pra ter outro professor, é só procurar depois.
          </Text>
          <View>
            <Input
              label="Por que você está saindo?"
              value={reason}
              onChangeText={setReason}
              maxLength={LEAVE_REASON_MAX}
              placeholder="Ex: mudei de cidade e vou treinar presencial com alguém daqui."
              multiline
              numberOfLines={4}
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
            <Text className="text-text-muted text-[11px] mt-2">
              {nome} vai ler este motivo. Mínimo de {LEAVE_REASON_MIN} caracteres ·{' '}
              {reason.length}/{LEAVE_REASON_MAX}
            </Text>
          </View>
        </View>
      }
      actions={[
        {
          label: 'Encerrar acompanhamento',
          variant: 'danger',
          onPress: encerrar,
          loading: leave.isPending,
          disabled: !leaveReasonOk(reason),
        },
        { label: 'Voltar', variant: 'ghost', onPress: fechar },
      ]}
      dismissable={!leave.isPending}
    />
  );
}
