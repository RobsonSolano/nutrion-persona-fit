// Especialidades do professor — vocabulário PRÓPRIO da descoberta.
//
// Não reusa `Modality` (src/types/database.ts): aquilo classifica o
// EXERCÍCIO/rotina (5 valores: musculacao, calistenia, crossfit, corrida,
// generico) e é usado pra filtrar catálogo. Aqui é o que o professor
// ATENDE, que é outra coisa e outra lista — juntar os dois faria a
// modalidade de um agachamento aparecer como especialidade de personal.
//
// Slugs sem acento: viajam pro banco (coaches.specialties) e entram em
// comparação de array. Os rótulos com acento ficam só na UI.

export const ESPECIALIDADES = [
  'musculacao',
  'crossfit',
  'powerlifting',
  'funcional',
  'calistenia',
  'corrida',
  'natacao',
  'ciclismo',
  'lutas',
  'pilates',
  'yoga',
  'emagrecimento',
  'hipertrofia',
  'condicionamento',
  'reabilitacao',
  'idosos',
  'gestantes',
  'nutricao',
] as const;

export type Especialidade = (typeof ESPECIALIDADES)[number];

export const ESPECIALIDADE_LABELS: Record<Especialidade, string> = {
  musculacao: 'Musculação',
  crossfit: 'CrossFit',
  powerlifting: 'Powerlifting',
  funcional: 'Treino funcional',
  calistenia: 'Calistenia',
  corrida: 'Corrida',
  natacao: 'Natação',
  ciclismo: 'Ciclismo',
  lutas: 'Lutas / artes marciais',
  pilates: 'Pilates',
  yoga: 'Yoga',
  emagrecimento: 'Emagrecimento',
  hipertrofia: 'Hipertrofia',
  condicionamento: 'Condicionamento físico',
  reabilitacao: 'Reabilitação',
  idosos: 'Terceira idade',
  gestantes: 'Gestantes',
  nutricao: 'Nutrição',
};

export function especialidadeLabel(slug: string): string {
  return ESPECIALIDADE_LABELS[slug as Especialidade] ?? slug;
}

export const MAX_ESPECIALIDADES = 12;

export type ServiceMode = 'online' | 'presencial' | 'hibrido';

export const SERVICE_MODES: ServiceMode[] = ['online', 'presencial', 'hibrido'];

export const SERVICE_MODE_LABELS: Record<ServiceMode, string> = {
  online: 'Online',
  presencial: 'Presencial',
  hibrido: 'Híbrido',
};
