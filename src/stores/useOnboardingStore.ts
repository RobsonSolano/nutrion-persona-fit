import { create } from 'zustand';
import type {
  DisabilityType,
  GoalType,
  Sex,
  WeeklyFrequency,
} from '@/types/database';

export type OnboardingState = {
  // Tela 2 — dados pessoais
  sex: Sex | null;
  birth_year: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  // Tela 3 — objetivo
  goal_type: GoalType | null;
  goal_weight_kg: number | null;
  goal_target_date: string | null; // yyyy-mm-dd
  // Tela 4 — esporte
  practices_sport: boolean | null;
  sports: string[];
  weekly_frequency: WeeklyFrequency | null;
  // Tela 5 — hábitos
  water_goal_ml: number | null;
  allergies: string;
  physical_limitations: string;
  // null = ainda não respondeu (o campo é opcional)
  has_disability: boolean | null;
  disability_types: DisabilityType[];
  disability_notes: string;
  // Tela 6 — bio
  bio: string;
  // Controle
  startedAt: string | null;
};

type Actions = {
  patch: (p: Partial<OnboardingState>) => void;
  toggleSport: (sport: string) => void;
  reset: () => void;
  begin: () => void;
};

const initial: OnboardingState = {
  sex: null,
  birth_year: null,
  weight_kg: null,
  height_cm: null,
  goal_type: null,
  goal_weight_kg: null,
  goal_target_date: null,
  practices_sport: null,
  sports: [],
  weekly_frequency: null,
  water_goal_ml: 2000,
  allergies: '',
  physical_limitations: '',
  has_disability: null,
  disability_types: [],
  disability_notes: '',
  bio: '',
  startedAt: null,
};

export const useOnboardingStore = create<OnboardingState & Actions>((set) => ({
  ...initial,
  patch: (p) => set((s) => ({ ...s, ...p })),
  toggleSport: (sport) =>
    set((s) => ({
      sports: s.sports.includes(sport)
        ? s.sports.filter((x) => x !== sport)
        : [...s.sports, sport],
    })),
  reset: () => set({ ...initial }),
  begin: () =>
    set((s) =>
      s.startedAt ? s : { ...s, startedAt: new Date().toISOString() },
    ),
}));
