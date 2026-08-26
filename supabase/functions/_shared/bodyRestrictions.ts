// Traduz a condição declarada pelo usuário em restrição de exercício.
//
// POR QUE ISSO EXISTE: um usuário escreveu "Sou paraplégico, então não preciso
// ter treino de pernas" no campo livre do onboarding e a IA gerou treino de
// pernas. Instrução de prompt é best-effort — um modelo pode desobedecer. Uma
// declaração de paraplegia não pode depender disso.
//
// A saída daqui alimenta `fetchCatalog`, que remove os exercícios bloqueados
// ANTES de montar o prompt. O modelo não recebe agachamento pra escolher, e
// `sanitizePlan` — que já descarta o que não está no catálogo recebido —
// fecha a segunda ponta sem código novo.
//
// Função pura, sem I/O: testada em bodyRestrictions.test.ts.

export type DisabilityType =
  | 'wheelchair_paraplegia'
  | 'amputation_lower'
  | 'amputation_upper'
  | 'visual'
  | 'hearing'
  | 'other';

/** De onde veio o bloqueio. Importa: só o de texto livre pode ser falso
 *  positivo, e só ele é avisado ao usuário. */
export type RestrictionSource = 'structured' | 'free_text';

export type BodyRestrictions = {
  /** Remove do catálogo tudo com `requires_lower_limbs = true`. */
  blockLowerLimbs: boolean;
  source: RestrictionSource | null;
  /** Termo que disparou a rede de texto livre (null quando estruturado). */
  trigger: string | null;
  /** Restrições que não viram bloqueio determinístico e vão pro prompt. */
  promptRules: string[];
};

export type BodyRestrictionsInput = {
  has_disability?: boolean | null;
  disability_types?: string[] | null;
  disability_notes?: string | null;
  physical_limitations?: string | null;
  bio?: string | null;
};

/** Tipos que impedem função de membro inferior de forma inequívoca. */
const TIPOS_SEM_MEMBRO_INFERIOR = new Set<string>([
  'wheelchair_paraplegia',
  'amputation_lower',
]);

/** Termos que, em texto livre, indicam ausência de função de membro
 *  inferior. `needle` é comparado contra o texto normalizado (sem acento,
 *  minúsculo); `label` é a forma legível mostrada ao usuário. */
const TERMOS_SEM_MEMBRO_INFERIOR: { needle: string; label: string }[] = [
  { needle: 'paraplegic', label: 'paraplégico' },
  { needle: 'paraplegia', label: 'paraplegia' },
  { needle: 'tetraplegic', label: 'tetraplégico' },
  { needle: 'tetraplegia', label: 'tetraplegia' },
  { needle: 'quadriplegic', label: 'quadriplégico' },
  { needle: 'quadriplegia', label: 'quadriplegia' },
  { needle: 'cadeirante', label: 'cadeirante' },
  { needle: 'cadeira de rodas', label: 'cadeira de rodas' },
  { needle: 'lesao medular', label: 'lesão medular' },
  { needle: 'nao consigo andar', label: 'não consigo andar' },
  { needle: 'nao ando', label: 'não ando' },
  { needle: 'nao caminho', label: 'não caminho' },
  { needle: 'sem movimento nas pernas', label: 'sem movimento nas pernas' },
  { needle: 'sem mobilidade nas pernas', label: 'sem mobilidade nas pernas' },
];

/** Amputação/prótese só bloqueia quando a região citada é de membro
 *  inferior — "amputação do braço" não pode tirar treino de perna.
 *  \b em tokens curtos ('pe') evita casar dentro de outra palavra. */
const MENCAO_AMPUTACAO = /\b(amputa|protese)/;
const REGIAO_MEMBRO_INFERIOR =
  /\b(pernas?|pes?|coxas?|joelhos?|membros? inferior(es)?|tibia|femur|panturrilhas?|tornozelos?|quadril)\b/;

