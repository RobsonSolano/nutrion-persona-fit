import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { X, ChevronLeft, ChevronRight, Eye, CirclePlay } from 'lucide-react-native';
import { Button, Card } from '@/components/ui';
import { colors } from '@/lib/theme';
import { openExerciseVideo } from '@/lib/youtube';

type Props = {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  equipment?: string | null;
  imageUrls: string[];
  /** Vídeo salvo no catálogo. Sem ele, o play cai na busca pelo nome. */
  videoUrl?: string | null;
};

export default function ExerciseImagesModal({
  visible,
  onClose,
  exerciseName,
  equipment,
  imageUrls,
  videoUrl,
}: Props) {
  const width = Dimensions.get('window').width;
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [errored, setErrored] = useState<Set<number>>(new Set());
  const carouselRef = useRef<ScrollView>(null);

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
    <Modal
      visible={visible}
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
          <View className="px-5 pt-5 pb-3">
            <Text className="text-text text-xl font-bold" numberOfLines={2}>
              {exerciseName}
            </Text>
            {equipment && (
              <Text className="text-text-dim text-xs mt-0.5">{equipment}</Text>
            )}
          </View>

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

          <View className="px-5 mt-6 gap-3">
            <Card padding="md">
              <View className="flex-row items-start gap-3">
                <View className="h-9 w-9 rounded-xl bg-accent/10 border border-accent/30 items-center justify-center">
                  <Eye size={16} color={colors.accent} />
                </View>
                <View className="flex-1">
                  <Text className="text-text text-sm font-semibold">
                    Posição {index + 1} de {imageUrls.length}
                  </Text>
                  <Text className="text-text-dim text-xs mt-1 leading-relaxed">
                    {index === 0
                      ? 'Posição inicial do movimento.'
                      : 'Posição final / pico de contração.'}
                  </Text>
                </View>
              </View>
            </Card>
            <Text className="text-text-muted text-[11px] leading-relaxed">
              Imagens: Free Exercise DB (CC0). A execução correta varia com
              biomecânica individual — em dúvida, consulte um educador físico.
            </Text>
          </View>

          <View className="px-5 mt-6 flex-row gap-3">
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

          <View className="px-5 mt-3 gap-2">
            <Button
              label="Buscar vídeo no YouTube"
              onPress={() => openExerciseVideo({ videoUrl, exerciseName })}
              variant="secondary"
              icon={<CirclePlay size={16} color={colors.text} />}
            />
            <Button label="Voltar" onPress={onClose} variant="ghost" />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
