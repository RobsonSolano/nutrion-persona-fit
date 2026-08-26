# Cadastro de exercício pelo professor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao professor premium um botão `+ novo exercício` dentro do picker de exercícios, com cadastro em modal (título, grupo, modalidade, equipamento, até 2 imagens, link do YouTube) e escolha entre Exclusivo (só ele e seus alunos) e Público (catálogo global do app).

**Architecture:** O app grava direto em `public.exercises` via supabase-js; o gate de permissão vive na policy de RLS (`role = 'professor'` + `tier = 'premium'` via `_resolve_entitlement`), com a UI escondendo o botão para quem não passa. As imagens sobem antes para o bucket `exercise-photos` (path com timestamp, sem UUID), e o exercício é criado em **um único insert** já com `image_urls` preenchido — sem estado parcial. As edge functions que leem o catálogo com service role recebem filtro explícito de visibilidade, porque service role ignora RLS.

**Tech Stack:** Expo + React Native (NativeWind), Supabase (Postgres + RLS + Storage), TanStack Query, Deno (edge functions), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-29-cadastro-exercicio-professor-design.md`
**Branch:** `feature/exercicios-cadastro-professor` (já criada de `develop`)

## Global Constraints

- **OTA-only.** Nenhuma dependência nova, nenhuma alteração em `app.config.ts`. `expo-image-picker@17.0.11`, `expo-image-manipulator@~14.0.8` e `expo-file-system@~19.0.22` já estão no build. **Nunca** adicionar `expo-crypto` ou lib de uuid — é módulo nativo e obrigaria a gerar build.
- **Toda copy em português brasileiro, com acentuação correta.**
- Valores de `visibility` são exatamente `'exclusivo'` e `'publico'` (sem acento em "publico" — é valor de banco, não texto de UI).
- Bucket: `exercise-photos`. Path das imagens: `<coach_id>/<timestamp>-<n>.jpg` com `n` ∈ {0, 1}.
- Gate de permissão: `profile.role === 'professor' && entitlement.tier === 'premium'`. **Não** usar o flag `ai_coach` (é `true` no Pro também).
- Copy do radio (exata): título `Exclusivo: só você e seus alunos veem. Público: entra no catálogo do app.`
- Comando de teste: `npm test` (vitest). Typecheck: `npm run typecheck`. Lint: `npm run lint`.
- Ordem de gate pré-commit é fixa: `/simplify` **primeiro**, suite de testes **depois**. Nunca invertida.
- Um commit por task, Conventional Commits, scope `exercicios`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260729000000_coach_custom_exercises.sql` | **Criar.** Colunas, check, índices parciais, policies de RLS, bucket + policies de storage |
| `src/types/database.ts` | **Modificar.** `+2` campos em `Exercise` |
| `src/lib/youtubeUrl.ts` | **Criar.** Validação/normalização de URL do YouTube (puro, zero import de react-native) |
| `src/lib/exercisePayload.ts` | **Criar.** Normalização de nome para dedup + montagem do payload do insert (puro) |
| `src/services/exercises.ts` | **Modificar.** `saveExercise`, `deleteExercise`, upload/limpeza de imagens |
| `src/hooks/useExercises.ts` | **Modificar.** `useSaveExercise`, `useDeleteExercise`, `useCanCreateExercise` |
| `src/components/routine/ExercisePickerModal.tsx` | **Criar.** Extração do modal que hoje vive dentro do `RoutineEditor` |
| `src/components/routine/ExerciseFormModal.tsx` | **Criar.** Form de cadastro/edição |
| `src/components/routine/RoutineEditor.tsx` | **Modificar.** Remove o picker inline, passa a importar |
| `supabase/functions/coach-import-workout-ai/index.ts` | **Modificar.** Filtro de visibilidade na leitura |
| `supabase/functions/_shared/plan-generator.ts` | **Modificar.** Filtro de visibilidade na leitura |
| `supabase/functions/_shared/fallbackPlan.ts` | **Modificar.** `.is('owner_id', null)` |
| `supabase/functions/coach-save-imported-workout/index.ts` | **Modificar.** Grava `owner_id` + `visibility: 'exclusivo'` |

**Por que dois libs puros separados:** `src/lib/youtube.ts` já existe mas importa `Alert`/`Linking` do react-native, o que o torna não-testável no vitest sem mock. Os arquivos novos ficam livres de import de RN para que a lógica de validação e de montagem de payload tenha teste unitário real.

---

### Task 1: Migration — colunas, policies e bucket

**Files:**
- Create: `supabase/migrations/20260729000000_coach_custom_exercises.sql`

**Interfaces:**
- Consumes: nada.
- Produces: colunas `exercises.owner_id uuid|null` e `exercises.visibility text` (`'exclusivo' | 'publico'`, not null, default `'publico'`); bucket `exercise-photos`. Todas as tasks seguintes dependem destes nomes.

- [ ] **Step 1: Escrever a migration**

