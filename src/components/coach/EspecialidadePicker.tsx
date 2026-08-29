import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  ESPECIALIDADES,
  ESPECIALIDADE_LABELS,
  MAX_ESPECIALIDADES,
  type Especialidade,
} from '@/lib/especialidades';

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
  label?: string;
  max?: number;
};

/** Chips multi-seleção. Lista curta o bastante pra caber sem busca. */
export default function EspecialidadePicker({
  selected,
  onChange,
  label,
  max = MAX_ESPECIALIDADES,
}: Props) {
  function toggle(slug: Especialidade) {
    void Haptics.selectionAsync();
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else if (selected.length < max) {
      onChange([...selected, slug]);
    }
  }

  const cheio = selected.length >= max;

  return (
    <View>
      {label ? (
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-text-dim text-xs uppercase tracking-widest">
            {label}
          </Text>
          <Text className={cheio ? 'text-warn text-[11px]' : 'text-text-muted text-[11px]'}>
            {selected.length}/{max}
          </Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {ESPECIALIDADES.map((slug) => {
          const on = selected.includes(slug);
          // Quando o limite estoura, os não-selecionados ficam inertes em vez
          // de sumir — o usuário vê que existem e por que não dá pra marcar.
          const inerte = !on && cheio;
          return (
            <Pressable
              key={slug}
              onPress={() => toggle(slug)}
              disabled={inerte}
              className={`px-3 py-2 rounded-full border ${
                on
                  ? 'bg-accent/15 border-accent/40'
                  : inerte
                    ? 'bg-surface-muted border-border'
                    : 'bg-surface border-border active:bg-surface-raised'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  on ? 'text-accent-soft' : inerte ? 'text-text-muted' : 'text-text-dim'
                }`}
              >
                {ESPECIALIDADE_LABELS[slug]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
