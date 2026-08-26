import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock } from 'lucide-react-native';
import { Button, Card, Input, Screen } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { confirmPasswordReset, requestPasswordReset } from '@/services/auth';
import { isResetFormValid } from '@/lib/passwordReset';
import { captureError } from '@/lib/sentry';

export default function RecuperarSenhaScreen() {
  const router = useRouter();
  const kbHeight = useKeyboardHeight();
  const alert = useAlert();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email ?? '').trim();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const valid = isResetFormValid({ token, password, confirm });
  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit() {
    if (!valid || !email) return;
    setLoading(true);
    try {
      await confirmPasswordReset(email, token, password);
      alert.showAlert({
        title: 'Senha redefinida',
        message: 'Pronto! Agora faça login com a sua nova senha.',
        type: 'success',
        onConfirm: () => router.replace('/(auth)/login' as Href),
      });
    } catch (err) {
      captureError(err, { feature: 'password_reset' });
      alert.showError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email) return;
    setResending(true);
    try {
      await requestPasswordReset(email);
      alert.showAlert({
        title: 'Código reenviado',
        message: 'Enviamos um novo código pro seu e-mail.',
        type: 'success',
      });
    } catch (err) {
      alert.showError(err);
    } finally {
      setResending(false);
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
            Recuperar senha
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
            <View className="flex-row items-start gap-3 mb-4">
              <View className="h-10 w-10 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
                <KeyRound size={18} color={colors.violetSoft} />
              </View>
              <View className="flex-1">
                <Text className="text-text text-sm font-semibold">
                  Digite o código
                </Text>
                <Text className="text-text-muted text-[11px] mt-0.5 leading-relaxed">
                  Enviamos um código de 6 dígitos para
                  {email ? ` ${email}` : ' seu e-mail'}. Digite ele abaixo e
                  escolha a nova senha.
                </Text>
              </View>
            </View>
            <View className="gap-2.5">
              <Input
                value={token}
                onChangeText={(v) => setToken(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="Código de 6 dígitos"
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                leftIcon={<KeyRound size={18} color={colors.textMuted} />}
              />
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="Nova senha"
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                leftIcon={<Lock size={18} color={colors.textMuted} />}
                rightAccessory={
                  show ? (
                    <EyeOff size={18} color={colors.textDim} />
                  ) : (
                    <Eye size={18} color={colors.textDim} />
                  )
                }
                onRightAccessoryPress={() => setShow((v) => !v)}
              />
              <Input
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirmar nova senha"
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                leftIcon={<Lock size={18} color={colors.textMuted} />}
              />
              {mismatch && (
                <Text className="text-danger text-[11px] px-1">
                  As senhas não conferem.
                </Text>
              )}
            </View>
          </Card>

          <Button
            label="Redefinir senha"
            onPress={handleSubmit}
            loading={loading}
            disabled={!valid || !email}
          />
          <Pressable
            onPress={handleResend}
            disabled={resending}
            hitSlop={8}
            className="items-center py-2 active:opacity-60"
          >
            <Text className="text-text-dim text-[13px]">
              {resending ? 'Reenviando...' : 'Não recebeu? Reenviar código'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
