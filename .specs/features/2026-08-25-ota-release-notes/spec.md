# Spec — Release notes no modal de OTA

**Data:** 2026-08-25 · **Escopo:** Medium · **Origem:** BACKLOG.md #3 (leva de 2026-08-25)

## Problema

O modal de atualização OTA mostra hoje um texto genérico fixo (`app/_layout.tsx:57-58`):
*"Uma nova versão do app foi baixada. Aplicar agora reinicia o Persona Fit em alguns segundos."*
O usuário não sabe o que muda — não há incentivo pra atualizar agora em vez de "Mais tarde".

## Objetivo

Exibir um "o que há de novo" estruturado em três categorias — 🔧 **ajustes**, ✨ **melhorias**,
🚀 **novidades** — lido do manifest do update disponível, com fallback silencioso pro texto
genérico atual quando não houver notas.

## Requisitos

| ID | Requisito |
|---|---|
| **OTA-01** | O texto das notas vem de `extra.releaseNotes` do **manifest do update disponível** (`checkForUpdateAsync()`), não do bundle em execução. |
| **OTA-02** | O parsing é uma função **pura** em `src/lib/`, sem dependência de `expo-updates` nem de React — testável em vitest. |
| **OTA-03** | Notas ausentes, vazias ou malformadas → **fallback silencioso** pro texto genérico atual. Nunca lançar exceção, nunca exibir modal vazio ou quebrado. |
| **OTA-04** | O `ConfirmModal` (15 callers) **não muda de contrato**: `message?: string` permanece. Conteúdo rico entra por prop novo e opcional. |
| **OTA-05** | O bloco `extra` de `app.config.ts` passa a declarar `releaseNotes`, preenchido a cada publicação de update. |
| **OTA-06** | Com notas, a frase do modal é curta (a lista vem logo abaixo). Sem notas, o texto genérico de hoje é preservado palavra por palavra. |
| **OTA-07** | As seções aparecem na ordem 🚀 novidades → ✨ melhorias → 🔧 ajustes, e seção sem item é omitida. |

## Critérios de aceite

- **QUANDO** o manifest do update traz `releaseNotes` com as 3 categorias preenchidas
  **ENTÃO** o modal lista as três seções, cada uma com seu emoji e seus itens. *(OTA-01, OTA-04)*
- **QUANDO** uma categoria está ausente ou não é array
  **ENTÃO** ela é omitida da UI e as outras continuam sendo exibidas. *(OTA-03)*
- **QUANDO** um item é string vazia ou só espaços
  **ENTÃO** ele é removido da lista. *(OTA-03)*
- **QUANDO** `extra.releaseNotes` não existe, não é objeto, ou todas as categorias ficam vazias
  após normalização **ENTÃO** o parser retorna `null` e o modal usa o texto genérico. *(OTA-03)*
- **QUANDO** o manifest é um `EmbeddedManifest` (sem `extra`)
  **ENTÃO** o parser retorna `null` sem lançar. *(OTA-02, OTA-03)*
- **QUANDO** existem notas **ENTÃO** o modal usa a frase curta; **QUANDO** não existem
  **ENTÃO** usa o texto genérico anterior, inalterado. *(OTA-06)*
- **QUANDO** só uma categoria tem itens **ENTÃO** só a seção dela é renderizada, na posição
  correta da ordem 🚀 → ✨ → 🔧. *(OTA-07)*
- **QUANDO** a chave em `app.config.ts` é grafada errada (`novidade` em vez de `novidades`)
  **ENTÃO** o parser não a reconhece e cai no fallback genérico, silenciosamente — é o modo de
  falha mais provável em produção, e é intencional. *(OTA-03, OTA-05)*
- **QUANDO** é a primeira execução após instalação limpa
  **ENTÃO** nada muda no comportamento atual — `shouldPromptForUpdate` continua suprimindo o
  modal; a captura das notas não altera essa política. *(OTA-01)*

## Decisões de design

1. **Prop novo, não breaking change.** `ConfirmModal` ganha `content?: ReactNode`, renderizado
   após `message`. Os 15 callers existentes seguem intactos. *(alternativa rejeitada: trocar
   `message: string` por `ReactNode` — superfície ampla, risco desnecessário.)*
2. **O parser recebe o manifest inteiro**, não o `extra` já desestruturado: `parseReleaseNotes(manifest: unknown)`
   navega `manifest.extra.expoClient.extra.releaseNotes` defensivamente. Assim o narrowing do union
   `ExpoUpdatesManifest | EmbeddedManifest` fica **coberto por teste** e o hook não precisa de
   type guard próprio.
3. **`Updates.updateMessage` não existe** no expo-updates 29.0.17 (a anotação original do backlog
   estava errada). O caminho é o manifest do check.

## Cobertura: o que os testes provam e o que não provam

O projeto não tem testes de componente nem de hook (`vitest.config.ts` coleta só
`src/lib/**/*.test.ts` e `supabase/functions/**/*.test.ts`; não existe nenhum `*.test.tsx`).
Logo:

| Requisito | Como é verificado |
|---|---|
| OTA-02, OTA-03, OTA-06, OTA-07 | **Testes vitest** sobre as funções puras. |
| **OTA-01** (a fonte é o manifest do update disponível, não `Updates.manifest`) | **Sem cobertura automatizada.** A função pura não sabe de onde veio o manifest. Trocar `check.manifest` por `Updates.manifest` em `useOtaUpdate.ts` não quebraria nenhum teste — só revisão de código e o roteiro manual pegam. |
| **OTA-04** (contrato do `ConfirmModal` intacto) | Apenas `tsc --noEmit`. "Testado" aqui significa "compila", não "comportamento verificado". |
| **OTA-05** (`app.config.ts` preenchido antes de cada publish) | Nada automatizado — falha silenciosa por design. |

## Fora de escopo

- Automatizar o preenchimento das notas a partir do `--message` do `eas update` (sem API pública
  que exponha isso no cliente).
- Histórico de notas de versões anteriores.

## Nota operacional

`extra.releaseNotes` precisa ser atualizado em `app.config.ts` **antes de cada** `eas update`,
senão o update sai sem notas (e cai no fallback, sem erro visível).
