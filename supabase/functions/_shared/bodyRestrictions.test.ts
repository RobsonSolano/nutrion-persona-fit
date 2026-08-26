import { describe, expect, it } from 'vitest';
import {
  avisoRestricaoDetectada,
  resolveBodyRestrictions,
} from './bodyRestrictions.ts';

const VAZIO = {
  has_disability: null,
  disability_types: null,
  disability_notes: null,
  physical_limitations: null,
  bio: null,
};

describe('resolveBodyRestrictions — sem restrição', () => {
  it('PCD05_perfil_vazio_nao_bloqueia', () => {
    const r = resolveBodyRestrictions(VAZIO);
    expect(r.blockLowerLimbs).toBe(false);
    expect(r.source).toBeNull();
    expect(r.promptRules).toEqual([]);
  });

  it('PCD06_texto_de_rotina_nao_e_falso_positivo', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      bio: 'Trabalho sentado 8h por dia, durmo ~6h, treino à noite. Quero foco em perna.',
    });
    expect(r.blockLowerLimbs).toBe(false);
  });

  it('PCD06_lesao_de_joelho_nao_bloqueia_perna_inteira', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      physical_limitations: 'dor no joelho direito, hérnia L5',
    });
    expect(r.blockLowerLimbs).toBe(false);
  });
});

describe('resolveBodyRestrictions — campo estruturado', () => {
  it('PCD05_cadeirante_bloqueia_membro_inferior', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['wheelchair_paraplegia'],
    });
    expect(r.blockLowerLimbs).toBe(true);
    expect(r.source).toBe('structured');
  });

  it('PCD05_amputacao_membro_inferior_bloqueia', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['amputation_lower'],
    });
    expect(r.blockLowerLimbs).toBe(true);
    expect(r.source).toBe('structured');
  });

  it('PCD05_amputacao_membro_superior_nao_bloqueia_mas_orienta', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['amputation_upper'],
    });
    expect(r.blockLowerLimbs).toBe(false);
    expect(r.promptRules.join(' ')).toMatch(/unilaterais/i);
  });

  it('PCD05_deficiencia_visual_orienta_sem_bloquear', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['visual'],
    });
    expect(r.blockLowerLimbs).toBe(false);
    expect(r.promptRules.join(' ')).toMatch(/pliometria|salto/i);
  });

  it('PCD05_deficiencia_auditiva_nao_muda_prescricao', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['hearing'],
    });
    expect(r.blockLowerLimbs).toBe(false);
    // Auditiva não tem implicação de prescrição — não inventamos uma.
    expect(r.promptRules).toEqual([]);
  });

  it('PCD05_outra_leva_a_descricao_pro_prompt', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['other'],
      disability_notes: 'Artrogripose nos punhos',
    });
    expect(r.promptRules.join(' ')).toContain('Artrogripose nos punhos');
  });
});

describe('resolveBodyRestrictions — rede de segurança em texto livre', () => {
  // O caso que aconteceu em produção: escreveu no "sobre", não no campo
  // de limitações, e a IA gerou treino de perna.
  it('PCD06_paraplegia_no_bio_bloqueia', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      bio: 'Sou paraplégico, então não preciso ter treino de pernas',
    });
    expect(r.blockLowerLimbs).toBe(true);
    expect(r.source).toBe('free_text');
    expect(r.trigger).toBe('paraplégico');
  });

  it('PCD06_sem_acento_tambem_pega', () => {
    const r = resolveBodyRestrictions({ ...VAZIO, bio: 'sou paraplegico' });
    expect(r.blockLowerLimbs).toBe(true);
  });

  it('PCD06_cadeirante_em_limitacoes_bloqueia', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      physical_limitations: 'Cadeirante desde 2019',
    });
    expect(r.blockLowerLimbs).toBe(true);
    expect(r.source).toBe('free_text');
  });

  it('PCD06_cadeira_de_rodas_bloqueia', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      bio: 'uso cadeira de rodas',
    });
    expect(r.blockLowerLimbs).toBe(true);
  });

  it('PCD06_amputacao_de_perna_bloqueia', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      physical_limitations: 'amputação da perna esquerda',
    });
    expect(r.blockLowerLimbs).toBe(true);
  });

  it('PCD06_amputacao_de_braco_nao_bloqueia_perna', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      physical_limitations: 'amputação do braço direito',
    });
    expect(r.blockLowerLimbs).toBe(false);
  });

  it('PCD06_nao_consigo_andar_bloqueia', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      bio: 'Não consigo andar após um acidente',
    });
    expect(r.blockLowerLimbs).toBe(true);
  });

  it('PCD06_tetraplegia_bloqueia', () => {
    const r = resolveBodyRestrictions({ ...VAZIO, bio: 'tetraplégico' });
    expect(r.blockLowerLimbs).toBe(true);
  });
});

describe('resolveBodyRestrictions — precedência', () => {
  it('PCD11_estruturado_tem_precedencia_de_origem', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['wheelchair_paraplegia'],
      bio: 'sou paraplégico',
    });
    expect(r.blockLowerLimbs).toBe(true);
    expect(r.source).toBe('structured');
  });

  it('PCD12_responder_nao_desarma_a_rede_de_palavra_chave', () => {
    // Escape hatch do falso positivo: quem escreveu "meu pai é cadeirante"
    // e respondeu "Não" na pergunta direta não perde treino de perna.
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: false,
      bio: 'meu pai é cadeirante e me inspira a treinar',
    });
    expect(r.blockLowerLimbs).toBe(false);
  });

  it('PCD12_responder_nao_nao_apaga_bloqueio_estruturado_contraditorio', () => {
    // Contradição interna: respondeu "não" mas marcou um tipo. Segurança vence.
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: false,
      disability_types: ['wheelchair_paraplegia'],
    });
    expect(r.blockLowerLimbs).toBe(true);
  });
});

describe('avisoRestricaoDetectada', () => {
  it('PCD12_avisa_e_ensina_a_desfazer_quando_veio_de_texto_livre', () => {
    const r = resolveBodyRestrictions({ ...VAZIO, bio: 'sou paraplégico' });
    const aviso = avisoRestricaoDetectada(r);
    expect(aviso).toContain('paraplégico');
    expect(aviso).toMatch(/perfil/i);
  });

  it('PCD12_nao_avisa_quando_veio_do_campo_estruturado', () => {
    const r = resolveBodyRestrictions({
      ...VAZIO,
      has_disability: true,
      disability_types: ['wheelchair_paraplegia'],
    });
    expect(avisoRestricaoDetectada(r)).toBeNull();
  });

  it('PCD12_nao_avisa_quando_nao_ha_bloqueio', () => {
    expect(avisoRestricaoDetectada(resolveBodyRestrictions(VAZIO))).toBeNull();
  });
});