```sql
-- =====================================================================
-- NutriOn — Exercícios criados pelo professor (Exclusivo / Público)
-- Adiciona dono + visibilidade em public.exercises, troca a policy de
-- leitura global, cria policies de escrita restritas ao dono e o bucket
-- exercise-photos.
-- Idempotente — pode rodar múltiplas vezes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------
alter table public.exercises
  add column if not exists owner_id uuid references public.profiles(id) on delete cascade,
  add column if not exists visibility text not null default 'publico';

comment on column public.exercises.owner_id is
  'Professor que criou o exercício. Null = catálogo seed original.';
comment on column public.exercises.visibility is
  'exclusivo = só o dono e os alunos dele; publico = catálogo global do app.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_visibility_check'
  ) then
    alter table public.exercises
      add constraint exercises_visibility_check
      check (visibility in ('exclusivo', 'publico'));
  end if;
end $$;

create index if not exists exercises_owner_id_idx on public.exercises (owner_id);
create index if not exists exercises_visibility_idx on public.exercises (visibility);

-- ---------------------------------------------------------------------
-- 2. Unicidade por dono
-- A constraint original `unique (group_id, name)` impediria dois
-- professores de cadastrarem o mesmo nome. Vira dois índices parciais:
-- um pro catálogo seed, outro por dono.
-- ---------------------------------------------------------------------
alter table public.exercises drop constraint if exists exercises_group_id_name_key;

create unique index if not exists exercises_seed_group_name_uk
  on public.exercises (group_id, name)
  where owner_id is null;

create unique index if not exists exercises_owner_group_name_uk
  on public.exercises (group_id, name, owner_id)
  where owner_id is not null;

-- ---------------------------------------------------------------------
-- 3. Policy de leitura
-- Substitui o `using (true)`. Subqueries entre parênteses pro Postgres
-- avaliar uma vez por statement, não por linha.
-- ---------------------------------------------------------------------
drop policy if exists "exercises_select_all" on public.exercises;
drop policy if exists "exercises_select_visible" on public.exercises;
create policy "exercises_select_visible" on public.exercises
  for select using (
    visibility = 'publico'
    or owner_id = (select auth.uid())
    or owner_id = (select coach_id from public.profiles where id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 4. Policies de escrita — só professor premium cria; só o dono altera
-- ---------------------------------------------------------------------
drop policy if exists "exercises_insert_premium_coach" on public.exercises;
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

drop policy if exists "exercises_update_own" on public.exercises;
create policy "exercises_update_own" on public.exercises
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "exercises_delete_own" on public.exercises;
create policy "exercises_delete_own" on public.exercises
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Bucket exercise-photos (público, 2MB, jpg/png/webp)
-- Público é coerente: image_urls já guarda URLs públicas (jsDelivr).
-- Path layout: <coach_id>/<timestamp>-<n>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-photos',
  'exercise-photos',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "exercise_photos_public_read" on storage.objects;
create policy "exercise_photos_public_read" on storage.objects
  for select using (bucket_id = 'exercise-photos');

drop policy if exists "exercise_photos_insert_own" on storage.objects;
create policy "exercise_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'exercise-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "exercise_photos_update_own" on storage.objects;
create policy "exercise_photos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'exercise-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "exercise_photos_delete_own" on storage.objects;
create policy "exercise_photos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'exercise-photos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 2: Aplicar a migration**

Run: `npm run db:push`
Expected: aplica sem erro. Se reclamar do nome da constraint em `drop constraint if exists exercises_group_id_name_key`, confirmar o nome real com a query do Step 3 e ajustar.

- [ ] **Step 3: Verificar o estado do schema**

Rodar no SQL editor do Supabase (ou `supabase db shell`) e conferir cada saída:

```sql
-- (a) colunas criadas com os defaults certos
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_name = 'exercises' and column_name in ('owner_id', 'visibility');
-- Esperado: owner_id / uuid / YES / null
--           visibility / text / NO / 'publico'::text

-- (b) nenhum exercício do seed ficou invisível
select count(*) from public.exercises where visibility <> 'publico';
-- Esperado: 0

-- (c) a constraint antiga sumiu e os dois índices parciais existem
select indexname from pg_indexes
 where tablename = 'exercises'
   and indexname in ('exercises_seed_group_name_uk', 'exercises_owner_group_name_uk');
-- Esperado: as duas linhas

-- (d) policies no lugar
select policyname, cmd from pg_policies
 where tablename = 'exercises' order by cmd, policyname;
-- Esperado: exercises_delete_own (DELETE), exercises_insert_premium_coach (INSERT),
--           exercises_select_visible (SELECT), exercises_update_own (UPDATE)

-- (e) bucket criado
select id, public, file_size_limit from storage.buckets where id = 'exercise-photos';
-- Esperado: exercise-photos / true / 2097152
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260729000000_coach_custom_exercises.sql
git commit -m "feat(exercicios): dono e visibilidade em exercises + bucket exercise-photos"
```

---

### Task 2: Tipo `Exercise` + validação de URL do YouTube

**Files:**
- Modify: `src/types/database.ts:129-138`
- Create: `src/lib/youtubeUrl.ts`
- Test: `src/lib/youtubeUrl.test.ts`

**Interfaces:**
- Consumes: valores de `visibility` da Task 1.
- Produces:
  - `type ExerciseVisibility = 'exclusivo' | 'publico'`
  - `Exercise` com `owner_id: string | null` e `visibility: ExerciseVisibility`
  - `normalizeYouTubeUrl(raw: string): string | null` — devolve a URL canônica `https://www.youtube.com/watch?v=<id>` ou `null` se inválida.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/youtubeUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeYouTubeUrl } from './youtubeUrl';

