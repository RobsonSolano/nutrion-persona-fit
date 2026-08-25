// Release notes do update OTA: parsing do manifest + o texto do modal.
// Lógica pura → testável sem RN/expo-updates, mesma razão de `otaPolicy.ts`.
//
// De onde vem: `Updates.checkForUpdateAsync()` devolve o manifest do update
// DISPONÍVEL (não o do bundle em execução), e dentro dele viaja o `extra` do
// app.config.ts daquela publicação — daí o caminho
// `manifest.extra.expoClient.extra.releaseNotes`.
//
// Por que declaramos o shape aqui em vez de importar os tipos do expo: assim o
// parsing não ganha dependência de compilação no SDK. Se o expo mudar o formato
// do manifest, nada quebra no build — passa a devolver `null` e o modal cai no
// texto genérico. O `Manifest` do SDK, aliás, é a união
// `ExpoUpdatesManifest | EmbeddedManifest` e só o primeiro tem `.extra`.
//
// Nada aqui lança: manifest estranho, categoria malformada ou notas ausentes
// retornam `null`.

export type ReleaseNotes = {
  ajustes: string[];
  melhorias: string[];
  novidades: string[];
};

/** Só o pedaço do manifest que nos interessa. */
type ManifestComNotas = {
  extra?: { expoClient?: { extra?: { releaseNotes?: unknown } } };
};

const MSG_COM_NOTAS =
  'Veja o que mudou — aplicar agora reinicia o Persona Fit em alguns segundos.';
const MSG_SEM_NOTAS =
  'Uma nova versão do app foi baixada. Aplicar agora reinicia o Persona Fit em alguns segundos.';

function isRecord(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

// Zero-width space/joiner e BOM sobrevivem ao `trim()` (não são White_Space),
// então um item colado de Notion/Docs viraria um bullet invisível no modal.
const INVISIVEIS = /[\u200B-\u200D\uFEFF]/g;

/** Mantém só strings com conteúdo real, já aparadas. */
function normalizarItens(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(INVISIVEIS, '').trim())
    .filter((item) => item.length > 0);
}

export function parseReleaseNotes(manifest: unknown): ReleaseNotes | null {
  // Optional chaining não lança nem quando um nível intermediário é string,
  // número ou array — o `isRecord` abaixo é o único guard necessário.
  const bruto = (manifest as ManifestComNotas | null | undefined)?.extra
    ?.expoClient?.extra?.releaseNotes;
  if (!isRecord(bruto)) return null;

  const notas: ReleaseNotes = {
    ajustes: normalizarItens(bruto.ajustes),
    melhorias: normalizarItens(bruto.melhorias),
    novidades: normalizarItens(bruto.novidades),
  };

  const semNada = [notas.ajustes, notas.melhorias, notas.novidades].every(
    (lista) => lista.length === 0,
  );
  return semNada ? null : notas;
}

/**
 * Texto do modal de atualização. Com notas, a frase é curta porque a lista
 * aparece logo abaixo; sem notas, mantém o texto genérico de sempre.
 */
export function getOtaModalMessage(releaseNotes: ReleaseNotes | null): string {
  return releaseNotes ? MSG_COM_NOTAS : MSG_SEM_NOTAS;
}

export type SecaoVisivel = {
  chave: keyof ReleaseNotes;
  emoji: string;
  titulo: string;
  itens: string[];
};

// Ordem proposital: o que é mais interessante primeiro.
const SECOES: readonly Omit<SecaoVisivel, 'itens'>[] = [
  { chave: 'novidades', emoji: '🚀', titulo: 'Novidades' },
  { chave: 'melhorias', emoji: '✨', titulo: 'Melhorias' },
  { chave: 'ajustes', emoji: '🔧', titulo: 'Ajustes' },
];

/**
 * Seções a renderizar, na ordem certa e já sem as vazias. Mora aqui, e não no
 * componente, porque o projeto não tem teste de componente — assim a ordem e a
 * omissão de seção vazia ficam cobertas por vitest, e o JSX vira um `.map` burro.
 */
export function seccoesVisiveis(notes: ReleaseNotes): SecaoVisivel[] {
  return SECOES.filter((secao) => notes[secao.chave].length > 0).map((secao) => ({
    ...secao,
    itens: notes[secao.chave],
  }));
}
