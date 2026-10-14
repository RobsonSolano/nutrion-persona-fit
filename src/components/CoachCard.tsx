import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { Avatar, Card } from '@/components/ui';
import { useCoachContact } from '@/hooks/useCoachContact';
import { formatPhoneBR, whatsappUrl } from '@/lib/phone';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import LeaveCoachModal from '@/components/coach/LeaveCoachModal';
import RateCoachModal from '@/components/coach/RateCoachModal';
import StarRating from '@/components/coach/StarRating';
import { useMyRatingFor } from '@/hooks/useEnrollment';

type Props = {
  coachId: string;
};

export default function CoachCard({ coachId }: Props) {
  const { data, isLoading } = useCoachContact(coachId);
  const alert = useAlert();
  const [saindo, setSaindo] = useState(false);
  const [avaliando, setAvaliando] = useState(false);
  const ratingQ = useMyRatingFor(coachId);

  if (isLoading || !data) return null;

  const phone = data.show_contact_to_students ? data.contact_phone : null;

  async function openWhatsApp() {
    if (!phone) return;
    try {
      await Linking.openURL(whatsappUrl(phone));
    } catch {
      alert.showAlert({
        title: 'Não consegui abrir o WhatsApp',
        message: 'Verifique se o app está instalado.',
        type: 'error',
      });
    }
  }

  return (
    <Card padding="md">
      <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
        Seu professor
      </Text>
      <View className="flex-row items-center gap-3">
        <Avatar
          url={data.avatar_url}
          name={data.full_name}
          size={48}
          accent="violet"
        />
        <View className="flex-1">
          <Text className="text-text font-semibold" numberOfLines={1}>
            {data.full_name ?? 'Professor'}
          </Text>
          <Text className="text-text-dim text-xs">Professor responsável</Text>
        </View>
      </View>

      {phone && (
        <Pressable
          onPress={openWhatsApp}
          className="mt-3 flex-row items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 active:opacity-70"
        >
          <MessageCircle size={16} color={colors.accent} />
          <Text className="text-accent text-sm font-semibold flex-1">
            {formatPhoneBR(phone)}
          </Text>
          <Text className="text-accent/60 text-xs">WhatsApp →</Text>
        </Pressable>
      )}
      {/* [AVAL]-07: o aluno atual avalia por aqui (a busca fica escondida pra ele). */}
      <Pressable
        onPress={() => setAvaliando(true)}
        className="mt-3 flex-row items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2.5 active:opacity-70"
      >
        {ratingQ.data ? <StarRating value={ratingQ.data.stars} size={14} /> : null}
        <Text className="text-text text-sm font-semibold flex-1">
          {ratingQ.data ? 'Editar avaliação' : 'Avaliar professor'}
        </Text>
        <Text className="text-text-dim text-xs">→</Text>
      </Pressable>
      <RateCoachModal
        visible={avaliando}
        coachId={coachId}
        coachName={data.full_name}
        initialStars={ratingQ.data?.stars}
        initialComment={ratingQ.data?.comment}
        onClose={() => setAvaliando(false)}
      />
      {/* [TRAN]-10: o aluno não fica refém — sai sem depender do professor. */}
      <Pressable
        onPress={() => setSaindo(true)}
        className="mt-3 self-start py-1 active:opacity-60"
      >
        <Text className="text-text-muted text-xs underline">Encerrar acompanhamento</Text>
      </Pressable>
      <LeaveCoachModal
        visible={saindo}
        coachName={data.full_name}
        onClose={() => setSaindo(false)}
      />
    </Card>
  );
}
