// Persona e prompts dos pushes gerados por IA.
// Versionados em código (não no banco) — mudança vira PR rastreável.

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
  | 'coach_unlinked'
  | 'enrollment_accepted'
  | 'enrollment_declined';

export const PERSONA_SYSTEM = `Você é a voz do NutriOn — um app de nutrição e treino com pegada brasileira, direta, sem fofura. Fala "você", não "tu". Não usa emoji. Não usa frases clichês de coach motivacional ("acredite em você", "vamos juntos"). É um amigo que entende do assunto: curto, específico, e que conhece a pessoa.

Limites duros:
- Push tem TÍTULO com no máximo 45 caracteres e CORPO com no máximo 110 caracteres. Frases inteiras, nunca truncadas.
- Devolve JSON válido: {"title":"...","body":"..."}.
- Sem markdown, sem emoji, sem aspas dentro do texto.
- Português brasileiro com acentuação correta.`;

// Slug usado em ai_usage_log.feature
export function aiUsageFeature(type: PushType): string {
  switch (type) {
    case 'inactivity_reminder':
      return 'push_inactivity';
    case 'streak_celebration':
      return 'push_streak';
    case 'daily_workout_reminder':
      return 'push_workout';
    case 'weekly_summary':
      return 'push_weekly_summary';
    case 'coach_adherence_alert':
      return 'push_coach_alert';
    case 'coach_plan_update':
      return 'push_plan_update';
    case 'goal_achieved':
      return 'push_goal_achieved';
    case 'water_reminder':
      // Water reminder não usa IA (template fixo).
      return 'push_workout';
    case 'protein_reminder':
      return 'push_protein';
    case 'daily_workout_check':
      return 'push_workout_check';
    case 'streak_warning':
      return 'push_streak_warning';
    case 'student_account_deleted':
      return 'push_account_deleted';
    case 'coach_unlinked':
      return 'push_coach_unlinked';
    case 'enrollment_accepted':
      return 'push_enrollment_accepted';
    case 'enrollment_declined':
      return 'push_enrollment_declined';
  }
}

