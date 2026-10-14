import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { ConfirmModal, Input } from '@/components/ui';
import StarRating from '@/components/coach/StarRating';
import { useAlert } from '@/components/GlobalAlertProvider';
import { useRateCoach } from '@/hooks/useEnrollment';
import { colors } from '@/lib/theme';

const COMMENT_MAX = 500;

type Props = {
  visible: boolean;
  coachId: string;
  coachName: string | null;
  /** Nota/comentário já dados — reavaliar sobrescreve ([AVAL]-03). */
  initialStars?: number | null;
  initialComment?: string | null;
  onClose: () => void;
};

/**
 * Nota de 1 a 5 + comentário opcional ([AVAL]-05). A nota entra na média
 * pública; o comentário só o professor lê ([AVAL]-06) — a tela diz isso
 * antes de enviar.
 */
export default function RateCoachModal({
  visible,
  coachId,
  coachName,
  initialStars,
  initialComment,
  onClose,
}: Props) {
  const [stars, setStars] = useState(initialStars ?? 0);
  const [comment, setComment] = useState(initialComment ?? '');
  const rateM = useRateCoach();
  const alert = useAlert();
  const nome = coachName ?? 'o professor';

  // Reabre com o que já foi salvo (ou com a estrela tocada no perfil).
  useEffect(() => {
    if (visible) {
      setStars(initialStars ?? 0);
      setComment(initialComment ?? '');
    }
  }, [visible, initialStars, initialComment]);

  async function salvar() {
    try {
      await rateM.mutateAsync({ coachId, stars, comment: comment.trim() || null });
      onClose();
      alert.showAlert({ title: 'Avaliação salva', message: 'Obrigado!', type: 'success' });
    } catch (err) {
      alert.showError(err);
    }
  }

  return (
    <ConfirmModal
      visible={visible}
      onClose={onClose}
      title={`Avaliar ${nome}`}
      icon={<Star size={26} color={colors.warn} />}
      content={
        <View className="w-full items-center gap-3 mt-2">
          <StarRating value={stars} size={34} onChange={setStars} disabled={rateM.isPending} />
          <View className="w-full">
            <Input
              label="Comentário (opcional)"
              value={comment}
              onChangeText={setComment}
              maxLength={COMMENT_MAX}
              placeholder="Como está sendo o acompanhamento?"
              multiline
              numberOfLines={4}
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <Text className="text-text-muted text-[11px] mt-2">
              A nota entra na média pública. O comentário só {nome} lê · {comment.length}/
              {COMMENT_MAX}
            </Text>
          </View>
        </View>
      }
      actions={[
        {
          label: 'Salvar avaliação',
          variant: 'primary',
          onPress: salvar,
          loading: rateM.isPending,
          disabled: stars < 1,
        },
        { label: 'Cancelar', variant: 'ghost', onPress: onClose },
      ]}
      dismissable={!rateM.isPending}
    />
  );
}
