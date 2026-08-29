import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { ConfirmModal } from '@/components/ui';
import { colors } from '@/lib/theme';
import {
  useMarkRequestSeen,
  useUnseenEnrollmentOutcomes,
} from '@/hooks/useEnrollment';

/**
 * Avisa o desfecho da solicitação na abertura do app.
 *
 * Por que não confiar no push: a permissão de notificação pode estar
 * negada, e virar (ou não virar) aluno muda o que o usuário pode fazer no
 * app — ele PRECISA saber. O push só antecipa; a fonte é este gate.
 *
 * Mostra um por vez, do mais antigo pro mais recente, e só marca como
 * visto depois que o usuário fecha.
 */
export default function EnrollmentOutcomeGate() {
  const router = useRouter();
  const { unseen } = useUnseenEnrollmentOutcomes();
  const markSeen = useMarkRequestSeen();
  const [fechando, setFechando] = useState<string | null>(null);

  const atual = unseen.length > 0 ? unseen[unseen.length - 1] : null;

  useEffect(() => {
    if (!atual) setFechando(null);
  }, [atual]);

  if (!atual || fechando === atual.id) return null;

  const aceito = atual.status === 'efetuado';
  const nome = atual.coach_name ?? 'O professor';

  async function fechar(irPara?: Href) {
    if (!atual) return;
    setFechando(atual.id);
    try {
      await markSeen.mutateAsync(atual.id);
    } catch {
      // Não conseguiu marcar: o aviso volta na próxima abertura. Melhor
      // repetir do que engolir uma mudança de estado da conta.
    }
    if (irPara) router.push(irPara);
  }

  return (
    <ConfirmModal
      visible
      onClose={() => void fechar()}
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
          {!aceito && atual.cancel_reason ? (
            <View className="mt-3 rounded-2xl border border-border bg-surface p-3">
              <Text className="text-text-muted text-xs leading-relaxed">
                {atual.cancel_reason}
              </Text>
            </View>
          ) : null}
        </View>
      }
      actions={
        aceito
          ? [{ label: 'Entendi', onPress: () => void fechar() }]
          : [
              {
                label: 'Procurar outro professor',
                onPress: () => void fechar('/encontrar-professor' as Href),
              },
              { label: 'Agora não', variant: 'ghost', onPress: () => void fechar() },
            ]
      }
      dismissable={false}
    />
  );
}
