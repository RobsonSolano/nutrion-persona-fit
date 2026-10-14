# Estrutura do codebase

## Diretórios principais

```
app/                          # Rotas Expo Router (file-based)
  (auth)/                     # Grupo: login (sem header)
    login.tsx
  (tabs)/                     # Grupo: tabs principais (Home, Treino, Chat, Perfil)
    index.tsx                 # Home (dashboard)
    treino.tsx
    chat.tsx
    perfil.tsx
  onboarding/                 # Fluxo de onboarding (8 steps + loading + resultado)
    index.tsx, dados.tsx, objetivo.tsx, esporte.tsx,
    habitos.tsx, bio.tsx, loading.tsx, resultado.tsx
  rotina/                     # CRUD de rotinas (visão do dono — comum/professor)
    nova.tsx, [id].tsx
  (coach)/                    # Área do professor (role=professor)
    _layout.tsx               # Stack; as telas de detalhe empilham sobre as abas
    (painel)/                 # Abas do professor
      _layout.tsx             # Tabs: Home | Alunos | Perfil
      index.tsx               # Home (métricas, contratações, biblioteca)
      alunos.tsx              # Lista de alunos
      perfil.tsx              # Perfil + perfil público (busca) + bloqueados
    aluno-novo.tsx, import-workout.tsx
    solicitacoes.tsx          # Pedidos dos alunos JÁ vinculados (student_requests)
    contratacoes.tsx          # Fila de quem pediu pra VIRAR aluno (coach_enrollment_requests)
    bloqueados.tsx
    aluno/[id]/               # Detalhe do aluno
      index.tsx               # visão (com drag-and-drop de rotinas)
      editar.tsx, notas.tsx, anamnese.tsx, contrato.tsx
      historico.tsx, evolucao.tsx
      avaliacao/              # Avaliações físicas
      rotina/
        nova.tsx              # criar rotina manualmente pro aluno
        [routineId].tsx
    templates/                # Biblioteca de treinos do coach
      index.tsx, novo.tsx, [id].tsx
  evolucao/                   # Evolução do dono (peso, progress entries)
  solicitacoes/               # Fila aluno → professor (suporte, aluno já vinculado)
  encontrar-professor/        # Busca de professor + perfil público
    index.tsx, [id].tsx
  minhas-solicitacoes.tsx     # Solicitações de contratação do próprio usuário
  anamnese.tsx                # Anamnese do aluno (autopreenchimento)
  log.tsx                     # Log rápido (refeição/água/treino)
  treino-ativo.tsx            # Cronômetro de treino em tempo real (start/pausa/parar/salvar)
  sanity-check.tsx            # Validação de prato via foto (IA visão)
  editar-perfil.tsx           # Edição de perfil (comum/aluno) + Zona de risco
  notificacoes.tsx            # Preferências granulares de push
  trocar-senha.tsx
  exportar-dados.tsx
  index.tsx                   # Redirect inicial (SplashGate)
  _layout.tsx                 # Root layout (GestureHandlerRootView, providers, OTA)

src/
  components/                 # Componentes reutilizáveis
    ui/                       # Primitivos (Button, Input, ConfirmModal, Avatar, ...)
    onboarding/               # Steps de onboarding
    routine/                  # Editor + ExerciseReadRow (compartilhado)
    coach/                    # TemplatePicker, RoutinesReorderList, StudentAnamneseCard
    log/                      # Tabs de log rápido
    workout/                  # PendingWorkoutModal (recuperação de treino pendente)
    AddProgressEntryModal.tsx, AnamneseForm.tsx, AvatarPicker.tsx
    ChatBubble.tsx, CoachCard.tsx, DangerZone.tsx
    Disclaimer.tsx, GlobalAlertProvider.tsx, ProgressTimeline.tsx
    StudentAssessmentCard.tsx, TypingIndicator.tsx, WeekStreak.tsx
  services/                   # Camada de acesso ao Supabase (uma por entidade)
    supabase.ts               # Cliente Supabase
    auth.ts                   # Login, signup, password reset, deleteMyAccount
    profile.ts, onboarding.ts, avatar.ts
    foodLogs.ts, waterLogs.ts, workoutLogs.ts
    routines.ts               # CRUD rotinas + reorderRoutines via RPC
    exercises.ts              # listExerciseGroups, listExercisesByGroup (inclui 'generico')
    templates.ts              # CRUD biblioteca do coach + applyTemplates
    chat.ts, chatMessages.ts, sanityCheck.ts, aiUsage.ts
    coach.ts, coachNotes.ts
    students.ts               # CRUD aluno + unlinkStudent (substitui deleteStudent)
    studentTracking.ts, requests.ts
    anamnese.ts               # Anamnese do aluno
    contracts.ts              # Contratos coach-aluno
    physicalAssessments.ts    # Avaliações físicas
    progressEntries.ts        # Evolução de peso/medidas
    planHistory.ts            # Snapshot de planos gerados
    dataExport.ts             # Export de dados (CSV/JSON)
    pushNotifications.ts      # Registro de Expo Push Token + handlers
    pushPreferences.ts        # Opt-in/out granular por tipo
    workoutImport.ts          # Import por texto via IA
    activeWorkout.ts          # Persistência do treino ativo em AsyncStorage
    workoutNotifications.ts   # Notificações locais do cronômetro (ongoing + 2h)
  stores/                     # Zustand stores
    useSessionStore.ts        # Sessão Supabase
    useOnboardingStore.ts     # Estado do form de onboarding
    useOnboardingResultStore.ts
    useUiStore.ts             # Estado UI global (ex: isPromotingProfessor)
    useActiveWorkoutStore.ts  # Treino sendo cronometrado (runtime + espelho AsyncStorage)
  hooks/                      # Hooks React Query e utilitários
                              # (auth, profile, routines, students, anamnese,
                              # contracts, avatar, push prefs, OTA update, etc.)
  lib/                        # Utilitários puros (formatadores, biometrics, theme)
  types/                      # Types globais (database.ts espelha o schema)

supabase/
  migrations/                 # ~38 migrations SQL idempotentes (timestamp_nome.sql)
  functions/
    chat-ai/                  # Chat com IA + histórico
    onboarding-plan/          # Gera plano inicial via IA
    sanity-check/             # (via chat-ai) validação de prato por foto
    signup-professor/         # Promove user pra role=professor + cria coaches row
    coach-create-student/     # Cria conta + ficha do aluno (service_role)
    coach-generate-plan/      # IA gera plano para aluno (skip_routines opcional)
    coach-save-student-plan/  # Persiste metas + rotinas geradas
    coach-update-student/, coach-send-credentials/
    coach-delete-student/     # @deprecated — substituída por coach-unlink-student
    coach-unlink-student/     # Desvincula aluno (vira comum) + apaga notes + push
    coach-apply-template/     # Copia 1+ templates do coach pro aluno (atomic)
    coach-import-workout-ai/  # IA extrai rotinas de texto/foto
    coach-save-imported-workout/ # Persiste rotinas importadas
    delete-my-account/        # Auto-exclusão LGPD (hard delete + audit log)
    send-push-notification/   # Push transacional (request/response)
    send-push-ai/             # Push genérico com IA (Groq) + cooldown + opt-out
    cron-inactivity-reminders/   # Diário 12h BRT — 2+ dias sem registro
    cron-streak-celebrations/    # Diário 20h30 BRT — marcos 3/7/14/30/60/100 dias
    cron-water-reminder/         # 20h BRT — meta de água < 50%
    cron-protein-reminder/       # 21h BRT — meta de proteína < 70%
    cron-daily-workout-check/    # 20h30 BRT — dias típicos de treino sem sessão
    cron-streak-warning/         # 21h30 BRT — streak ≥2 e nada hoje
    cron-ai-quota-alert/         # De hora em hora — rate_limits Groq
    admin-list-users/         # Painel admin
    _shared/                  # plan-generator, expoPush, pushAi, pushPrompts,
                              # references, anamneseFormatter, aiCircuit, fallbackPlan
  config.toml

scripts/
  seed-user.mjs               # Seed de Gabriel Silva (perfil rico pra demo)
  seed-test-users.mjs         # 4 usuários de teste pra fluxos de exclusão
  audit-exercise-images.mjs   # Auditoria de imagens do catálogo
  audit-ai-usage.mjs          # Análise de consumo de IA
  e2e/                        # Runner de smoke tests
  reset-user.sql              # SQL pra limpar dados de um user

assets/                       # Imagens, ícones, splash
```

