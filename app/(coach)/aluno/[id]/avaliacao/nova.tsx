import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Card, Screen } from '@/components/ui';
import AssessmentForm from '@/components/coach/AssessmentForm';
import { useCreatePhysicalAssessment } from '@/hooks/usePhysicalAssessments';
import { useStudentDetail } from '@/hooks/useStudents';
import { colors } from '@/lib/theme';
import type { PhysicalAssessmentInput } from '@/types/database';
import { friendlyMessage } from '@/lib/friendlyError';

export default function NovaAvaliacaoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQ = useStudentDetail(id ?? null);
  const createM = useCreatePhysicalAssessment();

  if (!id) return null;

  const studentName = detailQ.data?.profile.full_name ?? 'aluno';
  const studentSex = detailQ.data?.profile.sex ?? null;

  async function handleSubmit(input: PhysicalAssessmentInput) {
    try {
      await createM.mutateAsync(input);
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
          <Text className="text-text font-semibold">Nova avaliação</Text>
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
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
                Aluno
              </Text>
              <Text className="text-text font-semibold">{studentName}</Text>
              {studentSex == null && (
                <Text className="text-warn text-xs mt-2 leading-relaxed">
                  Sexo não preenchido no cadastro do aluno — % de gordura não
                  será calculado até atualizar o perfil.
                </Text>
              )}
            </Card>

            <AssessmentForm
              studentId={id}
              studentSex={studentSex}
              submitting={createM.isPending}
              onSubmit={handleSubmit}
              onCancel={() => router.back()}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}
