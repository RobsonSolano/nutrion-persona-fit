import { describe, it, expect } from 'vitest';
import {
  formatCardioMetrics,
  metricTypeFromGroup,
  validateCardioMetrics,
} from './cardioMetrics';

describe('metricTypeFromGroup', () => {
  it('CAR-02: grupo "cardio" → cardio', () => {
    expect(metricTypeFromGroup('cardio')).toBe('cardio');
  });

  it('CAR-02: qualquer outro grupo → strength', () => {
    expect(metricTypeFromGroup('peito')).toBe('strength');
    expect(metricTypeFromGroup('costas')).toBe('strength');
    expect(metricTypeFromGroup('full-body')).toBe('strength');
  });

  it('CAR-01: grupo desconhecido/ausente → strength (default seguro)', () => {
    expect(metricTypeFromGroup(null)).toBe('strength');
    expect(metricTypeFromGroup(undefined)).toBe('strength');
    expect(metricTypeFromGroup('')).toBe('strength');
  });

  it('CAR-02: não depende de caixa nem de espaço em volta', () => {
    expect(metricTypeFromGroup('Cardio')).toBe('cardio');
    expect(metricTypeFromGroup(' cardio ')).toBe('cardio');
  });
});

describe('formatCardioMetrics', () => {
  it('CAR-06: faixa de distância vira "3–5 km"', () => {
    expect(
      formatCardioMetrics({ distance_min_m: 3000, distance_max_m: 5000 }),
    ).toEqual([{ kind: 'distance', label: '3–5 km' }]);
  });

  it('CAR-06: distância única mostra só um valor', () => {
    expect(formatCardioMetrics({ distance_min_m: 3000 })).toEqual([
      { kind: 'distance', label: '3 km' },
    ]);
    expect(formatCardioMetrics({ distance_max_m: 5000 })).toEqual([
      { kind: 'distance', label: '5 km' },
    ]);
  });

  it('CAR-06: abaixo de 1 km fica em metros (natação, tiros)', () => {
    expect(formatCardioMetrics({ distance_min_m: 800 })).toEqual([
      { kind: 'distance', label: '800 m' },
    ]);
    expect(formatCardioMetrics({ distance_min_m: 100, distance_max_m: 400 })).toEqual([
      { kind: 'distance', label: '100–400 m' },
    ]);
  });

  it('CAR-06: km quebrado mantém uma decimal', () => {
    expect(formatCardioMetrics({ distance_min_m: 2500 })).toEqual([
      { kind: 'distance', label: '2,5 km' },
    ]);
  });

  it('CAR-06: faixa que cruza 1 km usa a MESMA unidade nos dois lados', () => {
    // 800m–3000m: formatar cada lado sozinho daria "800 m–3 km", misturando
    // unidades na mesma faixa.
    expect(formatCardioMetrics({ distance_min_m: 800, distance_max_m: 3000 })).toEqual([
      { kind: 'distance', label: '0,8–3 km' },
    ]);
  });

  it('CAR-06: tempo e cadência viram chips próprios, na ordem distância → tempo → RPM', () => {
    expect(
      formatCardioMetrics({
        distance_min_m: 5000,
        duration_min: 30,
        cadence_rpm: 80,
      }),
    ).toEqual([
      { kind: 'distance', label: '5 km' },
      { kind: 'duration', label: '30 min' },
      { kind: 'cadence', label: '80 RPM' },
    ]);
  });

  it('CAR-06: campos ausentes ou zerados são omitidos', () => {
    expect(formatCardioMetrics({})).toEqual([]);
    expect(formatCardioMetrics({ distance_min_m: null, cadence_rpm: null })).toEqual([]);
    expect(formatCardioMetrics({ distance_min_m: 0, duration_min: 0 })).toEqual([]);
  });
});

describe('validateCardioMetrics', () => {
  it('CAR-03: distância máxima menor que a mínima é rejeitada', () => {
    const erro = validateCardioMetrics({ distance_min_m: 5000, distance_max_m: 3000 });
    expect(erro).toBeTruthy();
    expect(erro).toMatch(/distância/i);
  });

  it('CAR-03: valores negativos são rejeitados', () => {
    expect(validateCardioMetrics({ distance_min_m: -100 })).toBeTruthy();
    expect(validateCardioMetrics({ cadence_rpm: -1 })).toBeTruthy();
    expect(validateCardioMetrics({ duration_min: -5 })).toBeTruthy();
  });

  it('CAR-03: zero é tratado como "não informado", não como valor', () => {
    // O form usa string vazia → 0 em alguns caminhos. Zero não pode disparar
    // "máxima menor que a mínima" nem ser gravado como distância real.
    expect(validateCardioMetrics({ distance_min_m: 100, distance_max_m: 0 })).toBeNull();
    expect(validateCardioMetrics({ distance_min_m: 0, distance_max_m: 0 })).toBeNull();
  });

  it('CAR-03: valor absurdo é barrado antes de estourar no banco (int4)', () => {
    // Sem teto, um número gigante passa aqui e falha no INSERT com erro
    // genérico "não consegui salvar".
    expect(validateCardioMetrics({ distance_min_m: 9_000_000 })).toBeTruthy();
    expect(validateCardioMetrics({ cadence_rpm: 5000 })).toBeTruthy();
    expect(validateCardioMetrics({ duration_min: 5000 })).toBeTruthy();
  });

  it('CAR-03: limites plausíveis passam (ultramaratona, cadência alta)', () => {
    expect(validateCardioMetrics({ distance_min_m: 100_000 })).toBeNull();
    expect(validateCardioMetrics({ cadence_rpm: 200 })).toBeNull();
    expect(validateCardioMetrics({ duration_min: 600 })).toBeNull();
  });

  it('CAR-03: combinação válida passa', () => {
    expect(
      validateCardioMetrics({
        distance_min_m: 3000,
        distance_max_m: 5000,
        duration_min: 30,
        cadence_rpm: 80,
      }),
    ).toBeNull();
  });

  it('CAR-03: tudo vazio passa (todos os campos são opcionais)', () => {
    expect(validateCardioMetrics({})).toBeNull();
  });

  it('CAR-03: só o máximo preenchido passa (não exige o par)', () => {
    expect(validateCardioMetrics({ distance_max_m: 5000 })).toBeNull();
  });
});
