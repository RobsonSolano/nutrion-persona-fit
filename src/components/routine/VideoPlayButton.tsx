import { Pressable } from 'react-native';
import { CirclePlay } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { openExerciseVideo } from '@/lib/youtube';

type Props = {
  /** Vídeo salvo no catálogo. Sem ele, o play cai na busca pelo nome. */
  videoUrl: string | null;
  exerciseName: string;
  /** `sm` é o botão dentro do bloco de um par, que é mais apertado. */
  size?: 'sm' | 'md';
};

/**
 * Atalho pro vídeo do exercício. Irmão do `PreviewEyeButton`.
 *
 * Existia copiado em três lugares (editor, cabeçalho do card de leitura e bloco
 * do par), com medidas divergentes e nenhum `accessibilityLabel`.
 */
export default function VideoPlayButton({
  videoUrl,
  exerciseName,
  size = 'md',
}: Props) {
  const pequeno = size === 'sm';
  return (
    <Pressable
      onPress={() => openExerciseVideo({ videoUrl, exerciseName })}
      hitSlop={8}
      accessibilityLabel={`Ver vídeo de ${exerciseName}`}
      className={`${
        pequeno ? 'h-7 w-7 bg-surface-muted' : 'h-8 w-8 bg-surface'
      } rounded-lg border border-border items-center justify-center active:opacity-70`}
    >
      <CirclePlay size={pequeno ? 12 : 14} color={colors.danger} />
    </Pressable>
  );
}
