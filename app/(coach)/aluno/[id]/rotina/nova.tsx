import { KeyboardAvoidingView, Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import RoutineEditor from '@/components/routine/RoutineEditor';
import { useCreateStudentRoutine } from '@/hooks/useStudents';
import { Screen } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function NovaRotinaAlunoScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const create = useCreateStudentRoutine();

  if (!id) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
      <Screen variant="hero" edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <View className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle">
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
            >
              <X size={18} color={colors.textDim} />
            </Pressable>
            <Text className="text-text font-semibold">Novo treino do aluno</Text>
            <View style={{ width: 40 }} />
          </View>

          <RoutineEditor
            submitLabel="Criar treino"
            loading={create.isPending}
            onSubmit={async (payload) => {
              await create.mutateAsync({
                studentId: id,
                name: payload.name,
                modality: payload.modality,
                groupId: payload.groupId,
                description: payload.description,
                exercises: payload.exercises,
              });
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              router.back();
            }}
          />
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}