describe('normalizeYouTubeUrl', () => {
  it('normaliza watch?v=', () => {
    expect(normalizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('normaliza youtu.be encurtado', () => {
    expect(normalizeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('normaliza shorts', () => {
    expect(normalizeYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('descarta parâmetros extras (t, list, si)', () => {
    expect(
      normalizeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?si=abc&t=42'),
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('aceita sem protocolo', () => {
    expect(normalizeYouTubeUrl('youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('ignora espaços em volta', () => {
    expect(normalizeYouTubeUrl('  https://youtu.be/dQw4w9WgXcQ  ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('devolve null para string vazia', () => {
    expect(normalizeYouTubeUrl('')).toBeNull();
    expect(normalizeYouTubeUrl('   ')).toBeNull();
  });

  it('devolve null para host que não é YouTube', () => {
    expect(normalizeYouTubeUrl('https://vimeo.com/12345678')).toBeNull();
  });

  it('devolve null para URL do YouTube sem id de vídeo', () => {
    expect(normalizeYouTubeUrl('https://www.youtube.com/results?search_query=supino')).toBeNull();
  });

  it('devolve null para id de tamanho errado', () => {
    expect(normalizeYouTubeUrl('https://youtu.be/abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/youtubeUrl.test.ts`
Expected: FAIL — `Failed to resolve import "./youtubeUrl"`.

- [ ] **Step 3: Implementar**

Criar `src/lib/youtubeUrl.ts`:

```ts
/**
 * Valida e normaliza uma URL de vídeo do YouTube para a forma canônica
 * `https://www.youtube.com/watch?v=<id>`.
 *
 * Sem import de react-native de propósito: `src/lib/youtube.ts` usa
 * Alert/Linking e não roda no vitest. Esta parte é pura pra ter teste.
 *
 * Devolve null quando não é uma URL de vídeo do YouTube reconhecível —
 * o caller trata como erro de campo.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

export function normalizeYouTubeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Aceita colar sem protocolo ("youtube.com/watch?v=...").
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const id =
    host === 'youtu.be'
      ? url.pathname.slice(1)
      : url.pathname === '/watch'
        ? (url.searchParams.get('v') ?? '')
        : url.pathname.startsWith('/shorts/')
          ? url.pathname.slice('/shorts/'.length)
          : url.pathname.startsWith('/embed/')
            ? url.pathname.slice('/embed/'.length)
            : '';

  // Remove eventual segmento extra depois do id (ex: /shorts/<id>/algo).
  const cleanId = id.split('/')[0] ?? '';
  if (!VIDEO_ID.test(cleanId)) return null;

  return `https://www.youtube.com/watch?v=${cleanId}`;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/youtubeUrl.test.ts`
Expected: PASS — 10 testes.

- [ ] **Step 5: Estender o tipo `Exercise`**

Em `src/types/database.ts`, substituir o bloco `export type Exercise = { ... }` (linhas 129-138) por:

```ts
export type ExerciseVisibility = 'exclusivo' | 'publico';

export type Exercise = {
  id: string;
  group_id: string;
  name: string;
  equipment: string | null;
  is_compound: boolean | null;
  image_urls: string[] | null;
  video_url: string | null;
  modality: Modality;
  /** Professor que criou. Null = catálogo seed original. */
  owner_id: string | null;
  visibility: ExerciseVisibility;
};
```

- [ ] **Step 6: Typecheck e suite completa**

Run: `npm run typecheck && npm test`
Expected: typecheck sem erro; 12 arquivos de teste + o novo = 13, todos passando.

- [ ] **Step 7: Commit**

```bash
git add src/types/database.ts src/lib/youtubeUrl.ts src/lib/youtubeUrl.test.ts
git commit -m "feat(exercicios): tipo Exercise com dono/visibilidade e validação de URL do YouTube"
```

---

### Task 3: Montagem do payload (puro, testável)

**Files:**
- Create: `src/lib/exercisePayload.ts`
- Test: `src/lib/exercisePayload.test.ts`

**Interfaces:**
- Consumes: `ExerciseVisibility`, `Modality`, `Exercise` (Task 2).
- Produces:
  - `normalizeExerciseName(name: string): string` — chave de comparação para dedup (lowercase, sem acento, espaços colapsados).
  - `findDuplicateExercise(name: string, groupId: string, catalog: Exercise[]): Exercise | null`
  - `type ExerciseFormValues = { name: string; groupId: string; modality: Modality; equipment: string; visibility: ExerciseVisibility; videoUrl: string }`
  - `type ExerciseValidationError = { field: 'name' | 'groupId' | 'videoUrl'; message: string }`
  - `validateExerciseForm(values: ExerciseFormValues): ExerciseValidationError[]`
  - `buildExerciseRow(args: { values: ExerciseFormValues; ownerId: string; imageUrls: string[] }): ExerciseRowInsert`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/exercisePayload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  normalizeExerciseName,
  findDuplicateExercise,
  validateExerciseForm,
  buildExerciseRow,
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
    expect(findDuplicateExercise('SUPINO RÉTO', 'group-peito', catalog)?.id).toBe('a');
  });

  it('não acusa duplicata em grupo diferente', () => {
    expect(findDuplicateExercise('Supino reto', 'group-costas', catalog)).toBeNull();
  });

  it('devolve null quando não existe', () => {
    expect(findDuplicateExercise('Supino Ravi', 'group-peito', catalog)).toBeNull();
  });
});

describe('validateExerciseForm', () => {
  it('aceita form mínimo válido', () => {
    expect(validateExerciseForm(base)).toEqual([]);
  });

  it('exige nome', () => {
    const errs = validateExerciseForm({ ...base, name: '   ' });
    expect(errs).toEqual([{ field: 'name', message: 'Dá um nome pro exercício.' }]);
  });

  it('exige nome com pelo menos 3 caracteres', () => {
    expect(validateExerciseForm({ ...base, name: 'ab' })[0].field).toBe('name');
  });

  it('exige grupo muscular', () => {
    const errs = validateExerciseForm({ ...base, groupId: '' });
    expect(errs).toEqual([
      { field: 'groupId', message: 'Escolhe o grupo muscular.' },
    ]);
  });

  it('rejeita URL de vídeo inválida', () => {
    const errs = validateExerciseForm({ ...base, videoUrl: 'https://vimeo.com/1' });
    expect(errs).toEqual([
      { field: 'videoUrl', message: 'Link do YouTube inválido.' },
    ]);
  });

  it('aceita URL de vídeo vazia (campo opcional)', () => {
    expect(validateExerciseForm({ ...base, videoUrl: '  ' })).toEqual([]);
  });

  it('acumula mais de um erro', () => {
    const errs = validateExerciseForm({ ...base, name: '', groupId: '' });
    expect(errs.map((e) => e.field)).toEqual(['name', 'groupId']);
  });
});

describe('buildExerciseRow', () => {
  it('monta a linha com dono, visibilidade e imagens', () => {
    const row = buildExerciseRow({
      values: base,
      ownerId: 'coach-1',
      imageUrls: ['https://cdn/0.jpg', 'https://cdn/1.jpg'],
    });
    expect(row).toEqual({
      group_id: 'group-peito',
      name: 'Supino Ravi',
      equipment: 'Barra',
      modality: 'musculacao',
      owner_id: 'coach-1',
      visibility: 'exclusivo',
      video_url: null,
      image_urls: ['https://cdn/0.jpg', 'https://cdn/1.jpg'],
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
    const row = buildExerciseRow({ values: base, ownerId: 'coach-1', imageUrls: [] });
    expect(row.image_urls).toBeNull();
  });

  it('normaliza a URL do vídeo', () => {
    const row = buildExerciseRow({
      values: { ...base, videoUrl: 'youtu.be/dQw4w9WgXcQ' },
      ownerId: 'coach-1',
      imageUrls: [],
    });
    expect(row.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/exercisePayload.test.ts`
Expected: FAIL — `Failed to resolve import "./exercisePayload"`.

- [ ] **Step 3: Implementar**

Criar `src/lib/exercisePayload.ts`:

```ts
import { normalizeYouTubeUrl } from './youtubeUrl';
import type { Exercise, ExerciseVisibility, Modality } from '@/types/database';

export type ExerciseFormValues = {
  name: string;
  groupId: string;
  modality: Modality;
  equipment: string;
  visibility: ExerciseVisibility;
  videoUrl: string;
};

export type ExerciseValidationError = {
  field: 'name' | 'groupId' | 'videoUrl';
  message: string;
};

export type ExerciseRowInsert = {
  group_id: string;
  name: string;
  equipment: string | null;
  modality: Modality;
  owner_id: string;
  visibility: ExerciseVisibility;
  video_url: string | null;
  image_urls: string[] | null;
};

/**
 * Chave de comparação de nome pro dedup: sem caixa, sem acento e com
 * espaços colapsados. "Rosca  Dirêta" e "rosca direta" batem.
 */
export function normalizeExerciseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Procura exercício de mesmo nome no mesmo grupo dentro do catálogo visível. */
export function findDuplicateExercise(
  name: string,
  groupId: string,
  catalog: Exercise[],
): Exercise | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  return (
    catalog.find(
      (e) => e.group_id === groupId && normalizeExerciseName(e.name) === key,
    ) ?? null
  );
}

export function validateExerciseForm(
  values: ExerciseFormValues,
): ExerciseValidationError[] {
  const errors: ExerciseValidationError[] = [];

  const name = values.name.trim();
  if (!name) {
    errors.push({ field: 'name', message: 'Dá um nome pro exercício.' });
  } else if (name.length < 3) {
    errors.push({
      field: 'name',
      message: 'O nome precisa de pelo menos 3 caracteres.',
    });
  }

  if (!values.groupId) {
    errors.push({ field: 'groupId', message: 'Escolhe o grupo muscular.' });
  }

  const video = values.videoUrl.trim();
  if (video && !normalizeYouTubeUrl(video)) {
    errors.push({ field: 'videoUrl', message: 'Link do YouTube inválido.' });
  }

  return errors;
}

export function buildExerciseRow(args: {
  values: ExerciseFormValues;
  ownerId: string;
  imageUrls: string[];
}): ExerciseRowInsert {
  const { values, ownerId, imageUrls } = args;
  const equipment = values.equipment.trim();
  const video = values.videoUrl.trim();

  return {
    group_id: values.groupId,
    name: values.name.trim(),
    equipment: equipment || null,
    modality: values.modality,
    owner_id: ownerId,
    visibility: values.visibility,
    video_url: video ? normalizeYouTubeUrl(video) : null,
    image_urls: imageUrls.length > 0 ? imageUrls : null,
  };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/exercisePayload.test.ts`
Expected: PASS — 15 testes.

- [ ] **Step 5: Suite completa**

Run: `npm test`
Expected: 14 arquivos, todos passando.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exercisePayload.ts src/lib/exercisePayload.test.ts
git commit -m "feat(exercicios): validação e montagem do payload de exercício"
```

---

### Task 4: Serviço — upload das imagens e save/delete

**Files:**
- Modify: `src/services/exercises.ts`

**Interfaces:**
- Consumes: `buildExerciseRow`, `ExerciseFormValues` (Task 3); bucket `exercise-photos` (Task 1).
- Produces:
  - `saveExercise(args: { values: ExerciseFormValues; imageUris: string[]; exerciseId?: string }): Promise<Exercise>`
  - `deleteExercise(exercise: Exercise): Promise<void>`

`imageUris` aceita mistura de URI local (`file://`) e URL pública já salva — as que já são `http(s)` são preservadas sem re-upload (caso de edição).

- [ ] **Step 1: Implementar o serviço**

Adicionar ao final de `src/services/exercises.ts` (e completar os imports do topo):

```ts
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { readFileAsArrayBuffer } from '@/lib/uploadFile';
import { buildExerciseRow, type ExerciseFormValues } from '@/lib/exercisePayload';

const EXERCISE_BUCKET = 'exercise-photos';
const EXERCISE_IMAGE_WIDTH = 720; // demonstração de movimento — maior que avatar (512)
export const MAX_EXERCISE_IMAGES = 2;

/**
 * Sobe as imagens locais e devolve as URLs públicas, na ordem recebida.
 * URIs que já são http(s) passam direto (edição sem trocar a foto).
 *
 * Path: `<coach_id>/<timestamp>-<n>.jpg` — timestamp em vez de UUID
 * porque não há lib de uuid no projeto e expo-crypto exigiria build.
 * Mesmo padrão de src/services/avatar.ts.
 */
async function uploadExerciseImages(
  ownerId: string,
  imageUris: string[],
): Promise<string[]> {
  const stamp = Date.now();
  const out: string[] = [];

  for (const [index, uri] of imageUris.slice(0, MAX_EXERCISE_IMAGES).entries()) {
    if (/^https?:\/\//i.test(uri)) {
      out.push(uri);
      continue;
    }

    const resized = await manipulateAsync(
      uri,
      [{ resize: { width: EXERCISE_IMAGE_WIDTH } }],
      { compress: 0.85, format: SaveFormat.JPEG },
    );
    const buffer = await readFileAsArrayBuffer(resized.uri);
    const path = `${ownerId}/${stamp}-${index}.jpg`;

    const { error } = await supabase.storage
      .from(EXERCISE_BUCKET)
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from(EXERCISE_BUCKET).getPublicUrl(path);
    out.push(data.publicUrl);
  }

  return out;
}

/** Extrai o path dentro do bucket a partir da URL pública. */
function bucketPathFromPublicUrl(url: string): string | null {
  const marker = `/${EXERCISE_BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : url.slice(at + marker.length);
}

/** Best-effort: remove do Storage as imagens que saíram do exercício. */
async function removeExerciseImages(urls: string[]): Promise<void> {
  const paths = urls
    .map(bucketPathFromPublicUrl)
    .filter((p): p is string => !!p);
  if (paths.length === 0) return;
  await supabase.storage.from(EXERCISE_BUCKET).remove(paths);
}

/**
 * Cria ou atualiza um exercício do professor.
 *
 * Ordem deliberada: imagens PRIMEIRO, depois uma única escrita já com
 * image_urls preenchido. Assim nunca existe exercício salvo sem as fotos
 * que o professor anexou. Se a escrita falhar, sobram arquivos órfãos no
 * bucket — limpeza best-effort, igual ao cleanupOldAvatars.
 */
export async function saveExercise(args: {
  values: ExerciseFormValues;
  imageUris: string[];
  exerciseId?: string;
}): Promise<Exercise> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sessão expirada.');

  const imageUrls = await uploadExerciseImages(user.id, args.imageUris);
  const row = buildExerciseRow({
    values: args.values,
    ownerId: user.id,
    imageUrls,
  });

  const query = args.exerciseId
    ? supabase
        .from('exercises')
        .update(row)
        .eq('id', args.exerciseId)
        .select('*')
        .single()
    : supabase.from('exercises').insert(row).select('*').single();

  const { data, error } = await query;

  if (error) {
    // Não deixa lixo no bucket quando a escrita falhou.
    void removeExerciseImages(
      imageUrls.filter((u) => !args.imageUris.includes(u)),
    );
    if (error.code === '23505') {
      throw new Error('Já existe um exercício com esse nome nesse grupo.');
    }
    throw error;
  }

  return data as Exercise;
}

/**
 * Remove um exercício do professor. Seguro por design: exercise_id em
 * workout_routine_exercises, workout_template_exercises e workout_logs é
 * `on delete set null`, e exercise_name é snapshot not null — a rotina do
 * aluno continua com nome, séries e cargas, perdendo só imagens/vídeo.
 */
export async function deleteExercise(exercise: Exercise): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .delete()
    .eq('id', exercise.id);
  if (error) throw error;

  void removeExerciseImages(exercise.image_urls ?? []);
}
```

- [ ] **Step 2: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro. Se o lint reclamar de import não usado em `exercises.ts`, remover o que sobrou.

- [ ] **Step 3: Suite completa**

Run: `npm test`
Expected: 14 arquivos, todos passando (nenhum teste novo — o serviço toca RN/Supabase e é validado no UAT da Task 10).

- [ ] **Step 4: Commit**

```bash
git add src/services/exercises.ts
git commit -m "feat(exercicios): serviço de save/delete de exercício com upload de imagens"
```

---

### Task 5: Hooks — mutations e gate de permissão

**Files:**
- Modify: `src/hooks/useExercises.ts`

**Interfaces:**
- Consumes: `saveExercise`, `deleteExercise` (Task 4).
- Produces:
  - `useSaveExercise()` — mutation com `mutateAsync({ values, imageUris, exerciseId? })`
  - `useDeleteExercise()` — mutation com `mutateAsync(exercise)`
  - `useCanCreateExercise(): boolean`

- [ ] **Step 1: Implementar os hooks**

Adicionar ao final de `src/hooks/useExercises.ts` (e completar imports do topo):

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteExercise, saveExercise } from '@/services/exercises';
import { useProfile } from './useProfile';
import { useEntitlement } from './useEntitlement';
import type { Exercise } from '@/types/database';

/**
 * Invalida as DUAS keys de catálogo. A allExercises() é fácil de esquecer
 * e tem staleTime de 60min (useExerciseImagesMap) — sem ela o exercício
 * aparece no picker mas fica sem imagem por até uma hora.
 */
function useInvalidateExerciseCatalog() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['exercises-by-group'] }),
      qc.invalidateQueries({ queryKey: queryKeys.allExercises() }),
    ]);
  };
}

export function useSaveExercise() {
  const invalidate = useInvalidateExerciseCatalog();
  return useMutation({
    mutationFn: saveExercise,
    onSuccess: invalidate,
  });
}

export function useDeleteExercise() {
  const invalidate = useInvalidateExerciseCatalog();
  return useMutation({
    mutationFn: (exercise: Exercise) => deleteExercise(exercise),
    onSuccess: invalidate,
  });
}

/**
 * Gate do cadastro de exercício: professor com tier premium.
 *
 * Não é só cobrança — é correção. O RoutineEditor é compartilhado por 6
 * telas, incluindo app/rotina/nova.tsx (usuário montando a própria
 * rotina); sem este gate o botão apareceria pra aluno e avulso.
 *
 * Fecha por padrão: enquanto profile/entitlement não resolveram, retorna
 * false (o inverso do gating proativo do useAiCoachLocked, porque aqui um
 * falso-positivo criaria escrita indevida no catálogo global).
 */
export function useCanCreateExercise(): boolean {
  const { data: profile } = useProfile();
  const { data: entitlement } = useEntitlement();
  if (!profile || !entitlement) return false;
  return profile.role === 'professor' && entitlement.tier === 'premium';
}
```

> Nota sobre a invalidação por prefixo: `exercises-by-group` é invalidada por prefixo (sem `groupId`/`modality`) de propósito — um exercício novo pode mudar a lista de mais de uma combinação grupo × modalidade quando a modalidade é `generico`, que aparece junto de todas as outras (ver `listExercisesByGroup` em `src/services/exercises.ts:22`).

- [ ] **Step 2: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 3: Suite completa**

Run: `npm test`
Expected: 14 arquivos, todos passando.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useExercises.ts
git commit -m "feat(exercicios): hooks de save/delete e gate de professor premium"
```

---

### Task 6: Extrair `ExercisePickerModal` (refactor puro)

**Files:**
- Create: `src/components/routine/ExercisePickerModal.tsx`
- Modify: `src/components/routine/RoutineEditor.tsx` (remove linhas 586-754, adiciona import)

**Interfaces:**
- Consumes: nada novo.
- Produces: `export default function ExercisePickerModal(props: { visible: boolean; onClose: () => void; modality: Modality; preferredGroupId: string | null; addedExerciseIds: Set<string>; onSelect: (ex: Exercise) => void })` — **mesma assinatura de hoje**, para o call site em `RoutineEditor.tsx:337-344` não mudar.

**Esta task não muda comportamento nenhum.** É só mover código, para que a Task 8 não empurre `RoutineEditor.tsx` (755 linhas) para além de 1000.

- [ ] **Step 1: Criar o arquivo novo com o componente movido**

Mover o bloco `function ExercisePickerModal({...}) { ... }` de `src/components/routine/RoutineEditor.tsx` (linhas 586-754) para `src/components/routine/ExercisePickerModal.tsx`, trocando `function` por `export default function` e levando os imports que ele usa:

```ts
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { Search, X, CheckCircle2, PlusCircle } from 'lucide-react-native';
import { useExerciseGroups, useExercisesByGroup } from '@/hooks/useExercises';
import { Card, Input } from '@/components/ui';
import { colors } from '@/lib/theme';
import { MODALITY_LABELS, type Exercise, type Modality } from '@/types/database';
```

- [ ] **Step 2: Remover do `RoutineEditor.tsx` e importar**

- Apagar o bloco movido (linhas 586-754).
- Adicionar `import ExercisePickerModal from './ExercisePickerModal';` junto dos imports irmãos (perto da linha 40, onde já entram `ExerciseImagesModal` e `PreviewEyeButton`).
- Remover dos imports do `RoutineEditor.tsx` os símbolos que só o picker usava. Conferir um a um antes de apagar — `Search`, `CheckCircle2`, `PlusCircle` e `useExercisesByGroup` são os candidatos; `Modal`, `Platform`, `ScrollView`, `Card`, `Input`, `X` e `useExerciseGroups` provavelmente continuam em uso pelo resto do arquivo.

- [ ] **Step 3: Verificar que nada quebrou**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck limpo (é aqui que import não usado ou símbolo faltando aparece), lint limpo, 14 arquivos de teste passando.

- [ ] **Step 4: Confirmar que o diff é só movimentação**

Run: `git diff --stat`
Expected: `RoutineEditor.tsx` perde ~170 linhas, `ExercisePickerModal.tsx` ganha ~185. Nenhuma mudança de lógica. Se o diff mostra alteração de comportamento, desfazer e mover de novo.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/ExercisePickerModal.tsx src/components/routine/RoutineEditor.tsx
git commit -m "refactor(exercicios): extrai ExercisePickerModal do RoutineEditor"
```

---

### Task 7: `ExerciseFormModal` — o form de cadastro/edição

**Files:**
- Create: `src/components/routine/ExerciseFormModal.tsx`

**Interfaces:**
- Consumes: `useExerciseGroups`, `useSaveExercise`, `useDeleteExercise` (Task 5); `validateExerciseForm`, `findDuplicateExercise`, `ExerciseFormValues` (Task 3); `MAX_EXERCISE_IMAGES` (Task 4).
- Produces:

```ts
export default function ExerciseFormModal(props: {
  visible: boolean;
  onClose: () => void;
  /** Presente = modo edição. Ausente = cadastro novo. */
  exercise?: Exercise | null;
  /** Pré-preenchidos pelo contexto do picker. */
  initialGroupId: string | null;
  initialModality: Modality;
  /** Catálogo visível do grupo atual, pra checagem de duplicata. */
  catalog: Exercise[];
  /** Chamado após salvar — o picker usa pra auto-selecionar. */
  onSaved: (exercise: Exercise) => void;
  /** Chamado após excluir. */
  onDeleted: () => void;
}): JSX.Element
```

- [ ] **Step 1: Implementar o componente**

Criar `src/components/routine/ExerciseFormModal.tsx`. Requisitos concretos:

- **Modal** com `animationType="slide"`, `transparent={false}`, header com botão X à esquerda e título `Novo exercício` (ou `Editar exercício` no modo edição) — espelhar o header do `ExercisePickerModal` (mesmo `paddingTop: Platform.OS === 'ios' ? 50 : 16`, mesmas classes).
- **Estado do form** inicializado de `props.exercise` quando presente, senão dos `initial*`. Reinicializar no `useEffect` a cada abertura (`visible`), igual o picker faz nas linhas 608-613.
- **Campos**, na ordem:
  1. `Input` `label="Título"` com `error` do `validateExerciseForm`.
  2. Grupo muscular: chips `Pressable` iguais aos do picker (linhas 658-678), alimentados por `useExerciseGroups()`.
  3. Tipo: chips de `MODALITIES` com `MODALITY_LABELS` (**é a `modality`**, não o equipamento).
  4. `Input` `label="Equipamento"` `hint="Opcional"`.
  5. Bloco de visibilidade: `Text` com a copy exata `Exclusivo: só você e seus alunos veem. Público: entra no catálogo do app.` e dois `Pressable` em formato radio (`Exclusivo` / `Público`), default `exclusivo`.
  6. Imagens: até `MAX_EXERCISE_IMAGES` tiles. Reaproveitar o padrão de `src/components/coach/PosturePhotoSection.tsx:40-100` — pedir permissão, `launchCameraAsync`/`launchImageLibraryAsync` com `quality: 0.8, exif: false, allowsEditing: false`, guardar a URI local no estado (o resize acontece no serviço). Cada tile tem X para remover.
  7. `Input` `label="Vídeo do YouTube"` `hint="Opcional"` `autoCapitalize="none"` com `error`.
- **Salvar** (`Button` `label="Salvar exercício"` com `loading`):
  1. `validateExerciseForm(values)` → se houver erros, exibir por campo e parar.
  2. No modo cadastro, `findDuplicateExercise(name, groupId, catalog)`; se achar, abrir `ConfirmModal` com título `Já existe "<nome>"` e ações: `Usar o existente` (chama `onSaved(duplicata)` e fecha) e `Cadastrar mesmo assim` (segue). Cancelar por último, conforme a convenção do `ConfirmModal`.
  3. `saveM.mutateAsync({ values, imageUris, exerciseId: props.exercise?.id })`.
  4. Sucesso → `onSaved(exercicio)` e fechar.
  5. Erro → `Alert.alert('Não consegui salvar', err.message)` e **manter o form preenchido** (não fechar, não limpar).
- **Excluir** (só no modo edição): botão `variant="danger"` que abre `ConfirmModal` com título `Excluir "<nome>"?` e mensagem `A rotina dos alunos continua com o nome, séries e cargas — só as imagens e o vídeo somem do preview.` Ao confirmar, `deleteM.mutateAsync(props.exercise)` → `onDeleted()` → fechar.
- **Copy sempre em PT-BR com acentuação.**

- [ ] **Step 2: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erro.

- [ ] **Step 3: Suite completa**

Run: `npm test`
Expected: 14 arquivos, todos passando. (A lógica testável deste form já está coberta na Task 3; o componente é validado no UAT da Task 10.)

- [ ] **Step 4: Commit**

```bash
git add src/components/routine/ExerciseFormModal.tsx
git commit -m "feat(exercicios): modal de cadastro e edição de exercício"
```

---

### Task 8: Integrar o form no picker

**Files:**
- Modify: `src/components/routine/ExercisePickerModal.tsx`

**Interfaces:**
- Consumes: `ExerciseFormModal` (Task 7), `useCanCreateExercise` (Task 5).
- Produces: nenhuma interface nova — a assinatura pública do picker continua a mesma.

- [ ] **Step 1: Adicionar o gate e o estado do form**

No topo do componente:

```ts
import { useAuth } from '@/hooks/useAuth';
import { useCanCreateExercise } from '@/hooks/useExercises';
import ExerciseFormModal from './ExerciseFormModal';

// dentro do componente:
const canCreate = useCanCreateExercise();
const { user } = useAuth();
const [formOpen, setFormOpen] = useState(false);
const [editing, setEditing] = useState<Exercise | null>(null);
```

`useAuth()` (`src/hooks/useAuth.ts:49`) devolve `{ session, user, isAuthenticated, isBootstrapping, ... }` — o `user.id` é o que compara com `ex.owner_id` para decidir badge e lápis.

- [ ] **Step 2: Botão `+ novo exercício`**

Renderizar **somente se `canCreate && groupId`**, em dois pontos:

1. Dentro do bloco de lista vazia (hoje linhas 705-710) — logo abaixo do texto "Nenhum exercício de … nesse grupo", que é o momento em que a falta é sentida.
2. No fim da lista de exercícios, depois do `filtered.map(...)`.

```tsx
{canCreate && groupId && (
  <Pressable
    onPress={() => {
      setEditing(null);
      setFormOpen(true);
    }}
    className="active:opacity-70"
  >
    <Card padding="md">
      <View className="flex-row items-center justify-center gap-2">
        <Plus size={18} color={colors.accent} />
        <Text className="text-accent text-sm font-semibold">
          Novo exercício
        </Text>
      </View>
    </Card>
  </Pressable>
)}
```

Adicionar `Plus` ao import de `lucide-react-native`.

- [ ] **Step 3: Badge "meu" + lápis nos exercícios do professor**

No `filtered.map(...)`, dentro do `Card` de cada exercício, quando `ex.owner_id === user?.id`: um `Text` com `meu` (mesmo estilo do `equipment`, cor `text-accent`) e um `Pressable` com ícone `Pencil` que faz `setEditing(ex); setFormOpen(true);`. O `Pressable` do lápis precisa parar a propagação para não selecionar o exercício ao tocar em editar — envolver o ícone num `Pressable` próprio com `hitSlop={12}` e `onPress` próprio já basta, porque o `Pressable` externo não recebe o toque quando o filho o consome.

- [ ] **Step 4: Montar o `ExerciseFormModal`**

Antes do fechamento do `</Modal>` do picker:

```tsx
<ExerciseFormModal
  visible={formOpen}
  onClose={() => setFormOpen(false)}
  exercise={editing}
  initialGroupId={groupId}
  initialModality={modality}
  catalog={exercisesQ.data ?? []}
  onSaved={(ex) => {
    setFormOpen(false);
    if (!editing) onSelect(ex);
  }}
  onDeleted={() => setFormOpen(false)}
/>
```

`onSaved` só chama `onSelect` no modo cadastro — em edição o exercício provavelmente já está na rotina, e re-selecionar duplicaria a linha.

- [ ] **Step 5: Typecheck, lint e suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo limpo, 14 arquivos de teste passando.

- [ ] **Step 6: Commit**

```bash
git add src/components/routine/ExercisePickerModal.tsx
git commit -m "feat(exercicios): botão de novo exercício e edição no picker"
```

---

### Task 9: Edge functions — filtro de visibilidade nas leituras

**Files:**
- Modify: `supabase/functions/coach-import-workout-ai/index.ts:217-219`
- Modify: `supabase/functions/_shared/plan-generator.ts:277-280`
- Modify: `supabase/functions/_shared/fallbackPlan.ts:92-95`
- Modify: `supabase/functions/coach-save-imported-workout/index.ts:155-163`

**Interfaces:**
- Consumes: colunas `owner_id` / `visibility` (Task 1).
- Produces: nada consumido por outras tasks.

**Por que é obrigatório:** service role **ignora RLS**. Sem filtro explícito, a policy da Task 1 não protege nada aqui, e a IA de um professor passaria a recomendar exercício exclusivo de outro.

- [ ] **Step 1: `coach-import-workout-ai`**

Trocar a leitura do catálogo (linha 217-219) por:

```ts
// Carrega exercícios pra matching (id, name, group_id, modality).
// Filtro explícito: service role ignora RLS, então a policy de
// visibilidade não vale aqui. Sem isso, o exercício exclusivo de um
// professor entraria no prompt de outro.
const { data: catalog } = await supabaseService
  .from('exercises')
  .select('id, name, group_id, modality, equipment')
  .or(`visibility.eq.publico,owner_id.eq.${caller.id}`);
```

- [ ] **Step 2: `_shared/plan-generator.ts`**

O dono relevante aqui é o **professor do aluno**, não o caller. Antes da leitura do catálogo, resolver o coach do usuário do plano e aplicar o filtro:

```ts
// O aluno vê o catálogo público + os exercícios exclusivos do professor
// dele. Service role ignora RLS, então o filtro é explícito.
const { data: ownerProfile } = await supabase
  .from('profiles')
  .select('coach_id')
  .eq('id', userId)
  .maybeSingle();
const coachId = ownerProfile?.coach_id ?? null;

const visibilityFilter = coachId
  ? `visibility.eq.publico,owner_id.eq.${coachId}`
  : 'visibility.eq.publico';

const { data: exercises, error: exErr } = await supabase
  .from('exercises')
  .select('id, group_id, name, equipment, is_compound, modality')
  .in('modality', modalities)
  .or(visibilityFilter);
if (exErr) throw exErr;
```

Conferir o nome real da variável que carrega o id do usuário do plano nessa função antes de escrever `userId` — usar o identificador que já existe no escopo.

- [ ] **Step 3: `_shared/fallbackPlan.ts`**

A busca é por nomes fixos do seed; restringir ao catálogo original pra não casar com homônimo criado por professor:

```ts
const { data } = await supabase
  .from('exercises')
  .select('id, name, equipment')
  .in('name', wanted.map((w) => w.name))
  .is('owner_id', null); // só o catálogo seed — evita homônimo de professor
```

- [ ] **Step 4: `coach-save-imported-workout`**

No insert de exercício novo (linha 155-163), passar dono e visibilidade:

```ts
const insertRes = await supabaseService
  .from('exercises')
  .insert({
    group_id: groupId,
    name: ref.name.trim(),
    equipment: ref.equipment ?? null,
    modality: ref.modality,
    // Quem importou um PDF de treino não pediu pra publicar no app
    // inteiro — nasce exclusivo do professor.
    owner_id: caller.id,
    visibility: 'exclusivo',
  })
  .select('id')
  .maybeSingle();
```

E o fallback de conflito logo abaixo (linhas 169-176) precisa procurar **no escopo do professor**, senão um nome que colide com o seed devolve o exercício errado:

```ts
const existing = await supabaseService
  .from('exercises')
  .select('id')
  .eq('group_id', groupId)
  .eq('name', ref.name.trim())
  .or(`visibility.eq.publico,owner_id.eq.${caller.id}`)
  .limit(1)
  .maybeSingle();
```

- [ ] **Step 5: Deploy e verificação**

Run: `npm run fn:deploy`
Expected: todas as functions sobem sem erro.

**As 5 que importam:** `coach-import-workout-ai` e `coach-save-imported-workout` (leitura/escrita direta) + `coach-generate-plan`, `coach-save-student-plan` e `onboarding-plan` (as três bundlam `_shared/plan-generator.ts` e `_shared/fallbackPlan.ts`; o Deno inlina o shared no deploy, então uma function sem redeploy continua rodando a versão antiga e **segue vazando exercício exclusivo**). O `npm run fn:deploy` sobe todas, o que cobre as 5.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/coach-import-workout-ai/index.ts \
        supabase/functions/_shared/plan-generator.ts \
        supabase/functions/_shared/fallbackPlan.ts \
        supabase/functions/coach-save-imported-workout/index.ts
git commit -m "fix(exercicios): filtra visibilidade nas leituras com service role"
```

---

### Task 10: UAT no preview e entrega

**Files:** nenhum (validação).

**Interfaces:** consome tudo.

- [ ] **Step 1: `/simplify` sobre o diff acumulado**

Rodar `/simplify` **antes** da suite final — ele refatora o diff, e qualquer regressão que ele introduza só é pega se os testes rodarem depois.

- [ ] **Step 2: Suite completa depois do `/simplify`**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo limpo. Se o `/simplify` mexeu em algo, é aqui que aparece.

- [ ] **Step 3: Publicar o OTA**

Run: `npm run update:preview -- "cadastro de exercício pelo professor"`
Expected: update publicado na branch `preview`.

- [ ] **Step 4: Roteiro de UAT no app**

Marcar cada caso:

- [ ] **Professor premium:** abre rotina de aluno → picker → escolhe grupo → busca nome inexistente → vê `+ Novo exercício`.
- [ ] Cadastra com título, equipamento, **2 imagens** e link do YouTube, marcando **Exclusivo** → salva → o exercício **entra automaticamente** na rotina.
- [ ] As imagens aparecem **na hora** no preview (olho) — é a verificação da invalidação da `allExercises()`; se sumirem por uma hora, a invalidação da Task 5 está errada.
- [ ] Cadastra outro marcando **Público**.
- [ ] Reabre o picker → os dois exercícios têm badge `meu` e lápis → editar troca o nome e salva.
- [ ] Excluir um deles pelo modo edição → confirma → sai da lista.
- [ ] Tenta cadastrar nome que já existe no grupo → aparece o `ConfirmModal` de duplicata → `Usar o existente` seleciona o do catálogo.
- [ ] Link do YouTube inválido (ex: `https://vimeo.com/1`) → erro no campo, não salva.
- [ ] **Professor pro (não premium):** o botão `+ Novo exercício` **não aparece**.
- [ ] **Aluno do professor:** vê o exercício **Exclusivo** na busca; **não** vê badge nem lápis.
- [ ] **Aluno de outro professor (ou avulso):** **não** vê o Exclusivo; **vê** o Público.
- [ ] **Usuário avulso premium:** abre `app/rotina/nova.tsx` → o botão `+` **não aparece** (é `role = 'comum'`).
- [ ] **IA:** professor gera plano por IA → o plano não traz exercício exclusivo de outro professor.
- [ ] **Import por IA:** importa um treino com exercício desconhecido → o exercício nasce com badge `meu` e visibilidade Exclusivo.

- [ ] **Step 5: Fechamento da branch**

Invocar `nano-commit` para o fechamento estruturado (4 opções: merge local / PR / manter / descartar). **Não** mergear automaticamente.

---

## Self-Review

**1. Spec coverage** — cada requisito da spec mapeado:

| Requisito da spec | Task |
|---|---|
| Colunas `owner_id` / `visibility` + defaults | 1 |
| Índices parciais substituindo `unique (group_id, name)` | 1 |
| Policy de leitura por visibilidade | 1 |
| Policies de escrita (insert premium / update / delete do dono) | 1 |
| Bucket `exercise-photos` + policies | 1 |
| Tipo `Exercise` estendido | 2 |
| Validação da URL do YouTube | 2 |
| Dedup por nome normalizado | 3 |
| Payload do insert | 3 |
| Upload das imagens antes da escrita única | 4 |
| Limpeza best-effort de órfãos | 4 |
| Erro `23505` com mensagem amigável | 4 |
| Exclusão com limpeza de Storage | 4 |
| Invalidação das duas query keys | 5 |
| Gate `professor` + `premium` | 5 |
| Extração do picker | 6 |
| Form modal com todos os campos + radio | 7 |
| Copy exata do radio | 7 (Global Constraints) |
| ConfirmModal de duplicata | 7 |
| Erro mantém o form preenchido | 7 |
| Confirm de exclusão avisando o efeito | 7 |
| Botão `+` nos dois pontos do picker | 8 |
| Badge `meu` + lápis | 8 |
| Auto-seleção após cadastro | 8 |
| Filtro nas 3 leituras com service role | 9 |
| Import por IA criando `exclusivo` com dono | 9 |
| Deploy das 5 functions | 9, 10 |
| Entrega OTA (`db:push`, `fn:deploy`, `eas update`) | 1, 9, 10 |

Sem lacuna.

**2. Placeholder scan** — sem "TBD"/"TODO"/"implementar depois". Os steps de UI (Tasks 7 e 8) descrevem requisitos concretos e componentes existentes a espelhar, com código nos pontos onde a forma exata importa (botão, montagem do modal). Dois pontos pedem conferência no código em vez de assumir, de propósito: o nome real da constraint única (Task 1, Step 2) e o identificador do usuário no `plan-generator` (Task 9, Step 2).

**3. Type consistency** — verificado: `ExerciseFormValues` (Task 3) é o mesmo tipo consumido em `saveExercise` (Task 4) e no form (Task 7); `saveExercise` recebe `{ values, imageUris, exerciseId? }` nas Tasks 4, 5 e 7; `deleteExercise` recebe o `Exercise` completo (não o id) nas Tasks 4, 5 e 7, porque precisa de `image_urls` para limpar o Storage; `visibility` usa `'exclusivo' | 'publico'` em todas as tasks; `MAX_EXERCISE_IMAGES` é exportado na Task 4 e consumido na 7.

**Correção aplicada no review:** a Task 5 invalidava `queryKeys.exercisesByGroup(groupId, modality)` com argumentos que o hook de mutation não tem. Passou a invalidar por prefixo `['exercises-by-group']`, o que também cobre o caso da modalidade `generico`, que aparece em todas as outras listas.
