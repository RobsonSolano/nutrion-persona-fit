import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Square,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useTemplates } from '@/hooks/useTemplates';
import {
  MODALITY_LABELS,
  type TemplateListItem,
} from '@/types/database';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (templateIds: string[]) => void;
  multi?: boolean;
  title?: string;
  confirmLabel?: string;
  loading?: boolean;
};

export default function TemplatePicker({
  visible,
  onClose,
  onConfirm,
  multi = true,
  title = 'Selecionar template',
  confirmLabel = 'Aplicar',
  loading = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const templatesQ = useTemplates({ archived: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) setSelected(new Set());
  }, [visible]);

  const count = selected.size;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multi) next.clear();
        next.add(id);
      }
      return next;
    });
  }

  const ordered = useMemo(() => {
    const arr = templatesQ.data ?? [];
    return arr.slice().sort((a, b) => {
      const aSel = selected.has(a.id) ? 0 : 1;
      const bSel = selected.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [templatesQ.data, selected]);

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
            <Text className="text-text font-semibold">{title}</Text>
            <Text className="text-text-muted text-[10px] mt-0.5">
              {multi ? `${count} selecionado${count === 1 ? '' : 's'}` : null}
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {templatesQ.isLoading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : ordered.length === 0 ? (
            <Card padding="md">
              <View className="items-center gap-2 py-4">
                <BookOpen size={28} color={colors.textMuted} />
                <Text className="text-text-muted text-sm text-center leading-relaxed">
                  Você ainda não tem templates ativos. Crie pela Biblioteca de
                  treinos no menu inicial do professor.
                </Text>
              </View>
            </Card>
          ) : (
            ordered.map((t) => (
              <TemplatePickerRow
                key={t.id}
                template={t}
                selected={selected.has(t.id)}
                onToggle={() => toggle(t.id)}
              />
            ))
          )}
        </ScrollView>

        {/* `insets.bottom` em vez de 16px fixos: com edgeToEdgeEnabled, a barra
            de 3 botões do Android tem ~48px e engolia o botão de confirmar. Este
            é um Modal, então não passa pelo `Screen`, que trata os edges. */}
        <View
          className="px-5 py-3 border-t border-border-subtle bg-bg-deep"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}
        >
          <Button
            label={count > 0 ? `${confirmLabel} (${count})` : confirmLabel}
            onPress={() => onConfirm(Array.from(selected))}
            disabled={count === 0 || loading}
            loading={loading}
            icon={<Check size={16} color={colors.textInverse} />}
          />
        </View>
      </View>
    </Modal>
  );
}

function TemplatePickerRow({
  template,
  selected,
  onToggle,
}: {
  template: TemplateListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} className="active:opacity-80">
      <Card padding="md">
        <View className="flex-row items-center gap-3">
          {selected ? (
            <CheckCircle2 size={22} color={colors.accent} />
          ) : (
            <Square size={22} color={colors.textMuted} />
          )}
          <View className="flex-1">
            <Text
              className={`text-sm font-semibold ${
                selected ? 'text-accent' : 'text-text'
              }`}
              numberOfLines={1}
            >
              {template.name}
            </Text>
            <Text className="text-text-muted text-[11px] mt-0.5">
              {MODALITY_LABELS[template.modality]} ·{' '}
              {template.exercises_count} exercício
              {template.exercises_count === 1 ? '' : 's'}
            </Text>
            {template.description && (
              <Text
                className="text-text-dim text-[11px] mt-1"
                numberOfLines={2}
              >
                {template.description}
              </Text>
            )}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