## Schema Supabase (resumo)

**Auth:** `auth.users` (gerenciado pelo Supabase).

**Por usuário (RLS = auth.uid() = user_id):**
- `profiles` — id = auth.users.id; biometria, metas, campos de onboarding, `user_number`, `is_early_adopter`, `role` (`'comum'|'aluno'|'professor'`), `coach_id`, `avatar_url`, `expo_push_token`.
- `workout_logs`, `food_logs`, `water_logs` — logs diários.
- `workout_routines` → `workout_routine_exercises` (cascade) — rotinas e prescrição. Tem `created_by_coach` (lock pra aluno), `source_template_id` (auditoria de cópia) e `sort_order` (drag-and-drop).
- `workout_sessions` — execuções diárias de rotinas.
- `chat_messages` — histórico do chat com IA (cota diária via `day` column).
- `ai_usage_log` — log analítico de chamadas IA. Slugs:
  `chat | sanity_check | onboarding_plan | coach_plan | push_inactivity |
  push_streak | push_workout | push_weekly_summary | push_coach_alert |
  push_plan_update | push_goal_achieved | push_protein | push_workout_check |
  push_streak_warning | push_account_deleted | push_coach_unlinked`.
- `progress_entries` — pontos de evolução (peso, medidas).

**Área do professor:**
- `coaches` — 1:1 com profiles quando role=professor. `bio`, `cref`, `max_students`, `contact_phone`, `show_contact_to_students`.
- `workout_templates` → `workout_template_exercises` (cascade) — biblioteca privada (RLS: só o coach dono).
- `student_requests` — fila de solicitações aluno → professor.
- `coach_notes` — anotações privadas do coach sobre o aluno (RLS: só coach dono; **apagadas em desvincular**).
- `student_plan_revisions` — histórico de planos publicados (RLS: coach OR student; coach_id é setado pra null no desvincular).
- `student_anamneses` — anamnese expandida (PK user_id, RLS: dono OR coach do aluno).
- `student_contracts` — contratos entre coach e aluno.
- `physical_assessments` — avaliações físicas periódicas.

