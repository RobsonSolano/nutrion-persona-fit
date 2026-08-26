import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { Plus, Trash2, Save, CirclePlay } from 'lucide-react-native';
import { openYouTubeSearchForExercise } from '@/lib/youtube';
import * as Haptics from 'expo-haptics';
import {
  useExerciseGroups,
  useExerciseImagesMap,
} from '@/hooks/useExercises';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { Button, Card, Input } from '@/components/ui';
import { useAlert } from '@/components/GlobalAlertProvider';
import { colors } from '@/lib/theme';
import {
  horaMinParaMinutos,
  metricTypeFromGroup,
  minutosParaHoraMin,
  validateCardioMetrics,
} from '@/lib/cardioMetrics';
import {
  MODALITY_LABELS,
  type Exercise,
  type ExerciseGroup,
  type Modality,
  type RoutineExerciseInsert,
} from '@/types/database';
import ExercisePickerModal from './ExercisePickerModal';
import ExerciseImagesModal from './ExerciseImagesModal';
import PreviewEyeButton from './PreviewEyeButton';

type Draft = RoutineExerciseInsert & { localId: string };

const MODALITIES: Modality[] = [
  'musculacao',
  'calistenia',
  'crossfit',
  'corrida',
  'generico',
];

type Props = {
  initialName?: string;
  initialDescription?: string;
  initialModality?: Modality;
  initialGroupId?: string | null;
  initialExercises?: RoutineExerciseInsert[];
  submitLabel: string;
  loading?: boolean;
  onSubmit: (payload: {
    name: string;
    modality: Modality;
    groupId: string | null;
    description: string | null;
    exercises: RoutineExerciseInsert[];
  }) => void | Promise<void>;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toInt(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Math.round(Number(v.replace(',', '.')));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toNum(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function RoutineEditor(props: Props) {
  const kbHeight = useKeyboardHeight();
  const groupsQ = useExerciseGroups();
  const imagesMap = useExerciseImagesMap();

  const [name, setName] = useState(props.initialName ?? '');
  const [description, setDescription] = useState(props.initialDescription ?? '');
  const [modality, setModality] = useState<Modality>(
    props.initialModality ?? 'musculacao',
  );
  const [groupId, setGroupId] = useState<string | null>(
    props.initialGroupId ?? null,
  );
  const [drafts, setDrafts] = useState<Draft[]>(
    (props.initialExercises ?? []).map((e) => ({ ...e, localId: uid() })),
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    name: string;
    equipment: string | null;
    images: string[];
  } | null>(null);
  const alert = useAlert();
  const scrollRef = useRef<ScrollView>(null);
  const seriesRefs = useRef<Map<string, TextInput>>(new Map());

  const group =
    groupsQ.data?.find((g) => g.id === groupId) ?? null;

  const addedExerciseIds = useMemo(
    () =>
      new Set(
        drafts.map((d) => d.exercise_id).filter((v): v is string => !!v),
      ),
    [drafts],
  );

  function handleAddExercise(ex: Exercise) {
    const localId = uid();
    // O tipo vem do grupo do EXERCÍCIO escolhido, não do grupo da rotina: o
    // picker permite pegar de outro grupo, e uma rotina de musculação com
    // esteira no fim é caso comum.
    const grupoDoExercicio =
      groupsQ.data?.find((g) => g.id === ex.group_id) ?? null;
    setDrafts((prev) => [
      ...prev,
      {
        localId,
        exercise_id: ex.id,
        exercise_name: ex.name,
        equipment: ex.equipment,
        sort_order: prev.length,
        sets: null,
        reps_min: null,
        reps_max: null,
        weight_min_kg: null,
        weight_max_kg: null,
        duration_min: null,
        metric_type: metricTypeFromGroup(grupoDoExercicio?.slug),
        distance_min_m: null,
        distance_max_m: null,
        cadence_rpm: null,
        notes: null,
      },
    ]);
    setPendingFocusId(localId);
    void Haptics.selectionAsync();
    setPickerOpen(false);
  }

  // Quando o exercício recém adicionado monta, rola até o fim e foca o input de Séries.
  useEffect(() => {
    if (!pendingFocusId) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      seriesRefs.current.get(pendingFocusId)?.focus();
      setPendingFocusId(null);
    }, 120);
    return () => clearTimeout(t);
  }, [pendingFocusId]);

  function handleRemoveExercise(localId: string) {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
    seriesRefs.current.delete(localId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function updateDraft(localId: string, patch: Partial<Draft>) {
    setDrafts((prev) =>
      prev.map((d) => (d.localId === localId ? { ...d, ...patch } : d)),
    );
  }

  async function handleSubmit() {
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      alert.showAlert({
        title: 'Nome do treino',
        message: 'Informe um nome (ex: Peito A).',
        type: 'warning',
      });
      return;
    }
    if (drafts.length === 0) {
      alert.showAlert({
        title: 'Sem exercícios',
        message: 'Adicione pelo menos um exercício ao treino.',
        type: 'warning',
      });
      return;
    }
    // CAR-03: a rede de cima. O banco também tem check constraint, mas aqui o
    // professor vê a mensagem antes de perder o preenchimento.
    for (const d of drafts) {
      if (d.metric_type !== 'cardio') continue;
      const erro = validateCardioMetrics(d);
      if (erro) {
        alert.showAlert({
          title: 'Métricas de cárdio',
          message: `${d.exercise_name}: ${erro}`,
          type: 'warning',
        });
        return;
      }
    }

    const exercises: RoutineExerciseInsert[] = drafts.map((d, i) => ({
      exercise_id: d.exercise_id,
      exercise_name: d.exercise_name,
      equipment: d.equipment,
      sort_order: i,
      metric_type: d.metric_type,
      distance_min_m: d.distance_min_m,
      distance_max_m: d.distance_max_m,
      cadence_rpm: d.cadence_rpm,
      sets: d.sets,
      reps_min: d.reps_min,
      reps_max: d.reps_max,
      weight_min_kg: d.weight_min_kg,
      weight_max_kg: d.weight_max_kg,
      duration_min: d.duration_min,
      notes: d.notes,
    }));
    try {
      await props.onSubmit({
        name: cleanName,
        modality,
        groupId,
        description: description.trim() || null,
        exercises,
      });
    } catch (err) {
      alert.showError(err);
    }
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{
        padding: 20,
        gap: 16,
        paddingBottom: 40 + (Platform.OS === 'android' ? kbHeight : 0),
      }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <Card padding="md">
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
          Dados do treino
        </Text>
        <View className="gap-3">
          <ModalityPicker
            selected={modality}
            onSelect={(m) => {
              if (m === modality) return;
              if (drafts.length > 0) {
                Alert.alert(
                  'Trocar modalidade',
                  `Os ${drafts.length} exercício(s) adicionado(s) serão removidos porque pertencem à modalidade ${MODALITY_LABELS[modality]}.`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Trocar',
                      style: 'destructive',
                      onPress: () => {
                        setDrafts([]);
                        setModality(m);
                      },
                    },
                  ],
                );
              } else {
                setModality(m);
              }
            }}
          />
          <Input
            label="Nome"
            value={name}
            onChangeText={setName}
            placeholder="Ex: Peito A, Costas, Cardio 30min"
          />
          <Input
            label="Descrição (opcional)"
            value={description}
            onChangeText={setDescription}
            placeholder="Ex: força + hipertrofia, 60min"
            multiline
          />
          <GroupPicker
            groups={groupsQ.data ?? []}
            selectedId={groupId}
            onSelect={setGroupId}
          />
        </View>
      </Card>

      <Card padding="md">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-text-dim text-[11px] uppercase tracking-widest">
            Exercícios ({drafts.length})
          </Text>
          <Pressable
            onPress={() => setPickerOpen(true)}
            hitSlop={8}
            className="flex-row items-center gap-1.5 rounded-full bg-accent/10 border border-accent/40 px-3 py-1 active:opacity-70"
          >
            <Plus size={12} color={colors.accent} />
            <Text className="text-accent text-[11px] font-semibold">
              Adicionar
            </Text>
          </Pressable>
        </View>

        {drafts.length === 0 ? (
          <Text className="text-text-muted text-xs text-center py-6">
            Nenhum exercício ainda. Toque em &quot;Adicionar&quot;.
          </Text>
        ) : (
          <View className="gap-3">
            {drafts.map((d, i) => {
              const imgs = d.exercise_id
                ? imagesMap.get(d.exercise_id) ?? null
                : null;
              return (
                <ExerciseDraftRow
                  key={d.localId}
                  draft={d}
                  index={i}
                  imageUrls={imgs}
                  onChange={(patch) => updateDraft(d.localId, patch)}
                  onRemove={() => handleRemoveExercise(d.localId)}
                  onPreview={() => {
                    if (!imgs) return;
                    setPreview({
                      name: d.exercise_name,
                      equipment: d.equipment,
                      images: imgs,
                    });
                  }}
                  setsRef={(el) => {
                    if (el) seriesRefs.current.set(d.localId, el);
                    else seriesRefs.current.delete(d.localId);
                  }}
                />
              );
            })}
          </View>
        )}
      </Card>

      <Button
        label={props.submitLabel}
        onPress={handleSubmit}
        loading={props.loading}
        icon={<Save size={18} color={colors.textInverse} />}
      />

      <ExercisePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        modality={modality}
        preferredGroupId={groupId}
        addedExerciseIds={addedExerciseIds}
        onSelect={handleAddExercise}
      />

      <ExerciseImagesModal
        visible={!!preview}
        onClose={() => setPreview(null)}
        exerciseName={preview?.name ?? ''}
        equipment={preview?.equipment}
        imageUrls={preview?.images ?? []}
      />
    </ScrollView>
  );
}

