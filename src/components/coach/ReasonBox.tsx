import { Text, View } from 'react-native';

/** Quadro com o motivo escrito por alguém (recusa, saída do aluno). */
export default function ReasonBox({ text, label }: { text: string; label?: string }) {
  return (
    <View className="mt-3 rounded-2xl border border-border bg-surface p-3">
      {label ? (
        <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-1">{label}</Text>
      ) : null}
      <Text className="text-text-muted text-xs leading-relaxed">{text}</Text>
    </View>
  );
}