**Push notifications:**
- `push_preferences` — opt-in/out granular por tipo (`(user_id, type)` PK). Tipos no enum `push_type`:
  `inactivity_reminder | streak_celebration | daily_workout_reminder |
  water_reminder | weekly_summary | coach_adherence_alert |
  coach_plan_update | goal_achieved | protein_reminder |
  daily_workout_check | streak_warning | student_account_deleted |
  coach_unlinked`.
- `push_history` — audit de envios (sent/failed/skipped + skip_reason: `no_token | opted_out | cooldown | rate_limit | quiet_hours | ai_failed | expo_failed | no_goal | goal_met | rest_day | not_enough_history | already_trained | streak_too_short | active_today`).

**Auditoria LGPD:**
- `account_deletion_log` — hashes SHA-256 (sem PII) + role + idade da conta + motivo opcional. RLS sem policies (só service_role e painel).

**Catálogo global (RLS = leitura pra autenticados):**
- `exercise_groups` (9 grupos) → `exercises` (~269 exercícios com `modality`: `musculacao | calistenia | crossfit | corrida | generico`).
- Helper SQL `public.exercise_image_urls(slug)` monta URLs do CDN jsDelivr (free-exercise-db CC0).

**Administração:**
- `admin_users` — separado de profiles (admin não tem perfil de usuário). Função `is_admin(uuid)` SECURITY DEFINER pra usar em policies.

**Bibliografia:**
- `bibliography_references` — referências usadas pela IA pra ancorar respostas.

**Storage:**
- `meal-photos` — privado, prefixo `<user_id>/`.
- `profile-photos` — público, prefixo `<user_id>/` (avatars).

**Functions / RPCs do banco:**
- `handle_new_user` — cria `profiles` no INSERT em `auth.users` (trigger).
- `set_updated_at` — atualiza `updated_at` em várias tabelas.
- `is_admin(uid)` — SECURITY DEFINER, usado em policies.
- `reorder_routines(user_id, ordered_ids)` — atualiza `sort_order` em lote (security invoker, respeita RLS).

**Cron jobs (pg_cron + pg_net):** agendados pelo painel Supabase, fazem `net.http_post` pras edge functions `cron-*` com header `X-Cron-Secret`. Cobrem inatividade, streak, water EOD, protein EOD, workout check, streak warning, e ai-quota-alert.

## Comandos principais

| Comando | Ação |
|---------|------|
| `npm run start` | Expo dev server (dev client) |
| `npm run start:go` | Expo Go (sem Google Sign-in nativo) |
| `npm run android` | Build dev e abrir |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |
| `npm run db:push` | `supabase db push` (aplicar migrations) |
| `npm run fn:deploy` | Deploy de todas as edge functions |
| `npm run seed:user` | Seed de usuário rico (Gabriel Silva) pra demo |
| `npm run seed:test-users` | 4 usuários (comum/coach/aluno×2) pra fluxos de exclusão |
| `npm run audit:exercise-images` | Audita catálogo (sem imagem por grupo) |
| `npm run audit:ai-usage` | Análise de consumo de IA |
| `npm run update:preview` | OTA pra channel preview |
| `npm run update:production` | OTA pra channel production |

## Convenções de RLS

Toda tabela com `user_id` repete o mesmo padrão:

```sql
alter table public.X enable row level security;
create policy "X_select_own" on public.X for select using (auth.uid() = user_id);
create policy "X_insert_own" on public.X for insert with check (auth.uid() = user_id);
create policy "X_update_own" on public.X for update using (auth.uid() = user_id);
create policy "X_delete_own" on public.X for delete using (auth.uid() = user_id);
```

Tabelas filhas (`workout_routine_exercises`) validam ownership via `EXISTS` no parent.

Tabelas com vínculo coach→aluno ganham policies extras que filtram via
`user_id IN (SELECT id FROM profiles WHERE coach_id = auth.uid())`, permitindo
o coach ler/escrever dados do aluno enquanto o vínculo existe.
