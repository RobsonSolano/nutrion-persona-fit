import { Text, View } from 'react-native';
import { Link2 } from 'lucide-react-native';
import { colors } from '@/lib/theme';

/**
 * Selo "Série conjunta" — mesmo componente no editor e na leitura.
 *
 * Existe porque a pílula estava escrita duas vezes e já tinha divergido (ícone
 * de 9px de um lado, 10px do outro). O par é o mesmo conceito nas duas telas;
 * o dev vai comparar as duas lado a lado.
 */
export default function SerieConjuntaBadge() {
  return (
    <View className="flex-row items-center gap-1 self-start rounded-full bg-accent/10 border border-accent/30 px-2 py-0.5">
      <Link2 size={10} color={colors.accent} />
      <Text className="text-accent text-[10px] font-semibold">
        Série conjunta
      </Text>
    </View>
  );
}
