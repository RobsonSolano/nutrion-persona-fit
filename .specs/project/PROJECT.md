# NutriOn

App Android de **biohacking, nutrição e treino** com assistente de IA empático e área completa pra profissional acompanhar alunos.

## Visão

Um app pessoal-primeiro (Android) que entende perfil, hábitos e logs do usuário e devolve metas, treinos e feedback de IA — sem virar mais uma planilha fria. Foco em uso informativo: orientações **não substituem** profissional de saúde. Quando há vínculo com professor, ganha camada profissional (prescrição, anotações privadas, avaliações físicas, evolução).

## Goals

- **Onboarding com IA em ~60s** (perfil → metas + treinos prontos).
- **Dashboard** com ring de calorias, streak semanal e log rápido (refeição, água, treino).
- **Chat com IA** que enxerga perfil + últimos logs, sempre em PT-BR.
- **Sanity Check** de pratos via foto (IA multimodal).
- **Catálogo de ~270 exercícios** em 9 grupos musculares, 96% com imagem demo.
- **Reordenação de treinos** por drag-and-drop (visão coach).
- **Push contextual com IA** — inatividade, marcos de constância, lembretes (água/proteína/treino), aviso de quebra de sequência.
- **Área do Professor** completa: gestão de alunos, treinos com lock, templates próprios, anotações privadas, anamnese, avaliações físicas, histórico de planos.
- **Auto-exclusão de conta** (LGPD / Play Store / App Store) com auditoria sem PII.

## Stack

| Camada | Tecnologia |
|--------|------------|
| App | Expo SDK 54, React 19, RN 0.81, New Architecture |
| Navegação | Expo Router v6 (file-based, typed routes) |
| Estilo | NativeWind v4 (Tailwind em RN), dark mode nativo |
| Gestos | react-native-gesture-handler + react-native-reanimated v4 |
| Drag-and-drop | react-native-draggable-flatlist |
| Estado server | TanStack Query v5 |
| Estado local | Zustand |
| Backend | Supabase (Auth + Postgres + Storage + Edge Functions + pg_cron) |
| IA | Groq (Llama 3.3 70B texto, Llama 4 Scout 17B visão) |
| Push | Expo Push (server-to-server via Edge Functions) |
| Observabilidade | Sentry |

## Scope

**Dentro:** app pessoal Android (Play Store) e iOS (App Store, só iPhone), Supabase remoto único (sem staging), edge functions em Deno.

**Fora (por enquanto):** web, modo offline, premium/pagamento, multi-perfil.

## Convenções

- Idioma: **PT-BR** em código, docs, mensagens, commits. Acentuação obrigatória.
- Branching: gitflow clássico (`develop` ← `feature/*` / `hotfix/*`; release pra `main`).
- Commits: Conventional Commits com scope (ex: `feat(onboarding):`, `fix(chat):`).
- Banco: migrations idempotentes em `supabase/migrations/`, RLS sempre por `auth.uid() = user_id` (ou via `coach_id` no profile do aluno pra acesso do professor).
- Push: tipos críticos (`coach_plan_update`, `goal_achieved`, `student_account_deleted`, `coach_unlinked`) ignoram quiet hours 22h–7h BRT.

## Releases entregues

- **Catálogo enriquecido** — 90 → 269 exercícios, 96% com imagem (free-exercise-db CC0).
- **Área do Professor** — gestão completa, templates, anamnese, avaliações, histórico.
- **Push contextual com IA** — 13 tipos (inatividade, streak, water EOD, protein EOD, daily-workout-check, streak-warning, account-deleted, coach-unlinked, etc).
- **Drag-and-drop** de rotinas do aluno no painel do coach.
- **Avatar** pra coach (upload + exibição pro aluno via CoachCard).
- **Auto-exclusão de conta (LGPD)** — hard delete + audit log sem PII + motivo opcional.
- **Desvincular aluno** — substitui o "Excluir aluno" antigo; aluno vira comum mantendo treinos.

## Roadmap próximo (ideias)

1. **`workout_routines.day_of_week`** — permitir agendar rotinas por dia. Destrava `daily_workout_reminder` (push de manhã com nome do treino).
2. **`weekly_summary`** push (domingo à noite com balanço da semana).
3. **`coach_adherence_alert`** push (coach alertado quando aluno cai de aderência).
4. **`coach_plan_update`** push (aluno avisado quando coach publica plano novo).
5. **`goal_achieved`** push (celebração de marcos de peso/meta).
6. **Tela "ex-alunos"** pro coach (snapshot histórico de alunos desvinculados).
7. **Exportação de dados** antes da exclusão (direito LGPD complementar).
8. **Email pro coach** (push + email no aluno-saiu) — exige edge function SMTP.

## Stores e canais

- **Play Store**: distribuição principal. APK via EAS Build production.
- **Preview interno**: APK via EAS Build preview, distribuído por link interno.
- **OTA**: `eas update --branch preview|production` pra mudanças puramente JS.
