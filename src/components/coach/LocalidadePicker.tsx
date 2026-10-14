import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import {
  UFS,
  UF_NOMES,
  filtrarMunicipios,
  municipiosDaUf,
  type Municipio,
} from '@/lib/localidades';

type Props = {
  uf: string | null;
  city: string | null;
  onChange: (v: { uf: string | null; city: string | null; ibge: number | null }) => void;
  /** Na busca, "qualquer estado/cidade" é opção válida; no perfil, não. */
  allowEmpty?: boolean;
  label?: string;
};

/**
 * Estado e cidade em selects encadeados sobre a lista do IBGE. A cidade
 * só abre depois da UF — 5.571 municípios numa lista só é inutilizável, e
 * cidade sem estado é ambígua (Bom Jesus existe em 8 UFs).
 */
export default function LocalidadePicker({
  uf,
  city,
  onChange,
  allowEmpty = false,
  label,
}: Props) {
  const [aberto, setAberto] = useState<'uf' | 'city' | null>(null);
  const [busca, setBusca] = useState('');

  const cidades = useMemo<Municipio[]>(
    () => (uf ? filtrarMunicipios(uf, busca) : []),
    [uf, busca],
  );

  function escolherUf(novaUf: string | null) {
    // Trocar de estado invalida a cidade: ela pode não existir na nova UF.
    onChange({ uf: novaUf, city: null, ibge: null });
    setAberto(null);
    setBusca('');
  }

  function escolherCidade(m: Municipio | null) {
    onChange({ uf, city: m?.nome ?? null, ibge: m?.ibge ?? null });
    setAberto(null);
    setBusca('');
  }

  return (
    <View>
      {label ? (
        <Text className="text-text-dim text-xs uppercase tracking-widest mb-2">
          {label}
        </Text>
      ) : null}

      <View className="flex-row gap-2">
        <Pressable
          onPress={() => setAberto('uf')}
          className="flex-1 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 active:bg-surface-raised"
        >
          <Text className={uf ? 'text-text text-sm' : 'text-text-muted text-sm'}>
            {uf ? UF_NOMES[uf] : 'Estado'}
          </Text>
          <ChevronDown size={16} color={colors.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => uf && setAberto('city')}
          disabled={!uf}
          className={`flex-1 flex-row items-center justify-between rounded-2xl border px-4 py-3 ${
            uf
              ? 'border-border bg-surface active:bg-surface-raised'
              : 'border-border bg-surface-muted'
          }`}
        >
          <Text
            className={city ? 'text-text text-sm' : 'text-text-muted text-sm'}
            numberOfLines={1}
          >
            {city ?? (uf ? 'Cidade' : '—')}
          </Text>
          <ChevronDown size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      <Modal
        visible={aberto !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setAberto(null)}
      >
        <View className="flex-1 bg-bg-deep/95 justify-end">
          <View className="bg-bg-elevated rounded-t-3xl border-t border-border max-h-[80%]">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-border-subtle">
              <Text className="text-text font-semibold">
                {aberto === 'uf' ? 'Escolha o estado' : `Cidade em ${uf ? UF_NOMES[uf] : ''}`}
              </Text>
              <Pressable
                onPress={() => setAberto(null)}
                hitSlop={12}
                className="h-9 w-9 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
              >
                <X size={16} color={colors.textDim} />
              </Pressable>
            </View>

            {aberto === 'city' && (
              <View className="px-5 pt-4">
                <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5">
                  <Search size={16} color={colors.textMuted} />
                  <TextInput
                    value={busca}
                    onChangeText={setBusca}
                    placeholder="Buscar cidade"
                    placeholderTextColor={colors.textMuted}
                    selectionColor={colors.accent}
                    className="flex-1 text-text text-sm"
                    autoCorrect={false}
                  />
                </View>
                <Text className="text-text-muted text-[11px] mt-2">
                  {cidades.length} {cidades.length === 1 ? 'cidade' : 'cidades'}
                </Text>
              </View>
            )}

            {aberto === 'uf' ? (
              <FlatList
                data={allowEmpty ? [null, ...UFS] : [...UFS]}
                keyExtractor={(item) => item ?? 'todos'}
                contentContainerStyle={{ padding: 20, gap: 8 }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => escolherUf(item)}
                    className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 active:bg-surface-raised"
                  >
                    <Text className="text-text text-sm">
                      {item ? UF_NOMES[item] : 'Qualquer estado'}
                    </Text>
                    {uf === item && <Check size={16} color={colors.accent} />}
                  </Pressable>
                )}
              />
            ) : (
              <FlatList
                data={allowEmpty ? [null, ...cidades] : cidades}
                keyExtractor={(item) => String(item?.ibge ?? 'todas')}
                contentContainerStyle={{ padding: 20, gap: 8 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => escolherCidade(item)}
                    className="flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 active:bg-surface-raised"
                  >
                    <Text className="text-text text-sm">
                      {item?.nome ?? 'Qualquer cidade'}
                    </Text>
                    {city === item?.nome && <Check size={16} color={colors.accent} />}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <Text className="text-text-muted text-xs text-center py-6">
                    Nenhuma cidade com esse nome em {uf ? UF_NOMES[uf] : ''}.
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export { municipiosDaUf };