// Templates de prompt — recebem contexto, devolvem mensagem usuário pra Groq.
export function buildUserPrompt(
  type: PushType,
  ctx: Record<string, unknown>,
): string {
  switch (type) {
    case 'inactivity_reminder':
      return `Contexto:
- Nome: ${ctx.full_name ?? 'aluno'}
- Objetivo: ${ctx.goal_type ?? 'não informado'}
- Dias sem registrar nada: ${ctx.days_inactive ?? 'desconhecido'}
- Última atividade: ${ctx.last_activity_summary ?? 'sem registro recente'}
- É a ${ctx.nth_inactivity_reminder_in_week ?? 1}ª vez essa semana

Gere um push lembrando a pessoa de voltar a registrar. Se for a 1ª vez da semana, tom amigo. Se for 3ª, tom mais direto sem ser passivo-agressivo. Cita o objetivo dela quando faz sentido.`;

    case 'streak_celebration':
      return `Contexto:
- Nome: ${ctx.full_name ?? 'aluno'}
- Marco: ${ctx.streak_days} dias seguidos com registro
- Tipo de registro mais frequente: ${ctx.dominant_log_type ?? 'treino'}

Gere um push parabenizando pelo marco. Curto, específico, sem clichê. Cita o número exato. Não fala "continue assim", fala algo concreto sobre o próximo marco ou sobre o hábito.`;

    case 'daily_workout_reminder':
      return `Contexto:
- Nome: ${ctx.full_name ?? 'aluno'}
- Treino de hoje: ${ctx.today_workout_name ?? 'treino'} (${ctx.today_workout_focus ?? 'geral'})
- Objetivo: ${ctx.goal_type ?? 'manutenção'}
- Constância da semana: ${ctx.weekly_adherence_pct ?? 0}%

Gere um push de manhã lembrando do treino. Cita o nome do treino. Tom varia com a constância: alta = celebra; baixa = chamada direta sem culpar.`;

    case 'weekly_summary':
      return `Contexto da semana (segunda a domingo):
- Nome: ${ctx.full_name ?? 'aluno'}
- Treinos feitos: ${ctx.workouts_done ?? 0}/${ctx.workouts_planned ?? 0}
- Refeições registradas: ${ctx.meals_logged ?? 0} (média/dia: ${ctx.meals_avg ?? 0})
- Água média/dia: ${ctx.water_avg_ml ?? 0} ml (meta: ${ctx.water_goal_ml ?? 2500})
- Variação de peso: ${ctx.weight_delta_kg ?? 0} kg
- Maior conquista: ${ctx.top_win ?? 'sem destaque'}
- Maior gap: ${ctx.top_gap ?? 'sem gap'}

Gere um push de domingo à noite com o resumo. Título celebra o top_win em poucas palavras. Corpo: 1 número que importa + 1 orientação concreta pra próxima semana. Não é parágrafo motivacional.`;

    case 'coach_adherence_alert':
      return `Você está escrevendo pra um PROFESSOR (coach), não pro aluno.

Contexto:
- Coach: ${ctx.coach_name ?? 'coach'}
- Aluno: ${ctx.student_name ?? 'aluno'}
- Aderência últimos 7 dias: ${ctx.adherence_7d ?? 0}% (semana anterior: ${ctx.adherence_prev ?? 0}%)
- Última atividade: ${ctx.last_activity_summary ?? 'sem registro'}
- Última nota do coach: ${ctx.last_coach_note ?? 'nenhuma'}

Gere um push curto e operacional pro coach. Título sinaliza qual aluno. Corpo dá um dado e sugere uma ação ("Chama a Maria" / "Vale revisar a carga"). NÃO usa tom motivacional — é alerta de gestão.`;

    case 'coach_plan_update':
      return `Contexto:
- Aluno: ${ctx.student_name ?? 'aluno'}
- Coach: ${ctx.coach_name ?? 'coach'}
- Tipo de mudança: ${ctx.change_type ?? 'plano'}
- Resumo do que mudou: ${ctx.change_summary ?? 'plano atualizado'}

Gere um push pro aluno avisando que o coach atualizou o plano. Cita o nome do coach. Curto, convida a abrir o app.`;

    case 'goal_achieved':
      return `Contexto:
- Nome: ${ctx.full_name ?? 'aluno'}
- Tipo de meta: ${ctx.goal_type ?? 'objetivo'}
- Marco atingido: ${ctx.milestone ?? 'marco'}
- Peso inicial → atual: ${ctx.start_weight ?? '?'} → ${ctx.current_weight ?? '?'}
- Tempo até o marco: ${ctx.days_to_milestone ?? 0} dias

Gere um push celebrando o marco. Forte, curto, específico. Cita o número (kg, dias). Sem clichê motivacional.`;

    case 'water_reminder':
      // Não usa IA — template fixo. Caller deve usar staticTemplate.
      return '';

    case 'protein_reminder':
      return `Contexto:
- Nome: ${ctx.full_name ?? 'aluno'}
- Proteína consumida hoje: ${ctx.protein_consumed_g ?? 0}g
- Meta diária: ${ctx.protein_goal_g ?? 0}g
- Gap (faltam): ${ctx.gap_g ?? 0}g
- Refeições registradas hoje: ${ctx.meals_logged_today ?? 0}
- Objetivo: ${ctx.goal_type ?? 'manutenção'}

Gere um push avisando do gap de proteína. Cita o número em gramas. Sugere ação prática (shake, ovos, atum, frango). Não culpa nem moraliza. Se o gap é pequeno (<20g), tom leve; se é grande (>50g), tom mais direto.`;

    case 'daily_workout_check':
      return `Contexto:
- Nome: ${ctx.full_name ?? 'aluno'}
- Hoje é: ${ctx.weekday_pt ?? 'hoje'} (${ctx.date_brt ?? ''})
- Treinos esta semana: ${ctx.weekly_workouts_done ?? 0}
- Padrão (últimas 4 semanas): você costuma treinar em ${ctx.typical_weekdays_pt ?? 'alguns dias'}
- Objetivo: ${ctx.goal_type ?? 'manutenção'}

Gere um push perguntando se hoje é descanso ou esquecimento. Reconhece que pode ser descanso planejado. Curto e leve. Não cobra.`;

    case 'streak_warning':
      return `Contexto:
- Nome: ${ctx.full_name ?? 'aluno'}
- Sequência atual (até ontem): ${ctx.current_streak ?? 0} dias
- Objetivo: ${ctx.goal_type ?? 'manutenção'}

Gere um push avisando que a sequência pode quebrar se não houver registro hoje. Cita o número exato. Tom de alerta de amigo — sem desespero. Sugere ação rápida (água, refeição ou treino).`;

    case 'student_account_deleted':
      return `Contexto:
- Aluno: ${ctx.student_name ?? 'aluno'}
- Tempo como aluno: ${ctx.account_age_days ?? 0} dias
- Última atividade: ${ctx.last_activity_summary ?? 'sem registro recente'}

Você está escrevendo pra um PROFESSOR (coach), avisando que um aluno acabou de excluir a conta no app. Tom: operacional, curto, sem lamento ou clichê. Cita o nome e o tempo se relevante. Sugere ação prática quando faz sentido (ex: vale uma mensagem se quiser entender o motivo). NÃO use emoji. NÃO use a palavra infelizmente.`;

    case 'coach_unlinked':
      return `Contexto:
- Coach: ${ctx.coach_name ?? 'seu professor'}
- Tempo com o coach: ${ctx.days_with_coach ?? 0} dias
${ctx.trial_granted ? `- Ganhou ${ctx.trial_days ?? 7} dias de teste grátis do plano Pro (Chat IA + Sanity Check)` : ''}

Você está escrevendo pra um ALUNO que acabou de ser desvinculado pelo professor dele. Tom: factual, sem culpa nem dramatização. Reconhece a mudança e enfatiza que agora ele gerencia o próprio plano.${ctx.trial_granted ? ' Mencione, de forma breve e animadora, que ele ganhou dias de teste grátis do Pro pra continuar usando a IA.' : ''} NÃO use emoji. NÃO julga o motivo do desvínculo.`;

    case 'enrollment_accepted':
      return `Contexto:
- Professor: ${ctx.coach_name ?? 'seu professor'}

Você está escrevendo pra um usuário que pediu pra ser aluno desse professor e acabou de ser ACEITO. Tom: direto e concreto. Diz que a partir de agora o professor monta e ajusta o plano dele (treino, calorias, água). NÃO use emoji. NÃO prometa resultado.`;

    case 'enrollment_declined':
      return `Contexto:
- Professor: ${ctx.coach_name ?? 'o professor'}

Você está escrevendo pra um usuário cuja solicitação pra virar aluno NÃO foi aceita. Tom: factual e curto, sem lamento, sem pedir desculpa, sem julgar o motivo. Deixa claro que a conta dele continua igual e que ele pode procurar outro professor. NÃO use emoji.`;
  }
}

