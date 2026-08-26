# Cadastro de exercício pelo professor (Exclusivo / Público)

**Data:** 2026-07-29
**Autor:** Robson Solano (com Claude)
**Status:** Design aprovado — pendente review do spec

---

## Problema

Hoje **não existe** cadastro manual de exercício no app. A única porta pela qual um exercício novo nasce é o fluxo de **importar treino com IA**: quando a IA não casa o nome com o catálogo (`matched_exercise_id: null` em `src/components/coach/ImportWorkoutPreview.tsx:434`), a edge function `coach-save-imported-workout/index.ts:155` cria a linha em `public.exercises` usando **service role**.

Duas consequências:

1. **O professor não consegue cadastrar um exercício próprio.** O `ExercisePickerModal` (`src/components/routine/RoutineEditor.tsx:586`) apenas lista o catálogo. Se o exercício que ele usa com os alunos não existe, não há caminho — só importar um treino inteiro por IA.
2. **Não existe noção de dono nem de visibilidade.** `public.exercises` não tem coluna de owner e a policy de leitura é `for select using (true)` (`supabase/migrations/20260420120000_exercises_and_water.sql:93`). Todo exercício criado via import cai no **catálogo global**, visível para outros professores, alunos de outros professores e usuários avulsos — e entra no prompt da IA de todos. É uma poluição silenciosa do catálogo que já acontece em produção.

**Objetivo:** um botão `+ novo exercício` no picker que abre um modal de cadastro (título, grupo muscular, tipo/modalidade, equipamento, até 2 imagens, link do YouTube) com escolha entre **Exclusivo** e **Público**, vinculando o exercício ao professor que o criou.

## Decisões de produto (travadas)

1. **Semântica da visibilidade:**
   - **Exclusivo** → só o professor dono e os alunos vinculados a ele (`profiles.coach_id`) enxergam.
   - **Público** → entra no **catálogo global do app**: todos os professores, todos os alunos e usuários avulsos.
2. **Quem pode cadastrar:** apenas `role = 'professor'` **com tier `premium`**. Não reusa o flag `ai_coach` (que já é `true` no Pro) — é um check próprio de `tier = 'premium'`.
3. **Onde vive a entrada:** botão `+ novo exercício` **dentro do `ExercisePickerModal`**, no estado de "nenhum exercício encontrado" e no rodapé da lista. Grupo e modalidade chegam pré-preenchidos do contexto do picker.
4. **Formato:** **modal empilhado** sobre o picker. Nenhuma rota nova.
5. **Editar:** exercícios com `owner_id = auth.uid()` ganham badge "meu" + ícone de lápis no picker, reabrindo o mesmo modal em modo edição.
6. **Excluir:** **apenas o dono** (o professor que criou). Aluno nunca deleta; professor não deleta exercício de outro professor nem do catálogo seed.
7. **Import por IA passa a criar exercício com dono e `visibility = 'exclusivo'`.** Muda o comportamento atual (que publica no global anonimamente): quem importou um PDF de treino não pediu para publicar nada no app inteiro.
8. **Equipamento** entra no form como campo opcional. O campo rotulado **"Tipo"** no form é a `modality` (musculação, calistenia, crossfit, corrida, genérico) — não confundir com equipamento.
9. **Copy do radio:** título "Exclusivo: só você e seus alunos veem. Público: entra no catálogo do app."

## Restrição dura

**OTA-only, zero dependência nativa nova.** Verificado:

- `expo-image-picker@17.0.11`, `expo-image-manipulator@~14.0.8` e `expo-file-system@~19.0.22` já estão no `package.json` e em uso (`src/hooks/useImagePicker.ts`, `src/components/AvatarPicker.tsx`, `src/components/coach/PosturePhotoSection.tsx`).
- Nenhuma alteração em `app.config.ts` (plugins, permissões, versão nativa).
- **Nada de UUID no cliente:** não há lib de uuid nem `expo-crypto` no projeto, e adicionar `expo-crypto` seria módulo nativo → build. O path das imagens usa **timestamp**, seguindo o padrão de `src/services/avatar.ts:28`.

