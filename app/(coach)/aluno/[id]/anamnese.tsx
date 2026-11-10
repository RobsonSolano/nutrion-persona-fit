import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, HeartPulse } from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import AnamneseForm from '@/components/AnamneseForm';
import { useAnamnese, useUpsertAnamnese } from '@/hooks/useAnamnese';
import { useStudentDetail } from '@/hooks/useStudents';
import { colors } from '@/lib/theme';
import type { StudentAnamnesePatch } from '@/types/database';
import { friendlyMessage } from '@/lib/friendlyError';

export default function AnamneseCoachScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQ = useStudentDetail(id ?? null);
  const anamneseQ = useAnamnese(id ?? null);
  const upsertM = useUpsertAnamnese(id ?? null);

  if (!id) return null;

  const studentName = detailQ.data?.profile.full_name ?? 'aluno';

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
          <Text className="text-text font-semibold">Anamnese</Text>
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
                  Anamnese clínica
                </Text>
              </View>
              <Text className="text-text font-semibold">{studentName}</Text>
              <Text className="text-text-muted text-xs mt-2 leading-relaxed">
                Edite a anamnese do aluno. As mudanças ficam visíveis pra ele
                e são usadas pela IA na próxima geração de plano.
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
