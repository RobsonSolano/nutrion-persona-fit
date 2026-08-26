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
  Archive,
  ArchiveRestore,
  Trash2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import RoutineEditor from '@/components/routine/RoutineEditor';
import ExerciseImagesModal from '@/components/routine/ExerciseImagesModal';
import ExerciseReadRow from '@/components/routine/ExerciseReadRow';
import {
  useArchiveTemplate,
  useDeleteTemplate,
  useTemplateDetail,
  useUnarchiveTemplate,
  useUpdateTemplate,
} from '@/hooks/useTemplates';
import { useExerciseImagesMap } from '@/hooks/useExercises';
import { Button, Card, Screen } from '@/components/ui';
import { colors } from '@/lib/theme';
import {
  MODALITY_LABELS,
  type TemplateExerciseInsert,
} from '@/types/database';
import { toExerciseInsert } from '@/lib/exerciseInsert';

export default function TemplateDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detailQ = useTemplateDetail(id ?? null);
  const update = useUpdateTemplate();
  const archive = useArchiveTemplate();
  const unarchive = useUnarchiveTemplate();
  const remove = useDeleteTemplate();
  const imagesMap = useExerciseImagesMap();

  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    equipment: string | null;
    images: string[];
  } | null>(null);

  if (!id) return null;

  const isArchived = detailQ.data?.is_archived ?? false;

  function handleArchiveToggle() {
    if (!detailQ.data) return;
    const action = isArchived ? unarchive : archive;
    action.mutate(detailQ.data.id, {
      onSuccess: () => {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        router.back();
      },
      onError: (err) => {
        Alert.alert(
          'Não consegui salvar',
          err instanceof Error ? err.message : 'Tenta de novo.',
        );
      },
    });
  }

  function handleDelete() {
    Alert.alert(
      'Excluir template?',
      'As rotinas já aplicadas em alunos não serão afetadas (cópias independentes). Mas o template some da biblioteca pra sempre.',
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
              {editing ? 'Editar template' : detailQ.data?.name ?? 'Template'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {detailQ.isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : !detailQ.data ? (
            <View className="flex-1 items-center justify-center p-8">
              <Text className="text-text-dim">Template não encontrado.</Text>
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
                  exercises: payload.exercises as TemplateExerciseInsert[],
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
              <Card glow accent="violet">
                <View className="flex-row items-center gap-3">
                  <View className="h-12 w-12 rounded-2xl bg-violet/10 border border-violet/30 items-center justify-center">
                    <Text className="text-xl">
                      {detailQ.data.group?.icon ?? '📚'}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-text text-xl font-bold"
                      numberOfLines={2}
                    >
                      {detailQ.data.name}
                    </Text>
                    <Text className="text-text-dim text-xs mt-0.5">
                      {MODALITY_LABELS[detailQ.data.modality]} ·{' '}
                      {detailQ.data.group?.name ?? 'Treino livre'} ·{' '}
                      {detailQ.data.exercises.length} exercícios
                    </Text>
                  </View>
                </View>
                {isArchived && (
                  <View className="flex-row items-center gap-2 mt-3 rounded-2xl border border-border bg-surface-muted px-3 py-2">
                    <Archive size={14} color={colors.textMuted} />
                    <Text className="text-text-muted text-[11px] font-semibold flex-1">
                      Arquivado — não aparece no picker
                    </Text>
                  </View>
                )}
                {detailQ.data.description && (
                  <Text className="text-text-dim text-sm mt-4 leading-relaxed">
                    {detailQ.data.description}
                  </Text>
                )}
              </Card>

              <Card padding="md">
                <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                  Prescrição
                </Text>
                {detailQ.data.exercises.length === 0 ? (
                  <Text className="text-text-muted text-sm text-center py-4">
                    Nenhum exercício no template.
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

              <Button
                label="Editar template"
                onPress={() => setEditing(true)}
                variant="secondary"
                icon={<Pencil size={16} color={colors.text} />}
              />
              <Button
                label={isArchived ? 'Desarquivar' : 'Arquivar'}
                onPress={handleArchiveToggle}
                loading={archive.isPending || unarchive.isPending}
                variant="ghost"
                icon={
                  isArchived ? (
                    <ArchiveRestore size={16} color={colors.textDim} />
                  ) : (
                    <Archive size={16} color={colors.textDim} />
                  )
                }
              />
              <Button
                label="Excluir template"
                onPress={handleDelete}
                variant="danger"
                icon={<Trash2 size={16} color={colors.danger} />}
              />
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Screen>

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

