import { describe, it, expect } from 'vitest';
import {
  UFS,
  UF_NOMES,
  isValidUf,
  municipiosDaUf,
  filtrarMunicipios,
  findMunicipio,
} from './localidades';

describe('localidades', () => {
  it('tem as 27 UFs com nome', () => {
    expect(UFS.length).toBe(27);
    for (const uf of UFS) {
      expect(UF_NOMES[uf]).toBeTruthy();
    }
  });

  it('valida UF ignorando caixa', () => {
    expect(isValidUf('SP')).toBe(true);
    expect(isValidUf('sp')).toBe(true);
    expect(isValidUf('XX')).toBe(false);
    expect(isValidUf(null)).toBe(false);
  });

  it('lista municípios da UF em ordem alfabética', () => {
    const sp = municipiosDaUf('SP');
    expect(sp.length).toBeGreaterThan(600);
    expect(sp.map((m) => m.nome)).toContain('Campinas');
    const nomes = sp.map((m) => m.nome);
    expect([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))).toEqual(nomes);
  });

  it('devolve lista vazia pra UF inexistente', () => {
    expect(municipiosDaUf('XX')).toEqual([]);
    expect(municipiosDaUf(null)).toEqual([]);
  });

  it('filtra ignorando acento e caixa', () => {
    const r = filtrarMunicipios('SP', 'sao paulo');
    expect(r.map((m) => m.nome)).toContain('São Paulo');
    expect(filtrarMunicipios('SP', 'CAMPINAS')[0].nome).toBe('Campinas');
  });

  it('filtro vazio devolve a lista toda', () => {
    expect(filtrarMunicipios('AC', '').length).toBe(municipiosDaUf('AC').length);
  });

  it('acha o município com código IBGE', () => {
    const m = findMunicipio('SP', 'campinas');
    expect(m?.ibge).toBe(3509502);
  });

  it('não confunde cidade de mesmo nome entre UFs', () => {
    const rs = findMunicipio('RS', 'Bom Jesus');
    const sc = findMunicipio('SC', 'Bom Jesus');
    expect(rs).not.toBeNull();
    expect(sc).not.toBeNull();
    expect(rs!.ibge).not.toBe(sc!.ibge);
  });
});
