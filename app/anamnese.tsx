import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeft, HeartPulse } from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import AnamneseForm from '@/components/AnamneseForm';
import { useAnamnese, useUpsertAnamnese } from '@/hooks/useAnamnese';
import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/lib/theme';
import type { StudentAnamnesePatch } from '@/types/database';
import { friendlyMessage } from '@/lib/friendlyError';

export default function AnamneseScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const anamneseQ = useAnamnese(userId);
  const upsertM = useUpsertAnamnese(userId);

  async function handleSubmit(patch: StudentAnamnesePatch) {
    try {
      await upsertM.mutateAsync(patch);
      router.back();
    } catch (err) {
      Alert.alert(
        'Não consegui salvar',
        friendlyMessage(err),
      );
    }
  }

  return (
    <>
      <Stack.Screen
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold">Anamnese clínica</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              gap: 14,
              paddingBottom: 80,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Card padding="md">
              <View className="flex-row items-center gap-2 mb-2">
                <HeartPulse size={14} color={colors.accent} />
                <Text className="text-text-dim text-[11px] uppercase tracking-widest">
                  Sobre a anamnese
                </Text>
              </View>
              <Text className="text-text-muted text-xs leading-relaxed">
                Esses dados ajudam o app (e seu coach, se você tiver um) a
                montar treinos mais seguros. Tudo é opcional — preencha o que
                quiser. Dado clínico fica visível só pra você e pro seu coach.
              </Text>
            </Card>

            {anamneseQ.isLoading ? (
              <Card padding="md">
                <Text className="text-text-muted text-xs">
                  Carregando dados…
                </Text>
              </Card>
            ) : (
              <AnamneseForm
                initial={anamneseQ.data ?? null}
                submitting={upsertM.isPending}
                onSubmit={handleSubmit}
                onCancel={() => router.back()}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}
