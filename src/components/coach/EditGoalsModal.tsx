// Popup de edição das metas diárias do aluno (calorias, proteína, água).
// Só o professor pro/premium abre a versão funcional — o gate fica na tela
// que renderiza (o servidor também recusa mudança de meta de coach free).

import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Input } from '@/components/ui';
import { colors } from '@/lib/theme';
import type { UpdateStudentPatch } from '@/services/students';

export type GoalValues = {
  daily_calorie_goal: number | null;
  protein_goal_g: number | null;
  water_goal_ml: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  initial: GoalValues;
  onSave: (patch: UpdateStudentPatch) => Promise<void> | void;
  saving?: boolean;
};

/** Só dígitos, vira número ou null (campo vazio = não definido). */
function toInt(v: string): number | null {
  const digits = v.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export default function EditGoalsModal({
  visible,
  onClose,
  initial,
  onSave,
  saving,
}: Props) {
  const insets = useSafeAreaInsets();
  const [calorie, setCalorie] = useState('');
  const [protein, setProtein] = useState('');
  const [water, setWater] = useState('');

  // Reabre sempre com os valores atuais.
  useEffect(() => {
    if (!visible) return;
    setCalorie(initial.daily_calorie_goal != null ? String(initial.daily_calorie_goal) : '');
    setProtein(initial.protein_goal_g != null ? String(initial.protein_goal_g) : '');
    setWater(initial.water_goal_ml != null ? String(initial.water_goal_ml) : '');
  }, [visible, initial]);

  async function handleSave() {
    await onSave({
      daily_calorie_goal: toInt(calorie),
      protein_goal_g: toInt(protein),
      water_goal_ml: toInt(water),
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="rounded-t-3xl bg-bg-deep border-t border-border px-5 pt-4"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-text text-base font-bold">Editar metas</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              className="h-9 w-9 rounded-xl bg-surface-raised border border-border items-center justify-center active:opacity-70"
            >
              <X size={16} color={colors.textDim} />
            </Pressable>
          </View>

          <View className="gap-3">
            <Input
              label="Calorias (kcal)"
              value={calorie}
              onChangeText={(v) => setCalorie(v.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              placeholder="2500"
            />
            <Input
              label="Proteína (g)"
              value={protein}
              onChangeText={(v) => setProtein(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder="180"
            />
            <Input
              label="Água (ml)"
              value={water}
              onChangeText={(v) => setWater(v.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              placeholder="4000"
            />
          </View>

          <View className="mt-5">
            <Button label="Salvar metas" onPress={handleSave} loading={saving} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
