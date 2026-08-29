// UFs e municípios do IBGE, embarcados no bundle (src/data/municipios.json,
// 27 UFs / 5.571 municípios, ~137KB).
//
// Por que embarcado e não por API: a busca de professor precisa dos selects
// de estado/cidade funcionando na hora, inclusive offline, e a lista muda de
// década em década. Uma chamada de rede aqui só adiciona spinner e ponto de
// falha. Regerar: baixar de
// servicodados.ibge.gov.br/api/v1/localidades/municipios e agrupar por UF.
//
// O código IBGE viaja junto porque nome de cidade se repete entre estados
// (Bom Jesus existe em 8 UFs) — é ele que identifica o município sem ambiguidade.

import data from '@/data/municipios.json';
import { foldText } from './text';

export type Municipio = { nome: string; ibge: number };

// O TS infere as tuplas do JSON como (string|number)[]; o `unknown` no meio
// é o custo de importar dado estático sem gerar tipos.
const RAW = data as unknown as {
  ufs: string[];
  municipios: Record<string, [string, number][]>;
};

export const UFS: readonly string[] = RAW.ufs;

export const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia',
  RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe',
  TO: 'Tocantins',
};

export function isValidUf(uf: string | null | undefined): boolean {
  return !!uf && UFS.includes(uf.toUpperCase());
}

export function municipiosDaUf(uf: string | null | undefined): Municipio[] {
  if (!uf) return [];
  const rows = RAW.municipios[uf.toUpperCase()];
  if (!rows) return [];
  return rows.map(([nome, ibge]) => ({ nome, ibge }));
}


/** Filtra a lista de uma UF pelo que o usuário digitou. Vazio = lista toda. */
export function filtrarMunicipios(uf: string, termo: string): Municipio[] {
  const todos = municipiosDaUf(uf);
  const t = foldText(termo);
  if (!t) return todos;
  return todos.filter((m) => foldText(m.nome).includes(t));
}

export function findMunicipio(uf: string, nome: string): Municipio | null {
  const alvo = foldText(nome);
  return municipiosDaUf(uf).find((m) => foldText(m.nome) === alvo) ?? null;
}