// ---------- Subcomponents ----------

function ModalityPicker({
  selected,
  onSelect,
}: {
  selected: Modality;
  onSelect: (m: Modality) => void;
}) {
  return (
    <View>
      <Text className="text-text-dim text-xs uppercase tracking-widest mb-2">
        Modalidade
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MODALITIES.map((m) => (
          <Pressable
            key={m}
            onPress={() => onSelect(m)}
            className={`rounded-full border px-3 py-1.5 ${
              selected === m
                ? 'bg-accent/10 border-accent/40'
                : 'bg-surface-muted border-border'
            }`}
          >
            <Text
              className={`text-xs ${
                selected === m ? 'text-accent' : 'text-text-dim'
              }`}
            >
              {MODALITY_LABELS[m]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function GroupPicker({
  groups,
  selectedId,
  onSelect,
}: {
  groups: ExerciseGroup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <View>
      <Text className="text-text-dim text-xs uppercase tracking-widest mb-2">
        Grupo muscular (opcional)
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Pressable
          onPress={() => onSelect(null)}
          className={`rounded-full border px-3 py-1.5 ${
            selectedId === null
              ? 'bg-accent/10 border-accent/40'
              : 'bg-surface-muted border-border'
          }`}
        >
          <Text
            className={`text-xs ${
              selectedId === null ? 'text-accent' : 'text-text-dim'
            }`}
          >
            Livre
          </Text>
        </Pressable>
        {groups.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => onSelect(g.id)}
            className={`rounded-full border px-3 py-1.5 ${
              selectedId === g.id
                ? 'bg-accent/10 border-accent/40'
                : 'bg-surface-muted border-border'
            }`}
          >
            <Text
              className={`text-xs ${
                selectedId === g.id ? 'text-accent' : 'text-text-dim'
              }`}
            >
              {g.icon} {g.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ExerciseDraftRow({
  draft,
  index,
  imageUrls,
  onChange,
  onRemove,
  onPreview,
  setsRef,
}: {
  draft: Draft;
  index: number;
  imageUrls: string[] | null;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
  onPreview: () => void;
  setsRef?: (el: TextInput | null) => void;
}) {
  const hasImages = !!imageUrls && imageUrls.length > 0;
  return (
    <View className="rounded-2xl border border-border bg-surface-muted p-3">
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-1 pr-2">
          <Text className="text-text-muted text-[10px]">#{index + 1}</Text>
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>
            {draft.exercise_name}
          </Text>
          {draft.equipment && (
            <Text className="text-text-muted text-[10px]">
              {draft.equipment}
            </Text>
          )}
        </View>
        {hasImages && <PreviewEyeButton onPress={onPreview} marginRight />}
        <Pressable
          onPress={() => openYouTubeSearchForExercise(draft.exercise_name)}
          hitSlop={8}
          className="h-8 w-8 rounded-lg bg-surface border border-border items-center justify-center active:opacity-70 mr-2"
        >
          <CirclePlay size={14} color={colors.danger} />
        </Pressable>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          className="h-8 w-8 rounded-lg bg-surface border border-border items-center justify-center active:opacity-70"
        >
          <Trash2 size={14} color={colors.danger} />
        </Pressable>
      </View>

      <View className="gap-2">
        {draft.metric_type === 'cardio' ? (
          <CardioFields draft={draft} onChange={onChange} setsRef={setsRef} />
        ) : (
          <StrengthFields draft={draft} onChange={onChange} setsRef={setsRef} />
        )}
      </View>
    </View>
  );
}

type FieldsProps = {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  /** Opcional como no componente pai — só o exercício recém-adicionado recebe. */
  setsRef?: (el: TextInput | null) => void;
};

/**
 * Cárdio não usa séries/reps/carga (CAR-05). Distância em METROS para casar com
 * o schema — sem conversão, sem arredondamento no meio do caminho.
 */
function CardioFields({ draft, onChange, setsRef }: FieldsProps) {
  // Horas e minutos separados: o banco guarda minutos, mas obrigar a digitar
  // "150" pra 2h30 é fazer o professor calcular de cabeça. Digitar mais de 59
  // minutos normaliza sozinho (90 → 1h30).
  const { horas, minutos } = minutosParaHoraMin(draft.duration_min);

  return (
    <>
      <View className="flex-row gap-2">
        <View style={{ flex: 1 }}>
          <SmallInput
            ref={setsRef}
            label="Dist. mín (m)"
            value={draft.distance_min_m?.toString() ?? ''}
            onChangeText={(v) => onChange({ distance_min_m: toInt(v) })}
            placeholder="3000"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Dist. máx (m)"
            value={draft.distance_max_m?.toString() ?? ''}
            onChangeText={(v) => onChange({ distance_max_m: toInt(v) })}
            placeholder="5000"
          />
        </View>
      </View>
      <View className="flex-row gap-2">
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Horas"
            value={horas?.toString() ?? ''}
            onChangeText={(v) =>
              onChange({ duration_min: horaMinParaMinutos(toInt(v), minutos) })
            }
            placeholder="0"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Minutos"
            value={minutos?.toString() ?? ''}
            onChangeText={(v) =>
              onChange({ duration_min: horaMinParaMinutos(horas, toInt(v)) })
            }
            placeholder="30"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Cadência (RPM)"
            value={draft.cadence_rpm?.toString() ?? ''}
            onChangeText={(v) => onChange({ cadence_rpm: toInt(v) })}
            placeholder="80"
          />
        </View>
      </View>
    </>
  );
}

function StrengthFields({ draft, onChange, setsRef }: FieldsProps) {
  return (
    <>
      <View className="flex-row gap-2">
        <View style={{ flex: 1 }}>
          <SmallInput
            ref={setsRef}
            label="Séries"
            value={draft.sets?.toString() ?? ''}
            onChangeText={(v) => onChange({ sets: toInt(v) })}
            placeholder="4"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Reps mín"
            value={draft.reps_min?.toString() ?? ''}
            onChangeText={(v) => onChange({ reps_min: toInt(v) })}
            placeholder="8"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Reps máx"
            value={draft.reps_max?.toString() ?? ''}
            onChangeText={(v) => onChange({ reps_max: toInt(v) })}
            placeholder="12"
          />
        </View>
      </View>
      <View className="flex-row gap-2">
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Peso mín (kg)"
            value={draft.weight_min_kg?.toString() ?? ''}
            onChangeText={(v) => onChange({ weight_min_kg: toNum(v) })}
            placeholder="60"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Peso máx (kg)"
            value={draft.weight_max_kg?.toString() ?? ''}
            onChangeText={(v) => onChange({ weight_max_kg: toNum(v) })}
            placeholder="80"
          />
        </View>
        <View style={{ flex: 1 }}>
          <SmallInput
            label="Minutos"
            value={draft.duration_min?.toString() ?? ''}
            onChangeText={(v) => onChange({ duration_min: toInt(v) })}
            placeholder="—"
          />
        </View>
      </View>
    </>
  );
}

type SmallInputProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
};

const SmallInput = forwardRef<TextInput, SmallInputProps>(function SmallInput(
  { label, value, onChangeText, placeholder },
  ref,
) {
  return (
    <View>
      <Text className="text-text-muted text-[9px] uppercase tracking-widest mb-1">
        {label}
      </Text>
      <Input
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
      />
    </View>
  );
});
