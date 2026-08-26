import { Pressable, Text, View } from 'react-native';
import { Check, Clock, CirclePlay, Gauge, Route } from 'lucide-react-native';
import {
  formatCardioMetrics,
  type ChipMetrica,
} from '@/lib/cardioMetrics';
import type { MetricType } from '@/types/database';
import PreviewEyeButton from './PreviewEyeButton';
import { colors } from '@/lib/theme';
import { openYouTubeSearchForExercise } from '@/lib/youtube';

// Mapa em vez de ternário aninhado dentro do map — mesmo padrão de
// MODALITY_LABELS em types/database.ts.
const CHIP_ICON: Record<
  ChipMetrica['kind'],
  { Icon: typeof Route; color: string }
> = {
  distance: { Icon: Route, color: colors.accent },
  duration: { Icon: Clock, color: colors.info },
  cadence: { Icon: Gauge, color: colors.info },
};

export type ReadableExercise = {
  exercise_id: string | null;
  exercise_name: string;
  equipment: string | null;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  duration_min: number | null;
  metric_type?: MetricType;
  distance_min_m?: number | null;
  distance_max_m?: number | null;
  cadence_rpm?: number | null;
  notes: string | null;
};

type Props = {
  exercise: ReadableExercise;
  index: number;
  imageUrls: string[] | null;
  onPreview?: () => void;
};

export default function ExerciseReadRow({
  exercise,
  index,
  imageUrls,
  onPreview,
}: Props) {
  const repRange = formatRange(exercise.reps_min, exercise.reps_max);
  const weightRange = formatRange(
    exercise.weight_min_kg,
    exercise.weight_max_kg,
  );
  const hasImages = !!imageUrls && imageUrls.length > 0;

  return (
    <View className="rounded-2xl border border-border bg-surface-muted p-3">
      <View className="flex-row items-center gap-2">
        <Text className="text-text-muted text-[10px] w-5">#{index + 1}</Text>
        <View className="flex-1">
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>
            {exercise.exercise_name}
          </Text>
          {exercise.equipment && (
            <Text className="text-text-muted text-[10px] mt-0.5">
              {exercise.equipment}
            </Text>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          {hasImages && onPreview && <PreviewEyeButton onPress={onPreview} />}
          <Pressable
            onPress={() => openYouTubeSearchForExercise(exercise.exercise_name)}
            hitSlop={8}
            className="h-8 w-8 rounded-lg bg-surface border border-border items-center justify-center active:opacity-70"
          >
            <CirclePlay size={14} color={colors.danger} />
          </Pressable>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2 mt-2">
        {exercise.metric_type === 'cardio' ? (
          // Cárdio não usa séries/carga — mostra distância, tempo e cadência.
          formatCardioMetrics(exercise).map((chip) => {
            const { Icon, color } = CHIP_ICON[chip.kind];
            return (
              <Pill
                key={chip.kind}
                icon={<Icon size={10} color={color} />}
                label={chip.label}
              />
            );
          })
        ) : (
          <>
            {exercise.sets != null && (
              <Pill
                icon={<Check size={10} color={colors.accent} />}
                label={`${exercise.sets} séries`}
              />
            )}
            {repRange && <Pill label={`${repRange} reps`} />}
            {weightRange && <Pill label={`${weightRange} kg`} />}
            {exercise.duration_min != null && (
              <Pill
                icon={<Clock size={10} color={colors.info} />}
                label={`${exercise.duration_min} min`}
              />
            )}
          </>
        )}
      </View>
      {exercise.notes && (
        <Text className="text-text-muted text-xs mt-2 italic">
          {exercise.notes}
        </Text>
      )}
    </View>
  );
}

function Pill({
  icon,
  label,
}: {
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1">
      {icon}
      <Text className="text-text-dim text-[11px]">{label}</Text>
    </View>
  );
}

function formatRange(min: number | null, max: number | null): string | null {
  if (min != null && max != null && min !== max) return `${min}-${max}`;
  if (max != null) return String(max);
  if (min != null) return String(min);
  return null;
}
