// Types das tabelas Supabase (sincronizado com supabase/migrations/20260419220000_init.sql)

export type Sex = 'm' | 'f' | 'o';
export type GoalType =
  | 'lose_fat'
  | 'maintain'
  | 'gain_muscle'
  | 'reduce_body_fat';
export type WeeklyFrequency = '1-2' | '2-3' | '3-4' | '4-5' | '5-6' | '6-7';

export type ProfileRole = 'comum' | 'aluno' | 'professor';

/** Tipos de deficiência declarados. Os dois primeiros viram bloqueio
 *  determinístico de exercício no gerador de plano (bodyRestrictions.ts). */
export type DisabilityType =
  | 'wheelchair_paraplegia'
  | 'amputation_lower'
  | 'amputation_upper'
  | 'visual'
  | 'hearing'
  | 'other';

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  /** Espelho de auth.users.email (trigger). Somente leitura. */
  email: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  goal_weight_kg: number | null;
  daily_calorie_goal: number | null;
  protein_goal_g: number | null;
  water_goal_ml: number | null;
  sex: Sex | null;
  birth_year: number | null;
  goal_type: GoalType | null;
  goal_target_date: string | null;
  bio: string | null;
  allergies: string | null;
  physical_limitations: string | null;
  practices_sport: boolean | null;
  sports: string[] | null;
  weekly_frequency: WeeklyFrequency | null;
  /** null = nunca respondeu (perfis antigos). */
  has_disability: boolean | null;
  disability_types: DisabilityType[];
  disability_notes: string | null;
  onboarding_completed_at: string | null;
  onboarding_skipped_at: string | null;
  suspended_at: string | null;
  user_number: number | null;
  is_early_adopter: boolean | null;
  role: ProfileRole;
  coach_id: string | null;
  expo_push_token: string | null;
  created_at: string;
  updated_at: string;
};

export type Coach = {
  id: string;
  bio: string | null;
  cref: string | null;
  max_students: number;
  show_contact_to_students: boolean;
  contact_phone: string | null;
  created_at: string;
};

export type CoachContact = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  cref: string | null;
  show_contact_to_students: boolean;
  contact_phone: string | null;
};

export type StudentRequestStatus =
  | 'open'
  | 'in_progress'
  | 'done'
  | 'cancelled';

export type StudentRequest = {
  id: string;
  student_id: string;
  coach_id: string;
  message: string;
  status: StudentRequestStatus;
  coach_response: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = Partial<
  Omit<Profile, 'id' | 'created_at' | 'updated_at'>
>;

export type WorkoutLog = {
  id: string;
  user_id: string;
  exercise_name: string;
  exercise_id: string | null;
  group_id: string | null;
  sets: number | null;
  reps: number | null;
  reps_min: number | null;
  reps_max: number | null;
  weight_kg: number | null;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  intensity_rpe: number | null;
  notes: string | null;
  created_at: string;
};

export type WorkoutLogInsert = Omit<WorkoutLog, 'id' | 'user_id' | 'created_at'>;

export type ExerciseGroup = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  sort_order: number;
};

/** Formato de métricas do exercício: força usa séries/reps/carga, cardio usa
 *  distância/RPM/tempo. */
export type MetricType = 'strength' | 'cardio';

export type Modality =
  | 'musculacao'
  | 'calistenia'
  | 'crossfit'
  | 'corrida'
  | 'generico';

export const MODALITY_LABELS: Record<Modality, string> = {
  musculacao: 'Musculação',
  calistenia: 'Calistenia',
  crossfit: 'CrossFit',
  corrida: 'Corrida',
  generico: 'Genérico',
};

export type Exercise = {
  id: string;
  group_id: string;
  name: string;
  equipment: string | null;
  is_compound: boolean | null;
  image_urls: string[] | null;
  video_url: string | null;
  modality: Modality;
};

export type WaterLog = {
  id: string;
  user_id: string;
  day: string; // YYYY-MM-DD
  volume_ml: number;
  updated_at: string;
};

