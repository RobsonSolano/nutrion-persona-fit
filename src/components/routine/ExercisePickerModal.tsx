// Modal de escolha de exercício do catálogo.
//
// Vivia dentro do RoutineEditor, que é consumido por 6 telas e passou de 870
// linhas. Extraído pra receber o cadastro de exercício do professor sem
// levar o arquivo pra 1000+.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  Pencil,
  Plus,
  PlusCircle,
  Search,
  X,
} from 'lucide-react-native';
import { Card, Input } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import {
  useCanCreateExercise,
  useExerciseGroups,
  useExercisesByGroup,
} from '@/hooks/useExercises';
import ExerciseFormModal from './ExerciseFormModal';
import { colors } from '@/lib/theme';
import {
  MODALITY_LABELS,
  type Exercise,
  type Modality,
} from '@/types/database';

export default function ExercisePickerModal({
  visible,
  onClose,
  modality,
  preferredGroupId,
  addedExerciseIds,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  modality: Modality;
  preferredGroupId: string | null;
  addedExerciseIds: Set<string>;
  onSelect: (ex: Exercise) => void;
}) {
  const insets = useSafeAreaInsets();
  const canCreate = useCanCreateExercise();
  const { user } = useAuth();
  const [groupId, setGroupId] = useState<string | null>(preferredGroupId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [search, setSearch] = useState('');
  const groupsQ = useExerciseGroups();
  const exercisesQ = useExercisesByGroup(groupId, modality);

  // Sempre que o modal abre, sincroniza o grupo com o preferido do form
  // e limpa a busca anterior — evita confusão de estado antigo.
  useEffect(() => {
    if (visible) {
      setGroupId(preferredGroupId);
      setSearch('');
    }
  }, [visible, preferredGroupId]);

  const filtered = useMemo(() => {
    const list = exercisesQ.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((e) => e.name.toLowerCase().includes(term));
  }, [exercisesQ.data, search]);

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
          style={{ paddingTop: Math.max(insets.top, 16) + 4 }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            className="h-10 w-10 rounded-2xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
          >
            <X size={18} color={colors.textDim} />
          </Pressable>
          <View className="items-center">
            <Text className="text-text font-semibold">Escolher exercício</Text>
            <Text className="text-text-muted text-[10px] mt-0.5">
              {MODALITY_LABELS[modality]}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 20,
            gap: 12,
            paddingBottom: Math.max(insets.bottom, 16) + 44,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Card padding="md">
            <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-3">
              Grupo muscular
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(groupsQ.data ?? []).map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setGroupId(g.id)}
                  className={`rounded-full border px-3 py-1.5 ${
                    groupId === g.id
                      ? 'bg-accent/10 border-accent/40'
                      : 'bg-surface-muted border-border'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      groupId === g.id ? 'text-accent' : 'text-text-dim'
                    }`}
                  >
                    {g.icon} {g.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          {groupId && (
            <Card padding="md">
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar exercício..."
                leftIcon={<Search size={16} color={colors.textMuted} />}
                autoCapitalize="none"
              />
            </Card>
          )}

          {!groupId && (
            <Text className="text-text-muted text-sm text-center py-4">
              Selecione um grupo pra ver os exercícios.
            </Text>
          )}

          {groupId && exercisesQ.isLoading && (
            <View className="py-8 items-center">
              <ActivityIndicator color={colors.accent} />
            </View>
          )}

          {groupId && !exercisesQ.isLoading && filtered.length === 0 && (
            <Text className="text-text-muted text-sm text-center py-4">
              Nenhum exercício de {MODALITY_LABELS[modality]} nesse grupo.
              {'\n'}Tenta outro grupo ou outra modalidade.
            </Text>
          )}

          {canCreate && groupId && (
            <Pressable
              onPress={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="active:opacity-70"
            >
              <Card padding="md">
                <View className="flex-row items-center justify-center gap-2">
                  <Plus size={18} color={colors.accent} />
                  <Text className="text-accent text-sm font-semibold">
                    Novo exercício
                  </Text>
                </View>
              </Card>
            </Pressable>
          )}

          {filtered.map((ex) => {
            const added = addedExerciseIds.has(ex.id);
            const meu = !!ex.owner_id && ex.owner_id === user?.id;
            return (
              <Pressable
                key={ex.id}
                onPress={() => {
                  if (!added) onSelect(ex);
                }}
                className={added ? 'opacity-60' : 'active:opacity-70'}
              >
                <Card padding="md">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className={`text-sm font-semibold ${
                            added ? 'text-text-dim' : 'text-text'
                          }`}
                        >
                          {ex.name}
                        </Text>
                        {meu && (
                          <View className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5">
                            <Text className="text-accent text-[9px] font-semibold uppercase tracking-wider">
                              meu
                            </Text>
                          </View>
                        )}
                      </View>
                      {ex.equipment && (
                        <Text className="text-text-muted text-[11px] mt-0.5">
                          {ex.equipment}
                          {ex.is_compound ? ' · composto' : ''}
                          {added ? ' · já adicionado' : ''}
                        </Text>
                      )}
                    </View>
                    <View className="flex-row items-center gap-3">
                      {/* Pressable próprio: consome o toque, então o card
                          externo não seleciona o exercício ao editar. */}
                      {meu && (
                        <Pressable
                          onPress={() => {
                            setEditing(ex);
                            setFormOpen(true);
                          }}
                          hitSlop={12}
                          className="active:opacity-60"
                        >
                          <Pencil size={16} color={colors.textDim} />
                        </Pressable>
                      )}
                      {added ? (
                        <CheckCircle2 size={18} color={colors.accent} />
                      ) : (
                        <PlusCircle size={18} color={colors.textMuted} />
                      )}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ExerciseFormModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        exercise={editing}
        initialGroupId={groupId}
        initialModality={modality}
        onSaved={(ex) => {
          setFormOpen(false);
          // Só auto-seleciona no cadastro: em edição o exercício já está
          // na rotina, e re-selecionar duplicaria a linha.
          if (!editing) onSelect(ex);
        }}
        onDeleted={() => setFormOpen(false)}
      />
    </Modal>
  );
}