/** Remove acento e caixa pra comparação — o usuário escreve "paraplegico"
 *  tanto quanto "paraplégico". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function resolveBodyRestrictions(
  input: BodyRestrictionsInput,
): BodyRestrictions {
  const tipos = input.disability_types ?? [];
  const promptRules = buildPromptRules(tipos, input.disability_notes);

  // 1. Campo estruturado: o usuário respondeu a pergunta direta. Vence tudo,
  //    inclusive um "não" contraditório no has_disability.
  if (tipos.some((t) => TIPOS_SEM_MEMBRO_INFERIOR.has(t))) {
    return {
      blockLowerLimbs: true,
      source: 'structured',
      trigger: null,
      promptRules,
    };
  }

  // 2. Respondeu "não" na pergunta direta → a rede de palavra-chave fica
  //    desarmada. É o escape hatch do falso positivo ("meu pai é cadeirante").
  if (input.has_disability === false) {
    return {
      blockLowerLimbs: false,
      source: null,
      trigger: null,
      promptRules,
    };
  }

  // 3. Rede de segurança no texto livre — o caso que aconteceu.
  const trigger = detectarEmTextoLivre([
    input.disability_notes,
    input.physical_limitations,
    input.bio,
  ]);
  if (trigger) {
    return {
      blockLowerLimbs: true,
      source: 'free_text',
      trigger,
      promptRules,
    };
  }

  return {
    blockLowerLimbs: false,
    source: null,
    trigger: null,
    promptRules,
  };
}

function detectarEmTextoLivre(
  campos: (string | null | undefined)[],
): string | null {
  for (const campo of campos) {
    if (!campo) continue;
    const texto = normalizar(campo);

    for (const { needle, label } of TERMOS_SEM_MEMBRO_INFERIOR) {
      if (texto.includes(needle)) return label;
    }
    if (MENCAO_AMPUTACAO.test(texto) && REGIAO_MEMBRO_INFERIOR.test(texto)) {
      return 'amputação de membro inferior';
    }
  }
  return null;
}

function buildPromptRules(
  tipos: string[],
  notes: string | null | undefined,
): string[] {
  const rules: string[] = [];

  if (tipos.some((t) => TIPOS_SEM_MEMBRO_INFERIOR.has(t))) {
    rules.push(
      'O usuário não tem função de membro inferior. O catálogo já foi filtrado: não há exercício de perna pra escolher. Monte o plano com tronco, braço e core, e não mencione treino de perna no rationale.',
    );
  }
  if (tipos.includes('amputation_upper')) {
    rules.push(
      'Amputação de membro superior: priorize exercícios unilaterais e de máquina; evite barra e movimentos bilaterais simétricos que exijam as duas mãos.',
    );
  }
  if (tipos.includes('visual')) {
    rules.push(
      'Deficiência visual: evite pliometria, salto e peso livre sem apoio; prefira máquina, cabo e movimentos guiados.',
    );
  }
  // Auditiva não tem implicação de prescrição — não inventamos uma.

  const descricao = notes?.trim();
  if (tipos.includes('other') && descricao) {
    rules.push(
      `Condição declarada pelo usuário: "${descricao}". Trate como restrição de prioridade máxima e adapte a prescrição.`,
    );
  }

  return rules;
}

/**
 * Aviso pro usuário quando o bloqueio veio de palavra-chave em texto livre.
 * Só esse caminho pode errar (ex: "meu pai é cadeirante"), então só ele é
 * anunciado — junto de como desfazer. Bloquear errado e avisar é melhor que
 * liberar errado e calar.
 */
export function avisoRestricaoDetectada(r: BodyRestrictions): string | null {
  if (!r.blockLowerLimbs || r.source !== 'free_text') return null;
  return `> **Removi os exercícios de perna deste plano.** Você mencionou "${r.trigger}" no que escreveu sobre você. Se não é o seu caso, responda "Não" em *Você é PCD?* no seu perfil e gere o plano de novo.`;
}
