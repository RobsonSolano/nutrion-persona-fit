import { ReactNode } from 'react';
import { View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/lib/theme';

type Props = {
  children: ReactNode;
  /**
   * 'hero' mostra um gradiente radial (fake via two-stop linear) verde no topo,
   * ideal para telas de entrada (login, onboarding). Use 'flat' para telas internas.
   */
  variant?: 'hero' | 'flat' | 'violet';
  /**
   * Bordas onde o inset do sistema é aplicado. **Default `['top']` de propósito**,
   * não por descuido: `app.config.ts` tem `edgeToEdgeEnabled: true`, e as telas
   * dentro de `(tabs)` já têm a base coberta pela tab bar, que soma
   * `insets.bottom` na própria altura (`app/(tabs)/_layout.tsx`). Passar
   * `'bottom'` nelas criaria espaço vazio duplicado acima da tab bar.
   *
   * **Tela FORA das tabs precisa passar `['top', 'bottom']`** — sem isso, o
   * conteúdo do rodapé fica embaixo dos botões de navegação do Android e vira
   * inalcançável. Foi o que aconteceu com 12 telas (incluindo o paywall).
   */
  edges?: Edge[];
  contentStyle?: ViewStyle;
};

export default function Screen({
  children,
  variant = 'flat',
  edges = ['top'],
  contentStyle,
}: Props) {
  return (
    <View className="flex-1 bg-bg-deep">
      {variant === 'hero' && (
        <LinearGradient
          colors={['rgba(57,255,20,0.20)', 'rgba(29,185,84,0.06)', 'rgba(7,8,11,0)']}
          locations={[0, 0.35, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 420,
          }}
          pointerEvents="none"
        />
      )}
      {variant === 'violet' && (
        <LinearGradient
          colors={['rgba(139,92,246,0.18)', 'rgba(139,92,246,0.02)', 'rgba(7,8,11,0)']}
          locations={[0, 0.4, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 0.6 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 380,
          }}
          pointerEvents="none"
        />
      )}
      <SafeAreaView
        edges={edges}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      >
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