// Pra water_reminder e fallback quando IA falha
export function staticTemplate(
  type: PushType,
  ctx: Record<string, unknown>,
): { title: string; body: string } {
  switch (type) {
    case 'water_reminder':
      return {
        title: 'Faltando água',
        body: `Você bebeu ${ctx.water_now_ml ?? 0}ml de ${ctx.water_goal_ml ?? 2500}ml hoje. Ainda dá tempo.`,
      };
    case 'inactivity_reminder':
      return {
        title: 'Voltando ao plano?',
        body: 'Faz alguns dias sem registro. Bora dar uma olhada?',
      };
    case 'streak_celebration':
      return {
        title: `${ctx.streak_days ?? 0} dias seguidos`,
        body: 'Constância paga. Mantém o ritmo.',
      };
    case 'daily_workout_reminder':
      return {
        title: 'Treino de hoje',
        body: `Hora do ${ctx.today_workout_name ?? 'treino'}. Bora.`,
      };
    case 'weekly_summary':
      return {
        title: 'Resumo da semana',
        body: `${ctx.workouts_done ?? 0}/${ctx.workouts_planned ?? 0} treinos feitos.`,
      };
    case 'coach_adherence_alert':
      return {
        title: `${ctx.student_name ?? 'aluno'} sumiu`,
        body: `Aderência caiu pra ${ctx.adherence_7d ?? 0}%. Vale chamar.`,
      };
    case 'coach_plan_update':
      return {
        title: 'Plano atualizado',
        body: `${ctx.coach_name ?? 'Seu coach'} atualizou seu plano.`,
      };
    case 'goal_achieved':
      return {
        title: 'Marco atingido',
        body: 'Você bateu mais um marco. Bom trabalho.',
      };
    case 'protein_reminder':
      return {
        title: 'Faltando proteína',
        body: `Você fez ${ctx.protein_consumed_g ?? 0}g de ${ctx.protein_goal_g ?? 0}g hoje. Ainda dá tempo.`,
      };
    case 'daily_workout_check':
      return {
        title: 'Não treinou hoje?',
        body: 'Se hoje é descanso, ignora. Senão, ainda dá tempo de mexer.',
      };
    case 'streak_warning':
      return {
        title: `${ctx.current_streak ?? 0} dias — não quebre`,
        body: 'Falta um registro hoje pra manter a sequência. Vai um copo de água?',
      };
    case 'student_account_deleted':
      return {
        title: 'Aluno saiu',
        body: `${ctx.student_name ?? 'Um aluno'} excluiu a conta.`,
      };
    case 'coach_unlinked':
      return {
        title: 'Plano agora é seu',
        body: 'Seu professor encerrou o vínculo. Você continua com seus treinos e agora pode editá-los.',
      };
    case 'enrollment_accepted':
      return {
        title: 'Solicitação aceita',
        body: `${ctx.coach_name ?? 'Seu professor'} aceitou você como aluno. O plano agora é acompanhado por ele.`,
      };
    case 'enrollment_declined':
      return {
        title: 'Solicitação não aceita',
        body: 'Sua conta continua como está. Você pode procurar outro professor quando quiser.',
      };
  }
}
