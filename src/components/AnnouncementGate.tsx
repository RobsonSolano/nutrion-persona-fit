import { Linking } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Megaphone } from 'lucide-react-native';
import { ConfirmModal } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useMarkAnnouncementSeen, usePendingAnnouncements } from '@/hooks/useAnnouncements';
import { useSeenGate } from '@/hooks/useSeenGate';
import {
  useHasPendingCoachLinkNotice,
  useHasPendingStudentLinkNotice,
} from '@/hooks/useEnrollment';

/**
 * Aviso remoto ([AVI]): o primeiro pendente, uma vez por usuário. Espera o
 * bloqueio de versão e os avisos de vínculo ([MOD]) — um modal por vez.
 */
function AnnouncementGate({ hold }: { hold: boolean }) {
  const router = useRouter();
  const { blocked } = useAppUpdate();
  const { data } = usePendingAnnouncements();
  const markSeen = useMarkAnnouncementSeen();
  const atual = data?.[0] ?? null;
  const gate = useSeenGate(atual?.id ?? null);

  if (blocked || hold || !atual || !gate.visible) return null;

  const fechar = () => void gate.dismiss(() => markSeen.mutateAsync(atual.id));
  // Rota do app ("/encontrar-professor") ou link externo ([AVI]-05).
  const abrirLink = (url: string) => {
    fechar();
    if (url.startsWith('/')) router.push(url as Href);
    else void Linking.openURL(url);
  };

  return (
    <ConfirmModal
      visible
      onClose={fechar}
      title={atual.title}
      message={atual.body}
      icon={<Megaphone size={26} color={colors.accent} />}
      actions={
        atual.cta_label && atual.cta_url
          ? [
              {
                label: atual.cta_label,
                variant: 'primary',
                onPress: () => abrirLink(atual.cta_url!),
              },
              { label: 'Fechar', variant: 'ghost', onPress: fechar },
            ]
          : [{ label: 'Entendi', variant: 'primary', onPress: fechar }]
      }
      dismissable={false}
    />
  );
}

/** Área do aluno/comum: espera desfecho de contratação e desvínculo. */
export function StudentAnnouncementGate() {
  return <AnnouncementGate hold={useHasPendingStudentLinkNotice()} />;
}

/** Painel do professor: espera o aviso de aluno que encerrou o acompanhamento. */
export function CoachAnnouncementGate() {
  return <AnnouncementGate hold={useHasPendingCoachLinkNotice()} />;
}
