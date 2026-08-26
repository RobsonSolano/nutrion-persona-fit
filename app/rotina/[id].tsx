import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  X,
  Pencil,
  Trash2,
  GraduationCap,
  BookmarkPlus,
  Play,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import RoutineEditor from '@/components/routine/RoutineEditor';
import ExerciseImagesModal from '@/components/routine/ExerciseImagesModal';
import ExerciseReadRow from '@/components/routine/ExerciseReadRow';
import SaveAsTemplateModal from '@/components/coach/SaveAsTemplateModal';
import {
  useDeleteRoutine,
  useRoutineDetail,
  useUpdateRoutine,
} from '@/hooks/useRoutines';
import { useCreateTemplate } from '@/hooks/useTemplates';
import { useExerciseImagesMap } from '@/hooks/useExercises';
import { useProfile } from '@/hooks/useProfile';
import { useStartWorkoutFlow } from '@/hooks/useStartWorkoutFlow';
import { useAlert } from '@/components/GlobalAlertProvider';
import { Button, Card, Screen } from '@/components/ui';
import Disclaimer from '@/components/Disclaimer';
import { colors } from '@/lib/theme';
import { MODALITY_LABELS } from '@/types/database';
import { toExerciseInsert } from '@/lib/exerciseInsert';

export default function RotinaDetalheScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQ = useRoutineDetail(id ?? null);
  const profileQ = useProfile();
  const update = useUpdateRoutine();
  const remove = useDeleteRoutine();
  const imagesMap = useExerciseImagesMap();

  const isStudent = profileQ.data?.role === 'aluno';
  const isCoach = profileQ.data?.role === 'professor';
  const fromCoach = !!detailQ.data?.created_by_coach;
  const readOnly = isStudent && fromCoach;
  const createTemplate = useCreateTemplate();
  const alert = useAlert();
  const { requestStart, active: activeWorkout } = useStartWorkoutFlow();

  function handleStart() {
    if (!detailQ.data) return;
    requestStart({ id: detailQ.data.id, name: detailQ.data.name });
  }

  const [editing, setEditing] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    equipment: string | null;
    images: string[];
  } | null>(null);

  if (!id) return null;

  async function handleSaveAsTemplate(name: string) {
    if (!detailQ.data) return;
    try {
      await createTemplate.mutateAsync({
        name,
        modality: detailQ.data.modality,
        groupId: detailQ.data.group_id,
        description: detailQ.data.description,
        exercises: detailQ.data.exercises.map(toExerciseInsert),
      });
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
      setSaveTemplateOpen(false);
      alert.showAlert({
        title: 'Salvo na biblioteca',
        message: `Template "${name}" criado.`,
        type: 'success',
      });
    } catch (err) {
      alert.showError(err);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Excluir treino?',
      'Essa ação não pode ser desfeita. As sessões antigas mantêm o nome salvo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(id!);
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              router.back();
            } catch (err) {
              Alert.alert(
                'Não consegui excluir',
                err instanceof Error ? err.message : 'Tenta de novo.',
              );
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'slide_from_right',
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
            <Text className="text-text font-semibold" numberOfLines={1}>
              {editing ? 'Editar treino' : detailQ.data?.name ?? 'Treino'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {detailQ.isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : !detailQ.data ? (
            <View className="flex-1 items-center justify-center p-8">
              <Text className="text-text-dim">Treino não encontrado.</Text>
            </View>
          ) : editing ? (
            <RoutineEditor
              initialName={detailQ.data.name}
              initialDescription={detailQ.data.description ?? ''}
              initialModality={detailQ.data.modality}
              initialGroupId={detailQ.data.group_id}
              initialExercises={detailQ.data.exercises.map(toExerciseInsert)}
              submitLabel="Salvar alterações"
              loading={update.isPending}
              onSubmit={async (payload) => {
                await update.mutateAsync({
                  id: id!,
                  patch: {
                    name: payload.name,
                    modality: payload.modality,
                    group_id: payload.groupId,
                    description: payload.description,
                  },
                  exercises: payload.exercises,
                });
                void Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
                setEditing(false);
              }}
            />
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              <Card glow accent={fromCoach ? 'violet' : 'green'}>
                <View className="flex-row items-center gap-3">
                  <View className="h-12 w-12 rounded-2xl bg-accent/10 border border-accent/30 items-center justify-center">
                    <Text className="text-xl">
                      {detailQ.data.group?.icon ?? '💪'}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-text text-xl font-bold" numberOfLines={2}>
                      {detailQ.data.name}
                    </Text>
                    <Text className="text-text-dim text-xs mt-0.5">
                      {MODALITY_LABELS[detailQ.data.modality]} ·{' '}
                      {detailQ.data.group?.name ?? 'Treino livre'} ·{' '}
                      {detailQ.data.exercises.length} exercícios
                    </Text>
                  </View>
                </View>
                {fromCoach && (
                  <View className="flex-row items-center gap-2 mt-3 rounded-2xl border border-violet/40 bg-violet/10 px-3 py-2">
                    <GraduationCap size={14} color={colors.violetSoft} />
                    <Text className="text-violet-soft text-[11px] font-semibold flex-1">
                      Criado pelo seu professor
                    </Text>
                    {readOnly && (
                      <Text className="text-text-muted text-[10px]">
                        Somente leitura
                      </Text>
                    )}
                  </View>
                )}
                {detailQ.data.description && (
                  <Text className="text-text-dim text-sm mt-4 leading-relaxed">
                    {detailQ.data.description}
                  </Text>
                )}
              </Card>

              {!isCoach && (
                <Button
                  label={
                    activeWorkout?.routineId === detailQ.data.id
                      ? 'Ver treino em andamento'
                      : 'Iniciar treino'
                  }
                  onPress={handleStart}
                  icon={<Play size={18} color={colors.textInverse} fill={colors.textInverse} />}
                />
              )}

              <Card padding="md">
                <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                  Prescrição
                </Text>
                {detailQ.data.exercises.length === 0 ? (
                  <Text className="text-text-muted text-sm text-center py-4">
                    Este treino ainda não tem exercícios.
                  </Text>
                ) : (
                  <View className="gap-3">
                    {detailQ.data.exercises.map((e, i) => {
                      const imgs = e.exercise_id
                        ? imagesMap.get(e.exercise_id) ?? null
                        : null;
                      return (
                        <ExerciseReadRow
                          key={e.id}
                          exercise={e}
                          index={i}
                          imageUrls={imgs}
                          onPreview={
                            imgs
                              ? () =>
                                  setPreview({
                                    name: e.exercise_name,
                                    equipment: e.equipment,
                                    images: imgs,
                                  })
                              : undefined
                          }
                        />
                      );
                    })}
                  </View>
                )}
              </Card>

              {readOnly ? (
                <Card padding="sm">
                  <Text className="text-text-muted text-[11px] leading-relaxed">
                    💡 Pra ajustar esse treino, abra uma solicitação no seu
                    perfil. Seu professor recebe e responde.
                  </Text>
                </Card>
              ) : (
                <>
                  <Button
                    label="Editar treino"
                    onPress={() => setEditing(true)}
                    variant="secondary"
                    icon={<Pencil size={16} color={colors.text} />}
                  />
                  {isCoach && (
                    <Button
                      label="Salvar como template"
                      onPress={() => setSaveTemplateOpen(true)}
                      variant="ghost"
                      icon={
                        <BookmarkPlus size={16} color={colors.violetSoft} />
                      }
                    />
                  )}
                  <Button
                    label="Excluir treino"
                    onPress={handleDelete}
                    variant="danger"
                    icon={<Trash2 size={16} color={colors.danger} />}
                  />
                </>
              )}
              <Disclaimer />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Screen>

      <SaveAsTemplateModal
        visible={saveTemplateOpen}
        onClose={() => setSaveTemplateOpen(false)}
        defaultName={detailQ.data?.name ?? ''}
        loading={createTemplate.isPending}
        onConfirm={handleSaveAsTemplate}
      />

      <ExerciseImagesModal
        visible={!!preview}
        onClose={() => setPreview(null)}
        exerciseName={preview?.name ?? ''}
        equipment={preview?.equipment}
        imageUrls={preview?.images ?? []}
      />
    </>
  );
}

