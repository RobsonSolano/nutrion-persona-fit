import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  CirclePlay,
  Link2,
} from 'lucide-react-native';
import { Button, Card } from '@/components/ui';
import { colors } from '@/lib/theme';
import { openExerciseVideo } from '@/lib/youtube';
import { TEXTO_SERIE_CONJUNTA } from '@/lib/conjuntos';
import type {
  ExercicioExibivel,
  PreviewConjunto,
} from '@/lib/exercicioCard';

type Props = {
  onClose: () => void;
  /** Null fecha o modal. A visibilidade sai daqui: manter uma prop `visible`
   *  separada só criava a chance de os dois discordarem. */
  preview: PreviewConjunto | null;
};

/**
 * "Como executar" — CONJ-13.
 *
 * Com série conjunta a tela divide em dois: o primeiro exercício em cima, o
 * segundo embaixo, e no meio a orientação de como alternar as séries. Cada
 * bloco tem seu próprio carrossel com índice independente.
 */
export default function ExerciseImagesModal({ onClose, preview }: Props) {
  return (
    <Modal
      visible={preview !== null}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <View className="flex-1 bg-bg-deep">
        <View
          className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle"
          style={{ paddingTop: Platform.OS === 'ios' ? 50 : 16 }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <X size={18} color={colors.textDim} />
          </Pressable>
          <View className="flex-1 items-center">
            <Text
              className="text-text font-semibold"
              numberOfLines={1}
              style={{ maxWidth: '80%' }}
            >
              Como executar
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {preview && (
            <>
              <BlocoExercicio
                exercicio={preview.principal}
                ordem={preview.conjunto ? 1 : null}
              />

              {preview.conjunto && (
                <>
                  <View className="px-5 mt-6">
                    <Card padding="md">
                      <View className="flex-row items-start gap-3">
                        <View className="h-9 w-9 rounded-xl bg-accent/10 border border-accent/30 items-center justify-center">
                          <Link2 size={16} color={colors.accent} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-text text-sm font-semibold">
                            {preview.principal.exercise.exercise_name} +{' '}
                            {preview.conjunto.exercise.exercise_name}
                          </Text>
                          <Text className="text-text-dim text-xs mt-1 leading-relaxed">
                            {TEXTO_SERIE_CONJUNTA}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  </View>

                  <BlocoExercicio exercicio={preview.conjunto} ordem={2} />
                </>
              )}

              <Text className="px-5 mt-6 text-text-muted text-[11px] leading-relaxed">
                Imagens: Free Exercise DB (CC0). A execução correta varia com
                biomecânica individual — em dúvida, consulte um educador físico.
              </Text>
            </>
          )}

          <View className="px-5 mt-3">
            <Button label="Voltar" onPress={onClose} variant="ghost" />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Um exercício: nome, carrossel, descrição e o atalho de vídeo.
 *
 * Cada instância guarda o próprio índice de página — dois carrosséis empilhados
 * não podem compartilhar estado, senão avançar um mexeria no outro.
 */
function BlocoExercicio({
  exercicio,
  ordem,
}: {
  exercicio: ExercicioExibivel;
  /** Posição no par (1 ou 2). Null quando o exercício é solto. */
  ordem: number | null;
}) {
  // useWindowDimensions e não Dimensions.get: o segundo captura o valor UMA
  // vez, e com a orientação destravada o carrossel ficaria desalinhado depois
  // de rotacionar (cada slide tem largura fixa em px).
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [errored, setErrored] = useState<Set<number>>(new Set());
  const carouselRef = useRef<ScrollView>(null);

  const imageUrls = exercicio.imageUrls ?? [];
  const temImagens = imageUrls.length > 0;

  function goTo(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= imageUrls.length) return;
    setIndex(nextIndex);
    carouselRef.current?.scrollTo({ x: nextIndex * width, animated: true });
  }

  function markLoaded(i: number) {
    setLoaded((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }

  function markErrored(i: number) {
    setErrored((prev) => {
      if (prev.has(i)) return prev;
      const next = new Set(prev);
      next.add(i);
      return next;
    });
  }

  function handleScrollEnd(e: {
    nativeEvent: { contentOffset: { x: number } };
  }) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  }

  return (
    <View>
      <View className="px-5 pt-5 pb-3">
        {ordem !== null && (
          <Text className="text-accent text-[10px] uppercase tracking-widest mb-1">
            {ordem}º exercício
          </Text>
        )}
        <Text className="text-text text-xl font-bold" numberOfLines={2}>
          {exercicio.exercise.exercise_name}
        </Text>
        {exercicio.exercise.equipment && (
          <Text className="text-text-dim text-xs mt-0.5">
            {exercicio.exercise.equipment}
          </Text>
        )}
      </View>

      {temImagens && (
        <>
          <View style={{ width, height: width * 0.75 }}>
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleScrollEnd}
            >
              {imageUrls.map((uri, i) => {
                const isErrored = errored.has(i);
                const isLoaded = loaded.has(i);
                return (
                  <View
                    key={i}
                    style={{
                      width,
                      height: width * 0.75,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surfaceMuted,
                    }}
                  >
                    {isErrored ? (
                      <Text className="text-text-muted text-sm">
                        Imagem indisponível
                      </Text>
                    ) : (
                      <Image
                        source={{ uri }}
                        style={{ width, height: width * 0.75 }}
                        resizeMode="contain"
                        onLoadEnd={() => markLoaded(i)}
                        onError={() => markErrored(i)}
                      />
                    )}
                    {!isLoaded && !isErrored && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        pointerEvents="none"
                      >
                        <ActivityIndicator color={colors.accent} />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {imageUrls.length > 1 && (
            <View className="flex-row justify-center gap-2 mt-4">
              {imageUrls.map((_, i) => (
                <View
                  key={i}
                  className={`h-1.5 rounded-full ${
                    i === index ? 'bg-accent w-6' : 'bg-border w-1.5'
                  }`}
                />
              ))}
            </View>
          )}
        </>
      )}

      <View className="px-5 mt-4">
        <Card padding="md">
          <View className="flex-row items-start gap-3">
            <View className="h-9 w-9 rounded-xl bg-accent/10 border border-accent/30 items-center justify-center">
              <Eye size={16} color={colors.accent} />
            </View>
            <View className="flex-1">
              {/* DESC-04: descrição do catálogo. Sem ela, o texto genérico que
                  o modal já mostrava — nunca espaço vazio. */}
              {exercicio.description ? (
                <Text className="text-text-dim text-xs leading-relaxed">
                  {exercicio.description}
                </Text>
              ) : temImagens ? (
                <>
                  <Text className="text-text text-sm font-semibold">
                    Posição {index + 1} de {imageUrls.length}
                  </Text>
                  <Text className="text-text-dim text-xs mt-1 leading-relaxed">
                    {index === 0
                      ? 'Posição inicial do movimento.'
                      : 'Posição final / pico de contração.'}
                  </Text>
                </>
              ) : (
                <Text className="text-text-dim text-xs leading-relaxed">
                  Sem demonstração cadastrada para este exercício. Busque o
                  vídeo abaixo.
                </Text>
              )}
            </View>
          </View>
        </Card>
      </View>

      {imageUrls.length > 1 && (
        <View className="px-5 mt-3 flex-row gap-3">
          <View style={{ flex: 1 }}>
            <Button
              label="Anterior"
              variant="secondary"
              disabled={index === 0}
              onPress={() => goTo(index - 1)}
              icon={<ChevronLeft size={16} color={colors.text} />}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Próxima"
              variant="secondary"
              disabled={index >= imageUrls.length - 1}
              onPress={() => goTo(index + 1)}
              icon={<ChevronRight size={16} color={colors.text} />}
            />
          </View>
        </View>
      )}

      <View className="px-5 mt-3">
        <Button
          label="Buscar vídeo no YouTube"
          onPress={() =>
            openExerciseVideo({
              videoUrl: exercicio.videoUrl,
              exerciseName: exercicio.exercise.exercise_name,
            })
          }
          variant="secondary"
          icon={<CirclePlay size={16} color={colors.text} />}
        />
      </View>
    </View>
  );
}