Entrega: `db:push` (migration) + `fn:deploy` (5 functions, ver seção Entrega) + `eas update --branch preview`. Nenhum dos três troca o binário.

---

## Arquitetura

### 1. Migration — `supabase/migrations/20260729000000_coach_custom_exercises.sql`

**Colunas novas em `public.exercises`:**

```sql
alter table public.exercises
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists visibility text not null default 'publico';
```

- `owner_id` **default null** → null significa "veio do seed original".
- `visibility` é **`not null default 'publico'`** de propósito. As ~500 linhas do seed precisam continuar visíveis para todos, e o default resolve isso sem nenhum `UPDATE` (Postgres 11+ adiciona coluna com default sem reescrever a tabela). Um `null` ali seria um terceiro estado ambíguo que toda query teria que tratar.

Check + índices:

```sql
alter table public.exercises
  add constraint exercises_visibility_check
  check (visibility in ('exclusivo', 'publico'));

create index if not exists exercises_owner_id_idx on public.exercises (owner_id);
create index if not exists exercises_visibility_idx on public.exercises (visibility);
```

**Troca da constraint de unicidade — ponto mais delicado da migration.** Hoje `unique (group_id, name)` impediria dois professores de cadastrarem "Supino Ravi":

```sql
alter table public.exercises drop constraint if exists exercises_group_id_name_key;

create unique index if not exists exercises_seed_group_name_uk
  on public.exercises (group_id, name) where owner_id is null;

create unique index if not exists exercises_owner_group_name_uk
  on public.exercises (group_id, name, owner_id) where owner_id is not null;
```

**Policy de leitura** (substitui o `using (true)`):

```sql
drop policy if exists "exercises_select_all" on public.exercises;
create policy "exercises_select_visible" on public.exercises
  for select using (
    visibility = 'publico'
    or owner_id = (select auth.uid())
    or owner_id = (select coach_id from public.profiles where id = (select auth.uid()))
  );
```

Os subqueries vão entre parênteses (`(select auth.uid())`) para o Postgres avaliar uma vez por statement em vez de por linha.

**Policies de escrita** (hoje não existe nenhuma — só service role escreve):

```sql
create policy "exercises_insert_premium_coach" on public.exercises
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.role = 'professor'
    )
    and (public._resolve_entitlement((select auth.uid())) ->> 'tier') = 'premium'
  );

create policy "exercises_update_own" on public.exercises
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "exercises_delete_own" on public.exercises
  for delete to authenticated
  using (owner_id = (select auth.uid()));
```

O gate de tier vive **no banco**: `_resolve_entitlement` já é `security definer` (`supabase/migrations/20260722000000_student_limits_free2_pro5.sql:10`), então é chamável em policy. O `with check` no update é o que impede o professor de mudar `owner_id` para outro dono ou para `null` (o que transformaria o exercício em seed intocável).

**Bucket `exercise-photos`** — público, 2 MB, jpg/png/webp, policies copiadas de `profile-photos` (`20260523000000_profile_avatars.sql`): leitura pública; insert/update/delete só quando `(storage.foldername(name))[1] = auth.uid()::text`. Público é coerente porque `image_urls` já guarda URLs públicas (jsDelivr).

### 2. Serviços — `src/services/exercises.ts`

```ts
type ExerciseInput = {
  id?: string;              // presente = edição
  name: string;
  group_id: string;
  modality: Modality;
  equipment: string | null;
  visibility: 'exclusivo' | 'publico';
  video_url: string | null;
  imageUris: string[];      // até 2, locais (file://) ou URLs já salvas
};

export async function saveExercise(input: ExerciseInput): Promise<Exercise>
export async function deleteExercise(id: string): Promise<void>
```

**Ordem do save (é o que garante atomicidade):**

1. Redimensiona cada imagem com `manipulateAsync` (720px, JPEG 0.85 — maior que o avatar porque é demonstração de movimento).
2. `readFileAsArrayBuffer` de `src/lib/uploadFile.ts` (o comentário do arquivo explica por que `fetch().blob()` não funciona em RN).
3. Upload para `<coach_id>/<timestamp>-<n>.jpg`.
4. `getPublicUrl` das duas.
5. **Um único insert/update** já com `image_urls` preenchido.

