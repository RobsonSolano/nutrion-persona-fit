import { describe, it, expect } from 'vitest';
import {
  buildExerciseRow,
  defaultRequiresLowerLimbs,
  findDuplicateExercise,
  normalizeExerciseName,
  validateExerciseForm,
  type ExerciseFormValues,
} from './exercisePayload';
import type { Exercise } from '@/types/database';

const base: ExerciseFormValues = {
  name: 'Supino Ravi',
  groupId: 'group-peito',
  modality: 'musculacao',
  equipment: 'Barra',
  visibility: 'exclusivo',
  videoUrl: '',
  requiresLowerLimbs: false,
};

function exercise(over: Partial<Exercise>): Exercise {
  return {
    id: 'ex-1',
    group_id: 'group-peito',
    name: 'Supino reto',
    equipment: null,
    is_compound: null,
    image_urls: null,
    video_url: null,
    modality: 'musculacao',
    owner_id: null,
    visibility: 'publico',
    requires_lower_limbs: false,
    ...over,
  };
}

describe('normalizeExerciseName', () => {
  it('ignora caixa, acento e espaço duplicado', () => {
    expect(normalizeExerciseName('  Supino   RETO (Barra) ')).toBe(
      'supino reto (barra)',
    );
    expect(normalizeExerciseName('Rosca Direta')).toBe(
      normalizeExerciseName('rosca dirêta'),
    );
  });
});

describe('findDuplicateExercise', () => {
  const catalog = [exercise({ id: 'a', name: 'Supino reto' })];

  it('acha duplicata ignorando caixa e acento', () => {
    expect(findDuplicateExercise('SUPINO RÉTO', 'group-peito', catalog)?.id).toBe(
      'a',
    );
  });

  it('não acusa duplicata em grupo diferente', () => {
    expect(findDuplicateExercise('Supino reto', 'group-costas', catalog)).toBeNull();
  });

  it('devolve null quando não existe', () => {
    expect(findDuplicateExercise('Supino Ravi', 'group-peito', catalog)).toBeNull();
  });

  it('ignora o próprio exercício em modo edição', () => {
    // Sem isso, editar o "Supino reto" sem mudar o nome acusaria ele mesmo.
    expect(
      findDuplicateExercise('Supino reto', 'group-peito', catalog, 'a'),
    ).toBeNull();
  });
});

describe('validateExerciseForm', () => {
  it('aceita form mínimo válido', () => {
    expect(validateExerciseForm(base)).toEqual([]);
  });

  it('exige nome', () => {
    expect(validateExerciseForm({ ...base, name: '   ' })).toEqual([
      { field: 'name', message: 'Dá um nome pro exercício.' },
    ]);
  });

  it('exige nome com pelo menos 3 caracteres', () => {
    expect(validateExerciseForm({ ...base, name: 'ab' })[0].field).toBe('name');
  });

  it('rejeita nome absurdamente longo', () => {
    // exercises.name não tem check de tamanho, mas o picker fica ilegível.
    expect(validateExerciseForm({ ...base, name: 'x'.repeat(81) })[0].field).toBe(
      'name',
    );
  });

  it('exige grupo muscular', () => {
    expect(validateExerciseForm({ ...base, groupId: '' })).toEqual([
      { field: 'groupId', message: 'Escolhe o grupo muscular.' },
    ]);
  });

  it('rejeita URL de vídeo inválida', () => {
    expect(
      validateExerciseForm({ ...base, videoUrl: 'https://vimeo.com/1' }),
    ).toEqual([{ field: 'videoUrl', message: 'Link do YouTube inválido.' }]);
  });

  it('aceita URL de vídeo vazia (campo opcional)', () => {
    expect(validateExerciseForm({ ...base, videoUrl: '  ' })).toEqual([]);
  });

  it('acumula mais de um erro', () => {
    const errs = validateExerciseForm({ ...base, name: '', groupId: '' });
    expect(errs.map((e) => e.field)).toEqual(['name', 'groupId']);
  });
});

describe('defaultRequiresLowerLimbs', () => {
  // Default vem da distribuição real do catálogo (medida em 2026-08-26):
  // legs 50/50 exigem perna, cardio 33/36, core 30/37, full_body 26/40 —
  // contra chest 0/25, biceps 0/14, triceps 0/13, back 8/32, shoulders 3/23.
  it('grupos majoritariamente de perna começam marcados como Sim', () => {
    for (const slug of ['legs', 'cardio', 'full_body', 'core']) {
      expect(defaultRequiresLowerLimbs(slug)).toBe(true);
    }
  });

  it('grupos de tronco e braço começam como Não', () => {
    for (const slug of ['chest', 'back', 'shoulders', 'biceps', 'triceps']) {
      expect(defaultRequiresLowerLimbs(slug)).toBe(false);
    }
  });

  it('grupo desconhecido cai no lado seguro (Sim)', () => {
    expect(defaultRequiresLowerLimbs('grupo_novo')).toBe(true);
    expect(defaultRequiresLowerLimbs(null)).toBe(true);
  });
});

describe('buildExerciseRow', () => {
  it('monta a linha com dono, visibilidade e imagens', () => {
    expect(
      buildExerciseRow({
        values: base,
        ownerId: 'coach-1',
        imageUrls: ['https://cdn/0.jpg', 'https://cdn/1.jpg'],
      }),
    ).toEqual({
      group_id: 'group-peito',
      name: 'Supino Ravi',
      equipment: 'Barra',
      modality: 'musculacao',
      owner_id: 'coach-1',
      visibility: 'exclusivo',
      video_url: null,
      image_urls: ['https://cdn/0.jpg', 'https://cdn/1.jpg'],
      requires_lower_limbs: false,
    });
  });

  it('trima o nome e manda equipamento vazio como null', () => {
    const row = buildExerciseRow({
      values: { ...base, name: '  Supino Ravi  ', equipment: '   ' },
      ownerId: 'coach-1',
      imageUrls: [],
    });
    expect(row.name).toBe('Supino Ravi');
    expect(row.equipment).toBeNull();
  });

  it('manda image_urls como null quando não há imagem', () => {
    expect(
      buildExerciseRow({ values: base, ownerId: 'coach-1', imageUrls: [] })
        .image_urls,
    ).toBeNull();
  });

  it('normaliza a URL do vídeo', () => {
    expect(
      buildExerciseRow({
        values: { ...base, videoUrl: 'youtu.be/dQw4w9WgXcQ' },
        ownerId: 'coach-1',
        imageUrls: [],
      }).video_url,
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('carrega o requires_lower_limbs escolhido no form', () => {
    expect(
      buildExerciseRow({
        values: { ...base, requiresLowerLimbs: true },
        ownerId: 'coach-1',
        imageUrls: [],
      }).requires_lower_limbs,
    ).toBe(true);
  });
});
