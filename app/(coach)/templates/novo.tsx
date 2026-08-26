import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, Text, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import RoutineEditor from '@/components/routine/RoutineEditor';
import { useCreateTemplate } from '@/hooks/useTemplates';
import { Screen } from '@/components/ui';
import { colors } from '@/lib/theme';
import type { TemplateExerciseInsert } from '@/types/database';
import CreateRoutineChoiceModal from '@/components/coach/CreateRoutineChoiceModal';

export default function NovoTemplateScreen() {
  const router = useRouter();
  const create = useCreateTemplate();
  const [choiceOpen, setChoiceOpen] = useState(true);

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
            <Text className="text-text font-semibold">Novo template</Text>
            <View style={{ width: 40 }} />
          </View>

          <RoutineEditor
            submitLabel="Salvar template"
            loading={create.isPending}
            onSubmit={async (payload) => {
              await create.mutateAsync({
                name: payload.name,
                modality: payload.modality,
                groupId: payload.groupId,
                description: payload.description,
                exercises: payload.exercises as TemplateExerciseInsert[],
              });
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              router.back();
            }}
          />
        </KeyboardAvoidingView>
      </Screen>

      <CreateRoutineChoiceModal
        visible={choiceOpen}
        destination="template"
        onClose={() => {
          setChoiceOpen(false);
          // Se o usuário só fechou (sem escolher), assume 'criar do zero'.
        }}
        onCreateFromScratch={() => setChoiceOpen(false)}
        onImportViaAi={() => {
          setChoiceOpen(false);
          router.replace('/(coach)/import-workout?destination=template' as Href);
        }}
      />
    </>
  );
}
