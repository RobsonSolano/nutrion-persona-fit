import { ScrollView, Text, View } from 'react-native';
import { seccoesVisiveis, type ReleaseNotes } from '@/lib/otaReleaseNotes';

export default function OtaReleaseNotes({ notes }: { notes: ReleaseNotes }) {
  // Altura limitada + scroll: sem isso um changelog longo cresce o card do
  // ConfirmModal (que não tem maxHeight) e empurra "Atualizar agora" pra fora
  // da tela — o CTA principal ficaria inalcançável.
  return (
    <ScrollView
      className="w-full mt-4"
      style={{ maxHeight: 260 }}
      contentContainerClassName="gap-3"
    >
      {seccoesVisiveis(notes).map((secao) => (
        <View key={secao.chave} className="gap-1">
          <Text className="text-text text-sm font-semibold">
            {secao.emoji} {secao.titulo}
          </Text>
          {secao.itens.map((item, i) => (
            <Text
              key={`${secao.chave}-${i}`}
              className="text-text-dim text-sm leading-relaxed"
            >
              • {item}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