export type WorkoutRoutine = {
  id: string;
  user_id: string;
  name: string;
  group_id: string | null;
  modality: Modality;
  description: string | null;
  is_archived: boolean;
  created_by_coach: string | null;
  source_template_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WorkoutTemplate = {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  group_id: string | null;
  modality: Modality;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type TemplateExercise = {
  id: string;
  template_id: string;
  exercise_id: string | null;
  exercise_name: string;
  equipment: string | null;
  sort_order: number;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  duration_min: number | null;
  /** strength (séries/reps/carga) ou cardio (distância/RPM/tempo). Snapshot do
   *  grupo do exercício — não depende de exercise_id continuar existindo. */
  metric_type: MetricType;
  /** Só em cardio. Metros (inteiro cobre natação 100m e corrida 10000m). */
  distance_min_m: number | null;
  distance_max_m: number | null;
  /** Só em cardio. Bike, elíptico e remo usam; esteira e corrida não. */
  cadence_rpm: number | null;
  notes: string | null;
};

export type TemplateExerciseInsert = Omit<TemplateExercise, 'id' | 'template_id'>;

export type TemplateWithExercises = WorkoutTemplate & {
  exercises: TemplateExercise[];
  group: ExerciseGroup | null;
};

export type TemplateListItem = WorkoutTemplate & {
  exercises_count: number;
};

/** Versão do listItem com contagem de exercícios (via PostgREST aggregate). */
export type WorkoutRoutineListItem = WorkoutRoutine & {
  exercises_count: number;
};

export type RoutineExercise = {
  id: string;
  routine_id: string;
  exercise_id: string | null;
  exercise_name: string;
  equipment: string | null;
  sort_order: number;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  weight_min_kg: number | null;
  weight_max_kg: number | null;
  duration_min: number | null;
  /** strength (séries/reps/carga) ou cardio (distância/RPM/tempo). Snapshot do
   *  grupo do exercício — não depende de exercise_id continuar existindo. */
  metric_type: MetricType;
  /** Só em cardio. Metros (inteiro cobre natação 100m e corrida 10000m). */
  distance_min_m: number | null;
  distance_max_m: number | null;
  /** Só em cardio. Bike, elíptico e remo usam; esteira e corrida não. */
  cadence_rpm: number | null;
  notes: string | null;
};

export type RoutineExerciseInsert = Omit<RoutineExercise, 'id' | 'routine_id'> & {
  routine_id?: string;
};

export type RoutineWithExercises = WorkoutRoutine & {
  exercises: RoutineExercise[];
  group: ExerciseGroup | null;
};

export type WorkoutSession = {
  id: string;
  user_id: string;
  routine_id: string | null;
  routine_name: string;
  day: string;
  duration_min: number | null;
  notes: string | null;
  created_at: string;
};

export type FoodLog = {
  id: string;
  user_id: string;
  meal_name: string | null;
  description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  photo_path: string | null;
  ai_feedback: string | null;
  created_at: string;
};

export type FoodLogInsert = Omit<FoodLog, 'id' | 'user_id' | 'created_at'>;

export type ChatAiRequest = {
  message: string;
  imageBase64?: string;
  imageMime?: 'image/jpeg' | 'image/png' | 'image/webp';
  scaleWeightG?: number;
  mode?: 'chat' | 'sanity_check';
};

export type ChatAiResponse = {
  text: string;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | null;
};

export type ContractType = 'mensal' | 'treino' | 'semanal' | 'parceria';
export type ContractStatus = 'active' | 'ended' | 'cancelled';

export type StudentContract = {
  id: string;
  student_id: string;
  coach_id: string;
  type: ContractType;
  start_date: string;
  end_date: string | null;
  value_cents: number | null;
  payment_day: number | null;
  status: ContractStatus;
  effective_status: ContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractInput = Omit<
  StudentContract,
  'id' | 'coach_id' | 'effective_status' | 'created_at' | 'updated_at' | 'status'
>;

export type ContractPatch = Partial<
  Pick<
    StudentContract,
    'type' | 'start_date' | 'end_date' | 'value_cents' | 'payment_day' | 'notes'
  >
>;

export type ProgressEntry = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type AssessmentProtocol = 'pollock_3' | 'pollock_7' | 'none';

export type PhysicalAssessment = {
  id: string;
  student_id: string;
  coach_id: string;
  assessed_at: string; // YYYY-MM-DD

  protocol: AssessmentProtocol;

  weight_kg: number | null;
  height_cm: number | null;

  perim_arm_r_cm: number | null;
  perim_arm_l_cm: number | null;
  perim_forearm_r_cm: number | null;
  perim_forearm_l_cm: number | null;
  perim_chest_cm: number | null;
  perim_waist_cm: number | null;
  perim_hip_cm: number | null;
  perim_thigh_r_cm: number | null;
  perim_thigh_l_cm: number | null;
  perim_calf_r_cm: number | null;
  perim_calf_l_cm: number | null;

  skin_chest_mm: number | null;
  skin_midaxillary_mm: number | null;
  skin_triceps_mm: number | null;
  skin_subscapular_mm: number | null;
  skin_abdominal_mm: number | null;
  skin_suprailiac_mm: number | null;
  skin_thigh_mm: number | null;

  body_density: number | null;
  body_fat_pct: number | null;
  fat_mass_kg: number | null;
  lean_mass_kg: number | null;
  bmi: number | null;

  posture_notes: string | null;
  posture_photos: string[];
  notes: string | null;

  created_at: string;
  updated_at: string;
};

export type PhysicalAssessmentInput = Omit<
  PhysicalAssessment,
  | 'id'
  | 'coach_id'
  | 'body_density'
  | 'body_fat_pct'
  | 'fat_mass_kg'
  | 'lean_mass_kg'
  | 'bmi'
  | 'created_at'
  | 'updated_at'
>;

export type PhysicalAssessmentPatch = Partial<
  Omit<
    PhysicalAssessmentInput,
    'student_id'
  >
>;

export type PushType =
  | 'inactivity_reminder'
  | 'streak_celebration'
  | 'daily_workout_reminder'
  | 'water_reminder'
  | 'weekly_summary'
  | 'coach_adherence_alert'
  | 'coach_plan_update'
  | 'goal_achieved'
  | 'protein_reminder'
  | 'daily_workout_check'
  | 'streak_warning'
  | 'student_account_deleted'
  | 'coach_unlinked';

export type PushPreference = {
  user_id: string;
  type: PushType;
  enabled: boolean;
  preferred_time: string | null;
  updated_at: string;
};

export type PushHistoryStatus = 'sent' | 'failed' | 'skipped';
export type PushHistorySkipReason =
  | 'no_token'
  | 'opted_out'
  | 'cooldown'
  | 'rate_limit'
  | 'quiet_hours'
  | 'ai_failed'
  | 'expo_failed'
  | 'no_goal'
  | 'goal_met'
  | 'rest_day'
  | 'not_enough_history'
  | 'already_trained'
  | 'streak_too_short'
  | 'active_today';

export type PushHistoryEntry = {
  id: string;
  user_id: string;
  type: PushType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  ai_generated: boolean;
  ai_tokens: number | null;
  expo_response: Record<string, unknown> | null;
  status: PushHistoryStatus;
  skip_reason: PushHistorySkipReason | null;
  sent_at: string;
};

export type InjuryTag =
  | 'ombro_d' | 'ombro_e'
  | 'cotovelo_d' | 'cotovelo_e'
  | 'punho_d' | 'punho_e'
  | 'lombar' | 'cervical'
  | 'quadril_d' | 'quadril_e'
  | 'joelho_d' | 'joelho_e'
  | 'tornozelo_d' | 'tornozelo_e'
  | 'outros';

export type ChronicConditionTag =
  | 'hipertensao' | 'diabetes_t1' | 'diabetes_t2'
  | 'hipotireoidismo' | 'hipertireoidismo'
  | 'asma' | 'cardiopatia' | 'dislipidemia'
  | 'artrose' | 'artrite' | 'fibromialgia' | 'epilepsia'
  | 'depressao' | 'ansiedade'
  | 'outros';

export type DietaryRestrictionTag =
  | 'vegetariano' | 'vegano' | 'ovolactovegetariano' | 'pescetariano'
  | 'sem_gluten' | 'sem_lactose' | 'low_carb'
  | 'kosher' | 'halal' | 'jejum_intermitente'
  | 'outros';

export type Surgery = {
  date: string; // 'YYYY' ou 'YYYY-MM'
  type: string;
  notes?: string;
};

export type StudentAnamnese = {
  user_id: string;
  injuries: InjuryTag[];
  injuries_notes: string | null;
  surgeries: Surgery[];
  chronic_conditions: ChronicConditionTag[];
  chronic_conditions_notes: string | null;
  medications: string | null;
  allergy_food: string | null;
  allergy_medication: string | null;
  allergy_environmental: string | null;
  dietary_restrictions: DietaryRestrictionTag[];
  dietary_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  sport_history: string | null;
  goal_notes: string | null;
  has_medical_clearance: boolean | null;
  medical_clearance_notes: string | null;
  filled_at: string | null;
  updated_at: string;
};

export type StudentAnamnesePatch = Partial<
  Omit<StudentAnamnese, 'user_id' | 'updated_at'>
>;

