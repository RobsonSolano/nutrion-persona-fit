// Cadastro e edição de exercício pelo professor.
//
// Só chega aqui quem passa no `useCanCreateExercise` (professor premium) —
// o picker nem renderiza o botão pra mais ninguém. A policy de insert no
// banco é a rede de segurança contra um cliente com anon key.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, Trash2, X } from 'lucide-react-native';
import { Button, Card, ConfirmModal, Input } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import {
  useDeleteExercise,
  useExerciseGroups,
  useSaveExercise,
} from '@/hooks/useExercises';
import { MAX_EXERCISE_IMAGES } from '@/services/exercises';
import {
  defaultRequiresLowerLimbs,
  findDuplicateExercise,
  validateExerciseForm,
  type ExerciseFormValues,
  type ExerciseValidationError,
} from '@/lib/exercisePayload';
import { colors } from '@/lib/theme';
import {
  MODALITY_LABELS,
  type Exercise,
  type Modality,
} from '@/types/database';

const MODALITIES: Modality[] = [
  'musculacao',
  'calistenia',
  'crossfit',
  'corrida',
  'generico',
];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Presente = modo edição. */
  exercise?: Exercise | null;
  initialGroupId: string | null;
  initialModality: Modality;
  /** Catálogo visível do grupo, pra checagem de duplicata. */
  catalog: Exercise[];
  onSaved: (exercise: Exercise) => void;
  onDeleted: () => void;
};

