import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
};

const containerBase =
  'flex-row items-center justify-center rounded-2xl border';

const variantClass: Record<Variant, string> = {
  primary: 'bg-accent border-accent active:bg-accent-soft',
  secondary: 'bg-surface-raised border-border-strong active:bg-surface',
  ghost: 'bg-transparent border-border active:bg-surface',
  danger: 'bg-transparent border-border-strong active:bg-surface',
};

// Desabilitado tem look próprio (cinza), não a cor do variant apagada: um
// primary verde-néon a 50% ainda lê como "clicável". Cinza comunica "trava".
const disabledContainerClass = 'bg-surface-muted border-border';
const disabledTextClass = 'text-text-muted';

const textVariantClass: Record<Variant, string> = {
  primary: 'text-text-inverse',
  secondary: 'text-text',
  ghost: 'text-text-dim',
  danger: 'text-danger',
};

const sizeClass: Record<Size, string> = {
  sm: 'py-2.5 px-4 gap-2',
  md: 'py-3.5 px-5 gap-2.5',
  lg: 'py-4 px-6 gap-3',
};

const textSizeClass: Record<Size, string> = {
  sm: 'text-sm font-semibold',
  md: 'text-base font-semibold',
  lg: 'text-base font-bold tracking-wide',
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  fullWidth = true,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  async function handlePress() {
    if (isDisabled || !onPress) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await onPress();
  }

  // Desabilitado = fundo cinza escuro; o spinner do primary (textInverse, quase
  // preto) sumiria nele. Loading conta como desabilitado, então usa textMuted.
  const spinnerColor = isDisabled
    ? colors.textMuted
    : variant === 'primary'
      ? colors.textInverse
      : colors.text;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      onPress={handlePress}
      className={`${containerBase} ${
        isDisabled ? disabledContainerClass : variantClass[variant]
      } ${sizeClass[size]} ${
        fullWidth ? 'w-full' : 'self-start'
      } ${isDisabled ? 'opacity-70' : ''}`}
      style={
        variant === 'primary' && !isDisabled
          ? {
              shadowColor: colors.accent,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.45,
              shadowRadius: 16,
              elevation: 8,
            }
          : undefined
      }
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text
            className={`${
              isDisabled ? disabledTextClass : textVariantClass[variant]
            } ${textSizeClass[size]}`}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
