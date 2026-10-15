import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Send } from 'lucide-react-native';
import { Button, Card, Input, Screen } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useSendSupportMessage } from '@/hooks/useSupport';
import {
  SUPPORT_BODY_MAX,
  SUPPORT_KIND_LABEL,
  SUPPORT_TITLE_MAX,
  validateSupportMessage,
  type SupportKind,
} from '@/lib/support';

const KIND_OPTIONS: { value: SupportKind; hint: string }[] = [
  { value: 'suporte', hint: 'Algo não funciona ou ficou com dúvida' },
  { value: 'sugestao', hint: 'Ideia pra melhorar o app' },
];

export default function NovaMensagemSuporteScreen() {
  const router = useRouter();
  const kbHeight = useKeyboardHeight();
  const alert = useAlert();
  const sendMutation = useSendSupportMessage();
  const [kind, setKind] = useState<SupportKind>('suporte');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function handleSubmit() {
    const error = validateSupportMessage({ title, body });
    if (error) {
      alert.showAlert({
        title: 'Falta pouco',
        message: error,
        type: 'warning',
      });
      return;
    }
    try {
      await sendMutation.mutateAsync({ kind, title, body });
      alert.showAlert({
        title: 'Mensagem enviada!',
        message: 'Você recebe a resposta aqui e por notificação.',
        type: 'success',
      });
      router.back();
    } catch (err) {
      alert.showError(err);
    }
  }

  return (
    <Screen variant="hero" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={0}
        className="flex-1"
      >
        <View className="flex-row items-center gap-3 px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold text-base flex-1">
            Nova mensagem
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 32 + (Platform.OS === 'android' ? kbHeight : 0),
            gap: 14,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <Card padding="md">
            <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
              Sobre o quê?
            </Text>
            <View className="flex-row gap-2">
              {KIND_OPTIONS.map((opt) => {
                const active = opt.value === kind;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setKind(opt.value)}
                    hitSlop={4}
                    className={`flex-1 rounded-2xl border px-3 py-3 active:opacity-80 ${
                      active
                        ? 'border-accent/50 bg-accent/10'
                        : 'border-border bg-surface-muted'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        active ? 'text-accent' : 'text-text-dim'
                      }`}
                    >
                      {SUPPORT_KIND_LABEL[opt.value]}
                    </Text>
                    <Text className="text-text-muted text-[11px] leading-snug mt-1">
                      {opt.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card padding="md">
            <Input
              label="Título"
              value={title}
              onChangeText={(v) => v.length <= SUPPORT_TITLE_MAX && setTitle(v)}
              placeholder={
                kind === 'suporte'
                  ? 'Ex: Não consigo salvar meu treino'
                  : 'Ex: Modo escuro no gráfico de evolução'
              }
              maxLength={SUPPORT_TITLE_MAX}
              returnKeyType="next"
            />
            <Text className="text-text-muted text-[11px] text-right mt-2">
              {title.length}/{SUPPORT_TITLE_MAX}
            </Text>

            <View className="mt-3">
              <Input
                label="Descrição"
                value={body}
                onChangeText={(v) => v.length <= SUPPORT_BODY_MAX && setBody(v)}
                placeholder={
                  kind === 'suporte'
                    ? 'Conta o que aconteceu, em qual tela e o que você esperava que acontecesse.'
                    : 'Conta sua ideia e como ela te ajudaria no dia a dia.'
                }
                maxLength={SUPPORT_BODY_MAX}
                multiline
                numberOfLines={6}
                style={{ minHeight: 160, textAlignVertical: 'top' }}
              />
              <Text className="text-text-muted text-[11px] text-right mt-2">
                {body.length}/{SUPPORT_BODY_MAX}
              </Text>
            </View>
          </Card>

          <Button
            label="Enviar"
            onPress={handleSubmit}
            loading={sendMutation.isPending}
            icon={<Send size={18} color={colors.textInverse} />}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
