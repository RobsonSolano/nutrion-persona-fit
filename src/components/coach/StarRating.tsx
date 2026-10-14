import { Pressable, Text, View } from 'react-native';
import { Star } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';

type Props = {
  /** Nota exibida (aceita fração — 4.3 pinta 4 cheias). */
  value: number;
  /** Total de avaliações, quando faz sentido mostrar ao lado. */
  count?: number;
  size?: number;
  /** Sem isso o componente é só leitura. */
  onChange?: (stars: number) => void;
  disabled?: boolean;
};

/**
 * Estrelas 1-5. Em modo leitura mostra a média e o total; com total
 * informado e igual a zero, mostra "sem avaliações" em vez de 5 estrelas
 * apagadas, que seriam lidas como nota zero. Sem `count`, é a nota de uma
 * avaliação só (a do aluno, uma linha da lista) — mostra as estrelas.
 */
export default function StarRating({
  value,
  count,
  size = 16,
  onChange,
  disabled = false,
}: Props) {
  const interactive = !!onChange && !disabled;
  const semAvaliacao = !interactive && count === 0;

  if (semAvaliacao) {
    return (
      <View className="flex-row items-center gap-1.5">
        <Star size={size} color={colors.textMuted} />
        <Text className="text-text-muted text-xs">Sem avaliações</Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-1.5">
      <View className="flex-row items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= Math.round(value);
          const star = (
            <Star
              size={size}
              color={filled ? colors.warn : colors.textMuted}
              fill={filled ? colors.warn : 'transparent'}
            />
          );
          if (!interactive) return <View key={n}>{star}</View>;
          return (
            <Pressable
              key={n}
              hitSlop={6}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange!(n);
              }}
              className="active:opacity-60 p-0.5"
            >
              {star}
            </Pressable>
          );
        })}
      </View>
      {!interactive && (
        <Text className="text-text-dim text-xs">
          {value.toFixed(1)}
          {count != null ? ` (${count})` : ''}
        </Text>
      )}
    </View>
  );
}
