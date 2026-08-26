// Bloco de formulário "Você é PCD?" — usado em três telas (onboarding
// passo 4, cadastro de aluno pelo professor, edição de aluno). Compartilhado
// de propósito: o vocabulário tem que ser idêntico nos três, senão o
// bloqueio determinístico do gerador de plano recebe slugs divergentes.

import { Text, View } from 'react-native';
import { Accessibility } from 'lucide-react-native';
import { Input } from '@/components/ui';
import MultiSelectChips from '@/components/onboarding/MultiSelectChips';
import { colors } from '@/lib/theme';
import {
  DISABILITY_OPTIONS,
  MAX_DISABILITY_NOTES,
  isDisabilityType,
  requiresNotes,
} from '@/lib/disability';
import type { DisabilityType } from '@/types/database';

export type DisabilityValue = {
  hasDisability: boolean | null;
  types: DisabilityType[];
  notes: string;
};

type Props = DisabilityValue & {
  onChange: (patch: Partial<DisabilityValue>) => void;
};

const SIM_NAO = [
  { value: 'no', label: 'Não' },
  { value: 'yes', label: 'Sim' },
];

export default function DisabilityFields({
  hasDisability,
  types,
  notes,
  onChange,
}: Props) {
  const selecionado =
    hasDisability === true ? ['yes'] : hasDisability === false ? ['no'] : [];

  function setResposta(v: string) {
    const sim = v === 'yes';
    // Responder "Não" limpa o que já foi marcado: dado sensível de saúde não
    // fica pendurado, e é o escape hatch de quem foi bloqueado por engano.
    onChange(
      sim
        ? { hasDisability: true }
        : { hasDisability: false, types: [], notes: '' },
    );
  }

  function toggleTipo(v: string) {
    if (!isDisabilityType(v)) return;
    onChange({
      types: types.includes(v)
        ? types.filter((t) => t !== v)
        : [...types, v],
    });
  }

  const notasObrigatorias = requiresNotes(types);

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-2">
        <Accessibility size={14} color={colors.info} />
        <Text className="text-text-dim text-xs uppercase tracking-widest">
          Você é uma pessoa com deficiência?
        </Text>
      </View>

      <MultiSelectChips
        options={SIM_NAO}
        selected={selecionado}
        onToggle={setResposta}
        single
      />

      <Text className="text-text-muted text-[11px] mt-1">
        Isso muda quais exercícios a IA pode prescrever. Opcional.
      </Text>

      {hasDisability === true && (
        <View className="gap-3 mt-3">
          <View>
            <Text className="text-text-dim text-[11px] uppercase tracking-widest mb-2">
              Qual?
            </Text>
            <MultiSelectChips
              options={DISABILITY_OPTIONS}
              selected={types}
              onToggle={toggleTipo}
            />
            {types.length === 0 && (
              <Text className="text-warn text-[11px] mt-2">
                Escolha ao menos uma opção pra continuar.
              </Text>
            )}
          </View>

          <View>
            <Input
              value={notes}
              onChangeText={(v) => {
                if (v.length <= MAX_DISABILITY_NOTES) onChange({ notes: v });
              }}
              placeholder={
                notasObrigatorias
                  ? 'Descreva a sua condição'
                  : 'Quer detalhar? (opcional)'
              }
              multiline
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <Text className="text-text-muted text-[11px] mt-1">
              {notasObrigatorias
                ? 'Descreva pra IA saber o que adaptar.'
                : `${notes.length}/${MAX_DISABILITY_NOTES}`}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
