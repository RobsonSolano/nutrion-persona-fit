// Procedência dos macros de uma refeição registrada.
//
// POR QUE ISSO EXISTE: o formulário de refeição preenche o campo de calorias
// com a estimativa da IA e deixa o campo EDITÁVEL. Quando o usuário corrige
// 500 para 350 antes de salvar, essa diferença é o erro da IA medido de graça,
// em produção real — e até agora o valor original era descartado.
//
// Guardando `ai_kcal_original` junto de `macros_source`, cada refeição
// corrigida passa a ser um ponto de medição. É a baseline que decide se vale
// pagar por um modelo melhor: sem ela, "melhorou" é impressão, não medida.

import type { MacrosSource } from '@/types/database';

/**
 * `manual` — nunca passou pela IA (usuário digitou tudo).
 * `ai` — analisou e salvou a estimativa como veio.
 * `ai_edited` — analisou e mexeu no valor antes de salvar.
 *
 * `aiKcalOriginal` é o kcal da ÚLTIMA análise; é contra ele que a edição do
 * usuário faz sentido, e não contra a primeira de várias.
 */
export function derivarMacrosSource(params: {
  aiKcalOriginal: number | null;
  kcalSalvo: number | null;
}): MacrosSource {
  const { aiKcalOriginal, kcalSalvo } = params;
  if (aiKcalOriginal == null) return 'manual';
  return kcalSalvo === aiKcalOriginal ? 'ai' : 'ai_edited';
}
