import { Text, View } from 'react-native';
import { Check, Clock, Gauge, Route } from 'lucide-react-native';
import {
  formatCardioMetrics,
  type ChipMetrica,
} from '@/lib/cardioMetrics';
import { TEXTO_SERIE_CONJUNTA } from '@/lib/conjuntos';
import type {
  ExercicioExibivel,
  ReadableExercise,
} from '@/lib/exercicioCard';
import PreviewEyeButton from './PreviewEyeButton';
import SerieConjuntaBadge from './SerieConjuntaBadge';
import VideoPlayButton from './VideoPlayButton';
import { colors } from '@/lib/theme';

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

type Props = {
  principal: ExercicioExibivel;
  /** Segundo exercício da série conjunta. Null = exercício solto. */
  conjunto: ExercicioExibivel | null;
  /** Índice do CARD, não da linha: um par conta como um só (CONJ-12). */
  index: number;
  onPreview?: () => void;
};

/**
 * Card de exercício na prescrição — CONJ-10/11/12.
 *
 * Com série conjunta o título vira "A + B" e cada exercício ganha seu próprio
 * bloco de métricas: séries, reps e carga são por exercício, não do par.
 *
 * Por que os dois caminhos não são unificados como no editor: no card solto o
 * cabeçalho É o exercício (nome, equipamento, play direto ali); no par o
 * cabeçalho é o PAR, e aí cada exercício precisa da própria caixa. Unificar
 * custaria uma linha a mais no card solto, que é a esmagadora maioria da lista.
 * O que é de fato comum — as pílulas de métrica — já está extraído.
 */
export default function ExerciseReadRow({
  principal,
  conjunto,
  index,
  onPreview,
}: Props) {
  // A visibilidade do olhinho sai de `onPreview`: quem monta a lista já decide
  // com `cardTemImagens`. Recalcular aqui era a mesma regra em dois lugares.
  const titulo = conjunto
    ? `${principal.exercise.exercise_name} + ${conjunto.exercise.exercise_name}`
    : principal.exercise.exercise_name;

  return (
    <View className="rounded-2xl border border-border bg-surface-muted p-3">
      <View className="flex-row items-center gap-2">
        <Text className="text-text-muted text-[10px] w-5">#{index + 1}</Text>
        <View className="flex-1">
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>
            {titulo}
          </Text>
          {conjunto ? (
            <View className="mt-1">
              <SerieConjuntaBadge />
            </View>
          ) : (
            principal.exercise.equipment && (
              <Text className="text-text-muted text-[10px] mt-0.5">
                {principal.exercise.equipment}
              </Text>
            )
          )}
        </View>
        <View className="flex-row items-center gap-2">
          {onPreview && <PreviewEyeButton onPress={onPreview} />}
          {!conjunto && (
            <VideoPlayButton
              videoUrl={principal.videoUrl}
              exerciseName={principal.exercise.exercise_name}
            />
          )}
        </View>
      </View>

      {conjunto ? (
        <>
          <BlocoMetricas item={principal} />
          <BlocoMetricas item={conjunto} />
          <Text className="text-text-muted text-[11px] leading-relaxed mt-2">
            {TEXTO_SERIE_CONJUNTA}
          </Text>
        </>
      ) : (
        <>
          <Metricas exercise={principal.exercise} />
          {principal.exercise.notes && (
            <Text className="text-text-muted text-xs mt-2 italic">
              {principal.exercise.notes}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

/** Nome + métricas de UM exercício do par. O título do card já mostra "A + B",
 *  mas cada prescrição precisa ficar colada no exercício a que pertence. */
function BlocoMetricas({ item }: { item: ExercicioExibivel }) {
  const { exercise } = item;
  return (
    <View className="mt-3 rounded-xl border border-border-subtle bg-surface p-2.5">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Text className="text-text text-xs font-semibold" numberOfLines={2}>
            {exercise.exercise_name}
          </Text>
          {exercise.equipment && (
            <Text className="text-text-muted text-[10px]">
              {exercise.equipment}
            </Text>
          )}
        </View>
        <VideoPlayButton
          videoUrl={item.videoUrl}
          exerciseName={exercise.exercise_name}
          size="sm"
        />
      </View>
      <Metricas exercise={exercise} />
      {exercise.notes && (
        <Text className="text-text-muted text-xs mt-2 italic">
          {exercise.notes}
        </Text>
      )}
    </View>
  );
}

/** As pílulas de prescrição. Força e cárdio mostram coisas diferentes. */
function Metricas({ exercise }: { exercise: ReadableExercise }) {
  const repRange = formatRange(exercise.reps_min, exercise.reps_max);
  const weightRange = formatRange(
    exercise.weight_min_kg,
    exercise.weight_max_kg,
  );

  return (
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