Se o passo 5 falhar, sobram arquivos órfãos no bucket → limpeza best-effort, mesmo padrão de `cleanupOldAvatars` (`src/services/avatar.ts:63`). Nunca existe exercício sem imagem quando o professor pediu imagem.

`deleteExercise` remove a linha e, best-effort, os arquivos da pasta.

### 3. Hook — `src/hooks/useExercises.ts`

`useSaveExercise()` e `useDeleteExercise()` (mutations) invalidando **duas** query keys:

- `queryKeys.exercisesByGroup(groupId, modality)`
- `queryKeys.allExercises()`

**A segunda é obrigatória e fácil de esquecer:** `useExerciseImagesMap` usa `allExercises()` com `staleTime` de **60 minutos** (`src/hooks/useExercises.ts:41`). Sem invalidar, o exercício aparece no picker mas fica **sem imagem por até uma hora**.

### 4. UI

**Refactor pontual, no caminho:** `ExercisePickerModal` é hoje uma função privada dentro de um arquivo de **755 linhas** consumido por **6 telas**. Vamos adicionar botão, badge, ícone de editar e um form inteiro — isso levaria o arquivo a 1000+.

| Arquivo | O quê |
|---|---|
| `src/components/routine/ExercisePickerModal.tsx` | **novo** — move o modal para fora do `RoutineEditor` sem mudar comportamento |
| `src/components/routine/ExerciseFormModal.tsx` | **novo** — o form de cadastro/edição |
| `src/components/routine/RoutineEditor.tsx` | passa a importar o picker |
| `src/lib/youtubeUrl.ts` | **novo** — validação/normalização da URL (puro, testável) |

**O gate é correção, não só cobrança.** `RoutineEditor` é compartilhado com `app/rotina/nova.tsx` e `app/rotina/[id].tsx` — o usuário montando a própria rotina. Sem o gate `role === 'professor' && tier === 'premium'` (via `useEntitlement()`), o botão `+` apareceria para aluno e usuário avulso.

O botão só é renderizado para quem passa no gate, então o caminho do 402 nunca acontece na prática. Isso é deliberado: rejeitar **depois** de o professor preencher o form e subir duas imagens seria a pior hora possível. A policy de insert é a rede de segurança contra um cliente com anon key.

Layout do form (grupo e modalidade pré-preenchidos do picker, editáveis):

```
┌─ Novo exercício ─────────────────────┐
│ Título *        [ Supino Ravi      ] │
│ Grupo muscular  [ Peito         ▾ ]  │
│ Tipo            [ Musculação    ▾ ]  │
│ Equipamento     [ Barra           ]  │  ← opcional
├──────────────────────────────────────┤
│ Exclusivo: só você e seus alunos     │
│ veem. Público: entra no catálogo     │
│ do app.                              │
│   ◉ Exclusivo      ○ Público         │
├──────────────────────────────────────┤
│ Imagens (até 2)                      │
│   [ + foto ]  [ + foto ]             │
│ Vídeo do YouTube                     │
│   [ https://youtu.be/...          ]  │
└──────────────────────────────────────┘
```

Ao salvar, o picker **auto-seleciona** o exercício recém-criado, devolvendo o professor à rotina que ele estava montando.

No picker, exercícios com `owner_id = auth.uid()` recebem badge "meu" + lápis (editar) e, no modo edição, a opção de excluir com confirm.

### 5. Leituras com service role — obrigatório

Service role **ignora RLS**, então a policy de leitura não protege as edge functions. Sem filtro explícito, a IA de um professor recomendaria o exercício exclusivo de outro:

| Local | Mudança |
|---|---|
| `supabase/functions/coach-import-workout-ai/index.ts:218` | `.or('visibility.eq.publico,owner_id.eq.<caller.id>')` |
| `supabase/functions/_shared/plan-generator.ts:277` | idem, mas o dono relevante é o **professor do aluno** (`profiles.coach_id` do usuário do plano) |
| `supabase/functions/_shared/fallbackPlan.ts:92` | busca nomes fixos do seed → adicionar `.is('owner_id', null)` para não casar com homônimo de professor |
| `supabase/functions/coach-save-imported-workout/index.ts:155` | passa a gravar `owner_id: caller.id` e `visibility: 'exclusivo'` (decisão 7) |

