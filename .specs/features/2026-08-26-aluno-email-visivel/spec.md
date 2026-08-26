# Email do aluno visível para o professor

**Data:** 2026-08-26
**Escopo:** Small (migration + type + 1 tela)
**Branch:** `feature/aluno-email-visivel`

## Problema

No perfil do aluno (`app/(coach)/aluno/[id]/index.tsx`) o professor não vê o
e-mail do aluno. Consequência prática relatada pelo dev: depois de cadastrar
um aluno, o professor diz "vai chegar um e-mail pra você", o aluno pergunta
"qual e-mail?" e o professor **não tem onde consultar** — precisa lembrar de
cabeça ou pedir pro aluno.

## Causa raiz

`public.profiles` não tem coluna `email`. O e-mail vive só em `auth.users`,
que o client não lê (nem com RLS — é schema `auth`). O `coach-create-student`
recebe o e-mail no body, cria o usuário via Admin API e **não persiste** em
nenhuma tabela consultável.

## Requisitos

| ID | Requisito |
|----|-----------|
| EML-01 | `public.profiles` tem coluna `email text` |
| EML-02 | Backfill: todos os profiles existentes recebem o e-mail de `auth.users` |
| EML-03 | Novos signups gravam o e-mail no profile (via `handle_new_user`) |
| EML-04 | Troca de e-mail em `auth.users` propaga pro profile (trigger de update) |
| EML-05 | O professor vê o e-mail no perfil do aluno, em "Saúde / contexto"→ não: em bloco próprio de identificação |
| EML-06 | O e-mail é selecionável (long-press copia no Android) — sem dependência nativa nova |
| EML-07 | RLS não muda: a policy `profiles_select_own` já permite `coach_id = auth.uid()` |

## Fora de escopo

- **Botão "copiar"**: exigiria `expo-clipboard`, dependência nativa → APK novo.
  Pré-lançamento a regra é OTA-only. Texto selecionável resolve (long-press no
  Android abre "Copiar").
- Exibir e-mail na lista de alunos (`(coach)/index.tsx`) — só no detalhe.

## Cobertura de teste

| ID | Cobertura |
|----|-----------|
| EML-01..04 | Migration idempotente — verificação manual via `db:push` + query |
| EML-05..06 | UAT no emulador |
| EML-07 | Sem mudança — policy existente já cobre |

Sem lógica pura nova → nenhum teste automatizado adicionado. A migration é
verificada por inspeção + smoke no app.
