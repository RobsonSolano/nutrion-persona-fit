import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { ArrowLeft, SearchX, SlidersHorizontal, Search, X } from 'lucide-react-native';
import { Screen } from '@/components/ui';
import CoachListCard from '@/components/coach/CoachListCard';
import LocalidadePicker from '@/components/coach/LocalidadePicker';
import EspecialidadePicker from '@/components/coach/EspecialidadePicker';
import { colors } from '@/lib/theme';
import { SERVICE_MODES, SERVICE_MODE_LABELS } from '@/lib/especialidades';
import { useCoachSearch } from '@/hooks/useEnrollment';

export default function EncontrarProfessorScreen() {
  const router = useRouter();
  const [uf, setUf] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [serviceMode, setServiceMode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const filtros = useMemo(
    () => ({ uf, city, specialties, serviceMode, query: query.trim() || null }),
    [uf, city, specialties, serviceMode, query],
  );
  const q = useCoachSearch(filtros);

  const filtrosAtivos =
    (uf ? 1 : 0) + (city ? 1 : 0) + specialties.length + (serviceMode ? 1 : 0);

  function limpar() {
    setUf(null);
    setCity(null);
    setSpecialties([]);
    setServiceMode(null);
    setQuery('');
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Screen variant="hero" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-5 py-3 border-b border-border-subtle">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <ArrowLeft size={18} color={colors.textDim} />
          </Pressable>
          <Text className="text-text font-semibold">Encontre um professor</Text>
          <Pressable
            onPress={() => setFiltrosAbertos((v) => !v)}
            hitSlop={12}
            className={`h-10 w-10 rounded-2xl border items-center justify-center active:opacity-70 ${
              filtrosAtivos > 0
                ? 'bg-accent/15 border-accent/40'
                : 'bg-surface-raised border-border'
            }`}
          >
            <SlidersHorizontal
              size={18}
              color={filtrosAtivos > 0 ? colors.accent : colors.textDim}
            />
          </Pressable>
        </View>

        <View className="px-5 pt-4">
          <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5">
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Nome do professor"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              className="flex-1 text-text text-sm"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <X size={15} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {filtrosAbertos && (
          <View className="px-5 pt-4 gap-4">
            <LocalidadePicker
              label="Região"
              uf={uf}
              city={city}
              allowEmpty
              onChange={(v) => {
                setUf(v.uf);
                setCity(v.city);
              }}
            />

            <View>
              <Text className="text-text-dim text-xs uppercase tracking-widest mb-2">
                Atendimento
              </Text>
              <View className="flex-row gap-2">
                {SERVICE_MODES.map((m) => {
                  const on = serviceMode === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setServiceMode(on ? null : m)}
                      className={`flex-1 items-center rounded-2xl border py-2.5 ${
                        on
                          ? 'bg-accent/15 border-accent/40'
                          : 'bg-surface border-border active:bg-surface-raised'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          on ? 'text-accent-soft' : 'text-text-dim'
                        }`}
                      >
                        {SERVICE_MODE_LABELS[m]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="text-text-muted text-[11px] mt-2">
                Quem atende híbrido aparece em online e em presencial.
              </Text>
            </View>

            <EspecialidadePicker
              label="Especialidade"
              selected={specialties}
              onChange={setSpecialties}
            />

            {filtrosAtivos > 0 && (
              <Pressable onPress={limpar} className="self-start active:opacity-70">
                <Text className="text-accent text-xs font-semibold">
                  Limpar filtros ({filtrosAtivos})
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {q.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : q.isError ? (
          <View className="flex-1 items-center justify-center px-10">
            <Text className="text-danger text-sm text-center">
              Não consegui carregar a lista. Puxe pra baixo pra tentar de novo.
            </Text>
          </View>
        ) : (
          <FlatList
            data={q.data ?? []}
            keyExtractor={(c) => c.coach_id}
            contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={q.isRefetching}
                onRefresh={() => void q.refetch()}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            renderItem={({ item }) => (
              <CoachListCard
                coach={item}
                onPress={() =>
                  router.push(`/encontrar-professor/${item.coach_id}` as Href)
                }
              />
            )}
            ListEmptyComponent={<EmptyState temFiltro={filtrosAtivos > 0 || !!query} />}
          />
        )}
      </Screen>
    </>
  );
}

function EmptyState({ temFiltro }: { temFiltro: boolean }) {
  return (
    <View className="items-center px-8 pt-16">
      <View className="h-16 w-16 rounded-3xl bg-surface-raised border border-border items-center justify-center mb-4">
        <SearchX size={26} color={colors.textMuted} />
      </View>
      <Text className="text-text font-semibold text-center">
        {temFiltro ? 'Nenhum professor com esses filtros' : 'Nenhum professor por aqui ainda'}
      </Text>
      <Text className="text-text-muted text-xs text-center mt-2 leading-relaxed">
        {temFiltro
          ? 'Tente ampliar a região ou tirar alguma especialidade.'
          : 'Só professores com plano Premium e perfil público aparecem na busca. A lista cresce conforme eles entram.'}
      </Text>
    </View>
  );
}
