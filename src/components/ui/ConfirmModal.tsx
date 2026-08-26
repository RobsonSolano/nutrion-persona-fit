import { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Button from './Button';

type ActionVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ConfirmAction = {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ActionVariant;
  loading?: boolean;
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Conteúdo rico abaixo do `message` (listas, seções). Opcional — os
   *  callers que só precisam de texto seguem usando `message`.
   *  O container do header é `items-center`: quem passa `content` cuida do
   *  próprio layout (ex. `w-full` no root) se não quiser ficar centralizado. */
  content?: ReactNode;
  icon?: ReactNode;
  /** Ações em ordem visual (top-down). Convenção: cancelar por último. */
  actions: ConfirmAction[];
  /** Se true, fechar pelo backdrop é bloqueado (forçar uso dos botões). */
  dismissable?: boolean;
};

export default function ConfirmModal({
  visible,
  onClose,
  title,
  message,
  content,
  icon,
  actions,
  dismissable = true,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={() => {
          if (dismissable) onClose();
        }}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.65)',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          className="rounded-3xl border border-border bg-surface overflow-hidden"
        >
          <View className="px-6 pt-6 pb-2 items-center">
            {icon && (
              <View className="h-14 w-14 rounded-2xl bg-surface-muted border border-border items-center justify-center mb-3">
                {icon}
              </View>
            )}
            <Text className="text-text text-lg font-bold text-center">
              {title}
            </Text>
            {message && (
              <Text className="text-text-dim text-sm text-center mt-2 leading-relaxed">
                {message}
              </Text>
            )}
            {content}
          </View>
          <View className="px-5 pt-4 pb-5 gap-2">
            {actions.map((a, i) => (
              <Button
                key={`${a.label}-${i}`}
                label={a.label}
                onPress={a.onPress}
                variant={a.variant ?? 'secondary'}
                size="md"
                loading={a.loading}
                disabled={a.disabled}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