### 6. Tratamento de erro

| Situação | Comportamento |
|---|---|
| Upload falha | Alert + **mantém o form preenchido** (não perde o que foi digitado) |
| Unique violation (`23505`) | "Já existe um exercício com esse nome nesse grupo" |
| Nome já existe no catálogo visível | Checagem **antes** de salvar: "Já existe *Supino reto* — usar o existente?" com atalho para selecioná-lo |
| URL do YouTube inválida | Validação local antes de salvar, erro no campo |
| Imagem muito pesada | Já tratado pelo `ImageTooLargeError` do `useImagePicker` |
| Gate barrou no banco | Não deve acontecer (UI já filtrou); trata como erro genérico |

### 7. Testes

Vitest, nas partes puras (sem device):

- `src/lib/youtubeUrl.test.ts` — validação/normalização (youtu.be, watch?v=, shorts, URL inválida).
- normalização de nome para o dedup (case/acento/espaço).
- montagem do payload do insert (owner_id, visibility, image_urls).
- lógica de visibilidade como função pura.

Upload, picker e RLS ficam para o UAT no preview — mesmo padrão de `src/lib/needsUpgrade.test.ts`.

---

## Riscos conhecidos

1. **Não há moderação do catálogo global.** Público = global foi decisão explícita (decisão 1), mas não existe área admin no app. Um nome errado ou duplicado publicado por um professor fica visível para todos, e só o dono (ou SQL direto) desfaz. O `owner_id` garante rastreabilidade — dá para achar e remover por SQL.
2. **Duplicata é atenuada, não impedida.** Dois "Supino reto" podem coexistir (o do seed e o de um professor público) e aparecer duplicados no picker de todos. A checagem de nome antes de salvar reduz, não elimina.
3. **Aluno desvinculado perde acesso a exercício exclusivo.** O dano é limitado por design: `workout_routine_exercises.exercise_name` é snapshot `not null` (`20260422120000_workout_routines.sql:39`), então nome, séries e cargas continuam. Só imagens e vídeo desaparecem do preview.
4. **Exclusão é segura por design.** `workout_routine_exercises.exercise_id`, `workout_template_exercises.exercise_id` e `workout_logs.exercise_id` são todos `on delete set null`. A rotina do aluno não quebra — perde o vínculo (imagens/vídeo). O confirm de exclusão avisa isso.

## Fora de escopo

- Tela "Meus exercícios" no menu do coach (listagem/gestão dedicada).
- Área admin para moderar ou promover exercícios ao catálogo global.
- Estado de "quarentena" (exercício aguardando aprovação).
- Cadastro por usuário avulso (`role = 'comum'`) ou por aluno.
- Migrar retroativamente os exercícios já criados pelo import por IA (ficam como seed público, `owner_id = null`).

## Entrega

1. `npm run db:push` — migration (colunas, policies, índices, bucket).
2. **Deploy de 5 functions.** As duas primeiras leem/escrevem o catálogo diretamente; as três últimas **bundlam** `_shared/plan-generator.ts` e `_shared/fallbackPlan.ts` — Deno inlina o shared no deploy, então uma function sem redeploy continua rodando a versão antiga e **segue vazando exercício exclusivo para o plano da IA**:
   - `coach-import-workout-ai` — leitura do catálogo
   - `coach-save-imported-workout` — passa a gravar `owner_id` + `visibility`
   - `coach-generate-plan` — bundla os `_shared`
   - `coach-save-student-plan` — bundla os `_shared`
   - `onboarding-plan` — bundla os `_shared`

   O `npm run fn:deploy` já sobe todas as functions do projeto, o que cobre as 5. Se preferir deploy cirúrgico, são esses 5 nomes.
3. `npm run update:preview` — OTA para a branch `preview`.

Nenhuma etapa gera build novo.
