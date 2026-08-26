import { KeyboardAvoidingView, Pressable, Text, View } from 'react-native';
import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import RoutineEditor from '@/components/routine/RoutineEditor';
import { useCreateRoutine } from '@/hooks/useRoutines';
import { useProfile } from '@/hooks/useProfile';
import { Screen } from '@/components/ui';
import { colors } from '@/lib/theme';

export default function NovaRotinaScreen() {
  const router = useRouter();
  const create = useCreateRoutine();
  const profileQ = useProfile();

  // Aluno não cria rotinas próprias — pode solicitar ao professor.
  if (profileQ.data?.role === 'aluno') {
    return <Redirect href={'/(tabs)/treino' as Href} />;
  }

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
            <Text className="text-text font-semibold">Novo treino</Text>
            <View style={{ width: 40 }} />
          </View>

          <RoutineEditor
            submitLabel="Criar treino"
            loading={create.isPending}
            onSubmit={async (payload) => {
              await create.mutateAsync({
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