export default function ExerciseFormModal({
  visible,
  onClose,
  exercise,
  initialGroupId,
  initialModality,
  catalog,
  onSaved,
  onDeleted,
}: Props) {
  const insets = useSafeAreaInsets();
  const { showAlert, showError } = useAlert();
  const groupsQ = useExerciseGroups();
  const saveM = useSaveExercise();
  const deleteM = useDeleteExercise();

  const editando = !!exercise;

  const [values, setValues] = useState<ExerciseFormValues>(() =>
    valoresIniciais(),
  );
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [erros, setErros] = useState<ExerciseValidationError[]>([]);
  const [duplicata, setDuplicata] = useState<Exercise | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  /** O professor já decidiu o toggle de perna nesta abertura? */
  const [tocouPerna, setTocouPerna] = useState(false);

  function valoresIniciais(): ExerciseFormValues {
    const groupId = exercise?.group_id ?? initialGroupId ?? '';
    const slug = groupsQ.data?.find((g) => g.id === groupId)?.slug ?? null;
    return {
      name: exercise?.name ?? '',
      groupId,
      modality: exercise?.modality ?? initialModality,
      equipment: exercise?.equipment ?? '',
      visibility: exercise?.visibility ?? 'exclusivo',
      videoUrl: exercise?.video_url ?? '',
      requiresLowerLimbs:
        exercise?.requires_lower_limbs ?? defaultRequiresLowerLimbs(slug),
    };
  }

  // Reinicializa a cada abertura — sem isso o form guardaria o estado da
  // vez anterior (mesmo padrão do ExercisePickerModal).
  useEffect(() => {
    if (!visible) return;
    setValues(valoresIniciais());
    setImageUris(exercise?.image_urls ?? []);
    setErros([]);
    setDuplicata(null);
    setTocouPerna(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, exercise]);

  // Único lugar que deriva o toggle de perna a partir do grupo. É um efeito
  // e não parte do `patch` porque `useExerciseGroups` pode responder DEPOIS
  // do modal abrir — nesse caso o slug seria null e o default cairia em
  // "Sim" pra um exercício de peito, sem nunca ser recalculado.
  //
  // Não roda em edição (o valor salvo é a verdade) nem depois de o
  // professor mexer no toggle.
  useEffect(() => {
    if (!visible || editando || tocouPerna) return;
    const slug =
      groupsQ.data?.find((g) => g.id === values.groupId)?.slug ?? null;
    setValues((prev) => ({
      ...prev,
      requiresLowerLimbs: defaultRequiresLowerLimbs(slug),
    }));
  }, [visible, editando, tocouPerna, groupsQ.data, values.groupId]);

  function patch(p: Partial<ExerciseFormValues>) {
    setValues((prev) => ({ ...prev, ...p }));
    setErros([]);
  }

  const erroDe = (field: ExerciseValidationError['field']) =>
    erros.find((e) => e.field === field)?.message;

  async function escolherFoto(source: 'camera' | 'library') {
    if (imageUris.length >= MAX_EXERCISE_IMAGES) return;
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert({
        title: 'Permissão necessária',
        message: `Precisamos de acesso à ${
          source === 'camera' ? 'câmera' : 'galeria'
        } pra anexar a demonstração do exercício.`,
      });
      return;
    }
    setPickingPhoto(true);
    try {
      const launcher =
        source === 'camera'
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;
      const picked = await launcher({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        exif: false,
        allowsEditing: false,
      });
      // O resize acontece no serviço, no momento do upload.
      if (!picked.canceled && picked.assets[0]) {
        setImageUris((prev) => [...prev, picked.assets[0].uri]);
      }
    } catch (err) {
      showError(err);
    } finally {
      setPickingPhoto(false);
    }
  }

  async function persistir() {
    try {
      const salvo = await saveM.mutateAsync({
        values,
        imageUris,
        exerciseId: exercise?.id,
      });
      onSaved(salvo);
      onClose();
    } catch (err) {
      // Mantém o form preenchido: perder o que foi digitado (e as fotos
      // escolhidas) na hora do erro seria a pior hora possível.
      showError(err);
    }
  }

  async function handleSalvar() {
    const encontrados = validateExerciseForm(values);
    if (encontrados.length > 0) {
      setErros(encontrados);
      return;
    }
    const dup = findDuplicateExercise(
      values.name,
      values.groupId,
      catalog,
      exercise?.id,
    );
    if (dup) {
      setDuplicata(dup);
      return;
    }
    await persistir();
  }

  async function handleExcluir() {
    if (!exercise) return;
    try {
      await deleteM.mutateAsync(exercise);
      setConfirmDelete(false);
      onDeleted();
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      showError(err);
    }
  }

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        onRequestClose={onClose}
        transparent={false}
      >
        <View className="flex-1 bg-bg-deep">
          <View
            className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle"
            style={{ paddingTop: Math.max(insets.top, 16) + 4 }}
          >
            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
            >
              <X size={18} color={colors.textDim} />
            </Pressable>
            <Text className="text-text font-semibold">
              {editando ? 'Editar exercício' : 'Novo exercício'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={{
              padding: 20,
              gap: 14,
              paddingBottom: Math.max(insets.bottom, 16) + 44,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label="Título"
              value={values.name}
              onChangeText={(v) => patch({ name: v })}
              placeholder="Ex: Supino Ravi"
              error={erroDe('name')}
            />

            <Card padding="md">
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                Grupo muscular
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {(groupsQ.data ?? []).map((g) => (
                  <Chip
                    key={g.id}
                    label={`${g.icon ?? ''} ${g.name}`}
                    on={values.groupId === g.id}
                    onPress={() => patch({ groupId: g.id })}
                  />
                ))}
              </View>
              {erroDe('groupId') && (
                <Text className="text-danger text-[11px] mt-2">
                  {erroDe('groupId')}
                </Text>
              )}
            </Card>

            <Card padding="md">
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                Tipo
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {MODALITIES.map((m) => (
                  <Chip
                    key={m}
                    label={MODALITY_LABELS[m]}
                    on={values.modality === m}
                    onPress={() => patch({ modality: m })}
                  />
                ))}
              </View>
            </Card>

            <Input
              label="Equipamento"
              hint="Opcional"
              value={values.equipment}
              onChangeText={(v) => patch({ equipment: v })}
              placeholder="Ex: Barra, halteres, máquina..."
            />

            <Card padding="md">
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
                Exige uso das pernas?
              </Text>
              <View className="flex-row gap-2">
                <Chip
                  label="Sim"
                  on={values.requiresLowerLimbs}
                  onPress={() => {
                    setTocouPerna(true);
                    patch({ requiresLowerLimbs: true });
                  }}
                />
                <Chip
                  label="Não"
                  on={!values.requiresLowerLimbs}
                  onPress={() => {
                    setTocouPerna(true);
                    patch({ requiresLowerLimbs: false });
                  }}
                />
              </View>
              <Text className="text-text-muted text-[11px] mt-2 leading-relaxed">
                Quem declarou não ter função de perna não recebe este
                exercício nos planos gerados pela IA.
              </Text>
            </Card>

            <Card padding="md">
              <Text className="text-text-muted text-[11px] mb-3 leading-relaxed">
                Exclusivo: só você e seus alunos veem. Público: entra no
                catálogo do app.
              </Text>
              <View className="flex-row gap-2">
                <Chip
                  label="Exclusivo"
                  on={values.visibility === 'exclusivo'}
                  onPress={() => patch({ visibility: 'exclusivo' })}
                />
                <Chip
                  label="Público"
                  on={values.visibility === 'publico'}
                  onPress={() => patch({ visibility: 'publico' })}
                />
              </View>
            </Card>

            <Card padding="md">
              <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
                Imagens (até {MAX_EXERCISE_IMAGES})
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {imageUris.map((uri, i) => (
                  <View key={`${uri}-${i}`} className="relative">
                    <Image
                      source={{ uri }}
                      style={{ width: 96, height: 96, borderRadius: 12 }}
                    />
                    <Pressable
                      onPress={() =>
                        setImageUris((prev) => prev.filter((_, j) => j !== i))
                      }
                      hitSlop={10}
                      className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-surface-raised border border-border items-center justify-center active:opacity-70"
                    >
                      <X size={13} color={colors.textDim} />
                    </Pressable>
                  </View>
                ))}
                {pickingPhoto && (
                  <View
                    className="items-center justify-center rounded-xl border border-border bg-surface-muted"
                    style={{ width: 96, height: 96 }}
                  >
                    <ActivityIndicator color={colors.accent} />
                  </View>
                )}
              </View>

              {imageUris.length < MAX_EXERCISE_IMAGES && !pickingPhoto && (
                <View className="flex-row gap-2 mt-3">
                  <Pressable
                    onPress={() => void escolherFoto('library')}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-muted py-3 active:opacity-70"
                  >
                    <ImageIcon size={15} color={colors.textDim} />
                    <Text className="text-text-dim text-xs font-semibold">
                      Galeria
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void escolherFoto('camera')}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-muted py-3 active:opacity-70"
                  >
                    <Camera size={15} color={colors.textDim} />
                    <Text className="text-text-dim text-xs font-semibold">
                      Câmera
                    </Text>
                  </Pressable>
                </View>
              )}
            </Card>

            <Input
              label="Vídeo do YouTube"
              hint="Opcional"
              value={values.videoUrl}
              onChangeText={(v) => patch({ videoUrl: v })}
              placeholder="https://youtu.be/..."
              autoCapitalize="none"
              error={erroDe('videoUrl')}
            />

            <Button
              label="Salvar exercício"
              onPress={handleSalvar}
              loading={saveM.isPending}
            />

            {editando && (
              <Pressable
                onPress={() => setConfirmDelete(true)}
                className="flex-row items-center justify-center gap-2 py-3 active:opacity-70"
              >
                <Trash2 size={15} color={colors.danger} />
                <Text className="text-danger text-xs font-semibold">
                  Excluir exercício
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>

      <ConfirmModal
        visible={!!duplicata}
        onClose={() => setDuplicata(null)}
        title={`Já existe "${duplicata?.name ?? ''}"`}
        message="Nesse grupo já tem um exercício com esse nome. Quer usar o que existe ou cadastrar outro do mesmo jeito?"
        actions={[
          {
            label: 'Usar o existente',
            variant: 'primary',
            onPress: () => {
              const dup = duplicata;
              setDuplicata(null);
              if (dup) {
                onSaved(dup);
                onClose();
              }
            },
          },
          {
            label: 'Cadastrar mesmo assim',
            variant: 'secondary',
            onPress: () => {
              setDuplicata(null);
              void persistir();
            },
          },
          {
            label: 'Cancelar',
            variant: 'ghost',
            onPress: () => setDuplicata(null),
          },
        ]}
      />

      <ConfirmModal
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Excluir "${exercise?.name ?? ''}"?`}
        message="A rotina dos alunos continua com o nome, séries e cargas — só as imagens e o vídeo somem do preview."
        actions={[
          {
            label: 'Excluir',
            variant: 'danger',
            loading: deleteM.isPending,
            onPress: () => void handleExcluir(),
          },
          {
            label: 'Cancelar',
            variant: 'ghost',
            onPress: () => setConfirmDelete(false),
          },
        ]}
      />
    </>
  );
}

function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${
        on ? 'bg-accent/10 border-accent/40' : 'bg-surface-muted border-border'
      }`}
    >
      <Text className={`text-xs ${on ? 'text-accent' : 'text-text-dim'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
