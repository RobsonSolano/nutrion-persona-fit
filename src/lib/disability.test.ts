import { describe, expect, it } from 'vitest';
import {
  formatDisability,
  isDisabilityType,
  isDisabilityValid,
  requiresNotes,
} from './disability';

describe('isDisabilityType', () => {
  it('PCD03_aceita_slug_conhecido', () => {
    expect(isDisabilityType('wheelchair_paraplegia')).toBe(true);
  });

  it('PCD03_rejeita_slug_fora_do_constraint', () => {
    // O banco tem check constraint — deixar passar aqui viraria erro 400.
    expect(isDisabilityType('paraplegico')).toBe(false);
  });
});

describe('isDisabilityValid', () => {
  it('PCD03_nao_respondeu_e_valido', () => {
    expect(
      isDisabilityValid({ hasDisability: null, types: [], notes: '' }),
    ).toBe(true);
  });

  it('PCD03_respondeu_nao_e_valido', () => {
    expect(
      isDisabilityValid({ hasDisability: false, types: [], notes: '' }),
    ).toBe(true);
  });

  it('PCD03_sim_sem_tipo_e_invalido', () => {
    expect(
      isDisabilityValid({ hasDisability: true, types: [], notes: '' }),
    ).toBe(false);
  });

  it('PCD03_sim_com_tipo_e_valido', () => {
    expect(
      isDisabilityValid({
        hasDisability: true,
        types: ['wheelchair_paraplegia'],
        notes: '',
      }),
    ).toBe(true);
  });

  it('PCD03_outra_sem_descricao_e_invalido', () => {
    // "Outra" sem texto não informa nada à IA.
    expect(
      isDisabilityValid({ hasDisability: true, types: ['other'], notes: '   ' }),
    ).toBe(false);
  });

  it('PCD03_outra_com_descricao_e_valido', () => {
    expect(
      isDisabilityValid({
        hasDisability: true,
        types: ['other'],
        notes: 'Artrogripose',
      }),
    ).toBe(true);
  });

  it('PCD03_descricao_acima_do_limite_e_invalida', () => {
    // O banco tem check de 500 chars.
    expect(
      isDisabilityValid({
        hasDisability: true,
        types: ['visual'],
        notes: 'x'.repeat(501),
      }),
    ).toBe(false);
  });
});

describe('requiresNotes', () => {
  it('PCD03_apenas_outra_exige_descricao', () => {
    expect(requiresNotes(['other'])).toBe(true);
    expect(requiresNotes(['visual', 'hearing'])).toBe(false);
  });
});

describe('formatDisability', () => {
  it('PCD13_sem_deficiencia_nao_exibe_nada', () => {
    expect(
      formatDisability({
        has_disability: false,
        disability_types: [],
        disability_notes: null,
      }),
    ).toBeNull();
  });

  it('PCD13_nunca_respondeu_nao_exibe_nada', () => {
    expect(
      formatDisability({
        has_disability: null,
        disability_types: [],
        disability_notes: null,
      }),
    ).toBeNull();
  });

  it('PCD13_lista_tipos_em_portugues', () => {
    expect(
      formatDisability({
        has_disability: true,
        disability_types: ['wheelchair_paraplegia', 'visual'],
        disability_notes: null,
      }),
    ).toBe('Cadeirante / paraplegia, Deficiência visual');
  });

  it('PCD13_anexa_a_descricao_quando_existe', () => {
    expect(
      formatDisability({
        has_disability: true,
        disability_types: ['other'],
        disability_notes: 'Artrogripose nos punhos',
      }),
    ).toBe('Outra — Artrogripose nos punhos');
  });

  it('PCD13_sim_sem_tipo_nem_nota_ainda_informa', () => {
    expect(
      formatDisability({
        has_disability: true,
        disability_types: [],
        disability_notes: null,
      }),
    ).toBe('Não especificado');
  });
});
