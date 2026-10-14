import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { CheckCircle2, UserMinus, XCircle } from 'lucide-react-native';
import { ConfirmModal } from '@/components/ui';
import ReasonBox from '@/components/coach/ReasonBox';
import { colors } from '@/lib/theme';
import {
  useMarkRequestSeen,
  useMarkUnlinkNoticeSeen,
  useUnseenEnrollmentOutcomes,
  useUnseenUnlinkNotices,
} from '@/hooks/useEnrollment';
import { useSeenGate } from '@/hooks/useSeenGate';
import { useAppUpdate } from '@/hooks/useAppUpdate';

/**
 * Avisa, na abertura do app, o que mudou no vínculo com o professor:
 * desfecho da solicitação (aceita/recusada) e desvínculo feito pelo
 * professor.
 *
 * Por que não confiar no push: a permissão de notificação pode estar
 * negada, e virar (ou deixar de ser) aluno muda o que o usuário pode fazer
 * no app — ele PRECISA saber. O push só antecipa; a fonte é este gate.
 *
 * Mostra um por vez — o desvínculo antes, porque é o estado atual da conta.
 */
export default function EnrollmentOutcomeGate() {
  const router = useRouter();
  const { unseen } = useUnseenEnrollmentOutcomes();
  const unlinkQ = useUnseenUnlinkNotices('student');
  const markSeen = useMarkRequestSeen();
  const markUnlinkSeen = useMarkUnlinkNoticeSeen();

  const desvinculo = unlinkQ.data?.[0] ?? null;
  const desfecho = unseen.length > 0 ? unseen[unseen.length - 1] : null;
  const gate = useSeenGate(desvinculo?.id ?? desfecho?.id ?? null);
  const { blocked } = useAppUpdate();

  // Bloqueio de versão vem primeiro ([MOD]-01).
  if (blocked || !gate.visible) return null;

  if (desvinculo) {
    const nome = desvinculo.coach_name ?? 'Seu professor';
    const fechar = (irPara?: Href) => {
      void gate.dismiss(() => markUnlinkSeen.mutateAsync(desvinculo.id));
      if (irPara) router.push(irPara);
    };
    return (
      <ConfirmModal
        visible
        onClose={() => fechar()}
        title="Vínculo encerrado"
        icon={<UserMinus size={26} color={colors.warn} />}
        message={`${nome} encerrou o acompanhamento. Você voltou a usar o app por conta própria: seus registros e treinos continuam com você, e agora você pode editá-los.`}
        actions={[
          {
            label: 'Procurar outro professor',
            onPress: () => fechar('/encontrar-professor' as Href),
          },
          { label: 'Entendi', variant: 'ghost', onPress: () => fechar() },
        ]}
        dismissable={false}
      />
    );
  }

  if (!desfecho) return null;
  const aceito = desfecho.status === 'efetuado';
  const nome = desfecho.coach_name ?? 'O professor';
  const fechar = (irPara?: Href) => {
    void gate.dismiss(() => markSeen.mutateAsync(desfecho.id));
    if (irPara) router.push(irPara);
  };

  return (
    <ConfirmModal
      visible
      onClose={() => fechar()}
      title={aceito ? 'Você agora tem professor' : 'Solicitação não aceita'}
      icon={
        aceito ? (
          <CheckCircle2 size={26} color={colors.accent} />
        ) : (
          <XCircle size={26} color={colors.danger} />
        )
      }
      content={
        <View className="w-full">
          <Text className="text-text-dim text-sm text-center leading-relaxed">
            {aceito
              ? `${nome} aceitou você como aluno. A partir de agora ele acompanha seu plano — treinos, metas e ajustes passam por ele.`
              : `${nome} não aceitou sua solicitação. Sua conta continua exatamente como estava.`}
          </Text>
          {!aceito && desfecho.cancel_reason ? <ReasonBox text={desfecho.cancel_reason} /> : null}
        </View>
      }
      actions={
        aceito
          ? [{ label: 'Entendi', onPress: () => fechar() }]
          : [
              {
                label: 'Procurar outro professor',
                onPress: () => fechar('/encontrar-professor' as Href),
              },
              { label: 'Agora não', variant: 'ghost', onPress: () => fechar() },
            ]
      }
      dismissable={false}
    />
  );
}
