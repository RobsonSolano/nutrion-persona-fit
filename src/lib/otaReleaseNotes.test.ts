import { describe, it, expect } from 'vitest';
import {
  getOtaModalMessage,
  parseReleaseNotes,
  seccoesVisiveis,
} from './otaReleaseNotes';

/** Monta um manifest do formato que o expo-updates devolve no checkForUpdateAsync. */
function manifestCom(releaseNotes: unknown) {
  return { extra: { expoClient: { extra: { releaseNotes } } } };
}

describe('parseReleaseNotes', () => {
  it('OTA-02: manifest com as 3 categorias preenchidas → devolve as 3 normalizadas', () => {
    const notes = parseReleaseNotes(
      manifestCom({
        ajustes: ['Corrige o cálculo de streak'],
        melhorias: ['Chat mais rápido', 'Ring de calorias mais legível'],
        novidades: ['Análise de prato por foto'],
      }),
    );

    expect(notes).toEqual({
      ajustes: ['Corrige o cálculo de streak'],
      melhorias: ['Chat mais rápido', 'Ring de calorias mais legível'],
      novidades: ['Análise de prato por foto'],
    });
  });

  it('OTA-03: categoria ausente → vira lista vazia, as outras seguem preenchidas', () => {
    const notes = parseReleaseNotes(
      manifestCom({ novidades: ['Modo cárdio no treino'] }),
    );

    expect(notes).toEqual({
      ajustes: [],
      melhorias: [],
      novidades: ['Modo cárdio no treino'],
    });
  });

  it('OTA-03: categoria que não é array é ignorada sem derrubar as demais', () => {
    const notes = parseReleaseNotes(
      manifestCom({
        ajustes: 'texto solto em vez de lista',
        melhorias: 42,
        novidades: ['Release notes no modal de OTA'],
      }),
    );

    expect(notes).toEqual({
      ajustes: [],
      melhorias: [],
      novidades: ['Release notes no modal de OTA'],
    });
  });

  it('OTA-03: item vazio, só espaços ou não-string é removido; o resto sofre trim', () => {
    const notes = parseReleaseNotes(
      manifestCom({
        ajustes: ['  Corrige push duplicado  ', '', '   ', null, 7, 'Ajusta hint de preço'],
      }),
    );

    expect(notes).toEqual({
      ajustes: ['Corrige push duplicado', 'Ajusta hint de preço'],
      melhorias: [],
      novidades: [],
    });
  });

  it('OTA-03: item feito só de caracteres invisíveis (zero-width) é removido', () => {
    // `trim()` sozinho não pega U+200B & cia — item colado de Notion/Docs
    // sobreviveria e viraria um bullet vazio no modal.
    const notes = parseReleaseNotes(
      manifestCom({
        ajustes: ['​', '﻿  ‍'],
        novidades: ['Release notes no OTA​'],
      }),
    );

    expect(notes).toEqual({
      ajustes: [],
      melhorias: [],
      novidades: ['Release notes no OTA'],
    });
  });

  it('OTA-03: array não conta como objeto de notas, nem carregando as chaves esperadas', () => {
    // Sem o guard `!Array.isArray` no isRecord, um array com propriedade
    // nomeada passaria como se fosse o objeto de notas.
    const arrayComChave = Object.assign(['x'], { novidades: ['vazou'] });

    expect(parseReleaseNotes(manifestCom(arrayComChave))).toBeNull();
  });

  it('OTA-03/OTA-05: chave grafada errada não é reconhecida (falha silenciosa, por design)', () => {
    // O erro humano mais provável em produção: singular em vez de plural, ou
    // maiúscula. Cai no texto genérico sem nenhum indício do typo.
    expect(parseReleaseNotes(manifestCom({ novidade: ['Item perdido'] }))).toBeNull();
    expect(parseReleaseNotes(manifestCom({ Novidades: ['Item perdido'] }))).toBeNull();
  });

  it('OTA-03: todas as categorias vazias após normalização → null (cai no texto genérico)', () => {
    expect(
      parseReleaseNotes(manifestCom({ ajustes: [], melhorias: ['  '], novidades: [] })),
    ).toBeNull();
  });

  it('OTA-03: releaseNotes ausente no extra → null', () => {
    expect(parseReleaseNotes({ extra: { expoClient: { extra: {} } } })).toBeNull();
  });

  it('OTA-03: releaseNotes que não é objeto → null', () => {
    expect(parseReleaseNotes(manifestCom('novidades: várias'))).toBeNull();
  });

  it('OTA-02: EmbeddedManifest (sem extra) → null, sem lançar', () => {
    expect(parseReleaseNotes({ id: 'abc', createdAt: '2026-08-25' })).toBeNull();
  });

  it('OTA-03: manifest nulo, undefined ou de tipo inesperado → null, sem lançar', () => {
    expect(parseReleaseNotes(null)).toBeNull();
    expect(parseReleaseNotes(undefined)).toBeNull();
    expect(parseReleaseNotes('manifest')).toBeNull();
    expect(parseReleaseNotes(123)).toBeNull();
    expect(parseReleaseNotes({ extra: null })).toBeNull();
    expect(parseReleaseNotes({ extra: { expoClient: null } })).toBeNull();
  });
});

describe('getOtaModalMessage', () => {
  it('OTA-06: com notas → frase curta, já que a lista aparece logo abaixo', () => {
    const msg = getOtaModalMessage({
      ajustes: [],
      melhorias: [],
      novidades: ['Modo cárdio'],
    });

    expect(msg).toBe(
      'Veja o que mudou — aplicar agora reinicia o Persona Fit em alguns segundos.',
    );
  });

  it('OTA-06: sem notas → mantém exatamente o texto genérico de antes da feature', () => {
    expect(getOtaModalMessage(null)).toBe(
      'Uma nova versão do app foi baixada. Aplicar agora reinicia o Persona Fit em alguns segundos.',
    );
  });
});

describe('seccoesVisiveis', () => {
  it('OTA-07: ordem é novidades → melhorias → ajustes, com emoji e título de cada uma', () => {
    const secoes = seccoesVisiveis({
      ajustes: ['a1'],
      melhorias: ['m1'],
      novidades: ['n1'],
    });

    expect(secoes).toEqual([
      { chave: 'novidades', emoji: '🚀', titulo: 'Novidades', itens: ['n1'] },
      { chave: 'melhorias', emoji: '✨', titulo: 'Melhorias', itens: ['m1'] },
      { chave: 'ajustes', emoji: '🔧', titulo: 'Ajustes', itens: ['a1'] },
    ]);
  });

  it('OTA-07: seção sem item é omitida, e as demais mantêm a ordem relativa', () => {
    const secoes = seccoesVisiveis({
      ajustes: ['Corrige push duplicado'],
      melhorias: [],
      novidades: ['Modo cárdio'],
    });

    expect(secoes.map((s) => s.chave)).toEqual(['novidades', 'ajustes']);
  });

  it('OTA-07: nenhuma categoria com item → lista vazia (não renderiza nada)', () => {
    expect(seccoesVisiveis({ ajustes: [], melhorias: [], novidades: [] })).toEqual([]);
  });
});
