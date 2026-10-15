import { Text, View } from 'react-native';
import { colors } from '@/lib/theme';

/**
 * Bolinha de contagem no canto de um botão (ex.: respostas não lidas).
 * O pai precisa de `position: 'relative'`. Não renderiza com 0.
 */
export default function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: -4,
        right: -4,
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.accent,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: colors.surface,
      }}
    >
      <Text style={{ color: colors.textInverse, fontSize: 10, fontWeight: '700' }}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
