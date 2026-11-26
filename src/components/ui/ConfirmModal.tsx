import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
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
  /** Se false, fechar pelo backdrop é bloqueado (forçar uso dos botões). */
  dismissable?: boolean;
  /**
   * Para modal montado na raiz do app (alerta global). No iOS, o <Modal> é apresentado
   * a partir da tela raiz e falha quando há uma tela modal aberta (paywall, editar
   * perfil, registro): não aparece e deixa uma camada invisível bloqueando os toques.
   * Com overlay, o iOS desenha numa janela própria acima de tudo (FullWindowOverlay).
   * Modais montados dentro de uma tela não precisam disto.
   */
  overlay?: boolean;
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
  overlay = false,
}: Props) {
  const body = (
    <>
      {/* Modal não herda o adjustResize da janela: sem isto, um campo de
          texto no `content` (motivo, confirmação) sobe o teclado por cima
          dos botões. O ScrollView centraliza quando cabe e rola quando o
          teclado toma o espaço. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }}
      >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
      <Pressable
        onPress={() => {
          if (dismissable) onClose();
        }}
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          paddingVertical: 24,
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
      </ScrollView>
      </KeyboardAvoidingView>
    </>
  );

  if (overlay && Platform.OS === 'ios') {
    if (!visible) return null;
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal>
        <View style={StyleSheet.absoluteFill}>{body}</View>
      </FullWindowOverlay>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {body}
    </Modal>
  );
}
