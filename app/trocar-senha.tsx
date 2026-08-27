import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react-native';
import { Button, Card, Input, Screen } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { changePassword } from '@/services/auth';
import { captureError } from '@/lib/sentry';

export default function TrocarSenhaScreen() {
  const router = useRouter();
  const kbHeight = useKeyboardHeight();
  const alert = useAlert();

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const valid =
    newPassword.length >= 8 && newPassword === confirm;

  const mismatch =
    confirm.length > 0 && newPassword !== confirm;

  async function handleSubmit() {
    if (!valid) return;
    setLoading(true);
    try {
      await changePassword(newPassword);
      alert.showAlert({
        title: 'Senha trocada',
        message: 'Use a nova senha no próximo login.',
        type: 'success',
        onConfirm: () => router.back(),
      });
    } catch (err) {
      captureError(err, { feature: 'change_password' });
      alert.showError(err);
    } finally {
      setLoading(false);
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
            Trocar senha
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
                <ShieldCheck size={18} color={colors.violetSoft} />
              </View>
              <View className="flex-1">
                <Text className="text-text text-sm font-semibold">
                  Senha de acesso
                </Text>
                <Text className="text-text-muted text-[11px] mt-0.5 leading-relaxed">
                  Mínimo 8 caracteres. Use uma senha forte que você consiga
                  lembrar.
                </Text>
              </View>
            </View>
            <View className="gap-2.5">
              <Input
                value={newPassword}
                onChangeText={setNewPassword}
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
            label="Trocar senha"
            onPress={handleSubmit}
            loading={loading}
            disabled={!valid}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
