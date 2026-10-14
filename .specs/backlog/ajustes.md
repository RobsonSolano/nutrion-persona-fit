# Backlog — ajustes

> Coisas erradas encontradas fora do escopo da tarefa em andamento. Ver skill fora-do-escopo.

## pushAi.ts usa modelo Groq descontinuado como fallback
**Origem:** encontrado em 2026-09-15, durante a feature de exercícios em conjunto.
**Onde:** `supabase/functions/_shared/pushAi.ts:19`
**O que é:** `Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile'`. O modelo foi
descontinuado pela Groq e responde 404 — confirmado ao vivo em `/v1/models` com a chave do
projeto. O projeto já resolveu isso em `_shared/groqRetry.ts`
(`DEFAULT_TEXT_MODEL = 'openai/gpt-oss-120b'`, com comentário explícito dizendo pra não usar
mais o llama); `pushAi.ts` é o único dos 5 arquivos que não importa a constante.
**Impacto:** só morde se o secret `GROQ_MODEL` for removido do Supabase — aí os push com IA
caem no template silenciosamente (o código tem fallback, então não quebra visivelmente).
**Esforço:** minutos — importar `DEFAULT_TEXT_MODEL` como os outros fazem.

## Baseline de lint desatualizada no STATE.md
**Origem:** encontrado em 2026-09-15, na mesma feature. **Já corrigido** na entrada de
2026-09-15 do STATE.md, mas fica o registro: o número antigo ("6 erros + 34 warnings") vinha
da era do billing e a medição real da develop hoje é 6 erros + 41 warnings. Baseline errada
acusa regressão falsa em gate de lint.
**Esforço:** feito.

## 27 cópias idênticas de `deno.json`, uma por edge function
**Origem:** encontrado em 2026-10-13, ao retomar a feature aluno-contrata-professor.
**Onde:** `supabase/functions/*/deno.json`
**O que é:** cada function tem seu próprio import map (`std/` + `@supabase/supabase-js`), todos
byte-idênticos. A function nova `coach-respond-enrollment` nasceu sem o arquivo e não subia
(nem local, e provavelmente nem no deploy) — passou 6 semanas com o diagnóstico errado de que o
problema era o `_shared/`.
**Impacto:** toda function nova precisa lembrar de copiar o arquivo; subir a versão do
supabase-js exige editar 27 arquivos.
**Esforço:** médio — import map compartilhado (`supabase/functions/import_map.json` ou
`import_map` no `config.toml`) mexe no deploy das 27 functions e exige redeploy de todas.

## `setupCoachAndStudent` duplicado nas suítes e2e
**Origem:** encontrado em 2026-10-13, no /simplify da mesma retomada.
**Onde:** `scripts/e2e/suites/notes.mjs` e `scripts/e2e/suites/requests.mjs`
**O que é:** o mesmo helper (cria professor + aluno via edge function + login do aluno) nas duas
suítes, mudando só o prefixo e o `full_name`.
**Esforço:** minutos — mover para `scripts/e2e/lib/clients.mjs` com `(ctx, prefix, fullName)`.

## Telefone do professor (aba Perfil) sem máscara e em outro formato
**Origem:** encontrado em 2026-10-13, ao pôr máscara no telefone da solicitação do aluno.
**Onde:** `app/(coach)/(painel)/perfil.tsx` (campo "Telefone (DDI + DDD + número, só dígitos)")
**O que é:** o campo pede `5511999999999` cru, sem máscara, enquanto o do aluno agora usa
`maskPhoneBR` com `(11) 99999-9999`. Dois formatos pro mesmo dado no app.
**Esforço:** minutos — trocar pelo `maskPhoneBR`. O `whatsappUrl` já põe o 55 em número de
10–11 dígitos, então salvar sem DDI não quebra o botão de WhatsApp do aluno.

## Push de desvínculo conta "dias com o professor" desde a criação da conta
**Origem:** encontrado em 2026-10-13, ao adicionar o aviso de desvínculo.
**Onde:** `supabase/functions/coach-unlink-student/index.ts` (`daysWithCoach`, a partir de `student.created_at`)
**O que é:** quem virou aluno pela contratação tem a conta bem mais antiga que o vínculo, então o
push exagera o tempo de acompanhamento. Agora existe `profiles.coach_linked_at` (o "aluno desde"),
que é a data certa.
**Esforço:** minutos — trocar `created_at` por `coach_linked_at` no select e no cálculo; exige `fn:deploy`.

## Card "Seu professor" fica abaixo do "Sair da conta" no Perfil do aluno
**Origem:** visto em 2026-10-13, na conferência em tela do "Encerrar acompanhamento".
**Onde:** `app/(tabs)/perfil.tsx` (render do `<CoachCard>`, depois do bloco da conta)
**O que é:** o card do professor — e agora o link de encerrar o acompanhamento — é o último item
da tela, abaixo do botão de sair. O dev chegou a achar que "não tinha nada" no Perfil. Professor é
informação de topo pro aluno; o card pertence logo depois do cabeçalho.
**Esforço:** minutos — mover o bloco; conferir em tela.

## RLS do professor depende de `coach_id` copiado, não do vínculo vivo
**Origem:** /simplify de 2026-10-13 (revisor de altitude), depois do bug das revisões de plano.
**Onde:** políticas de `student_plan_revisions` (e provavelmente `coach_notes`)
**O que é:** o acesso do professor vem de um `coach_id` gravado na linha, que o desvínculo precisa
"limpar". Se a limpeza falhar, vaza — foi o que aconteceu até 2026-10-13. Mais robusto: a política
checar o vínculo atual (`exists (select 1 from profiles p where p.id = student_id and p.coach_id = auth.uid())`).
**Esforço:** médio — reescrever as políticas e medir o custo das consultas.

## `daysSince` ainda duplicado no delete-my-account
**Origem:** /simplify de 2026-10-13.
**Onde:** `supabase/functions/delete-my-account/index.ts` (2 cálculos de dias à mão)
**O que é:** `_shared/desvinculo.ts` exporta `daysSince`; o delete-my-account não foi tocado nesta leva.
**Esforço:** minutos + `fn:deploy`.

## `announcement_views` tem policy de leitura que o app não usa
**Origem:** /simplify de 2026-10-13 (avisos remotos).
**Onde:** migration `20261013160000_avisos_remotos.sql` (`announcement_views_select_own`) e as RPCs
`my_pending_announcements`/`mark_announcement_seen` (usam `auth.uid()` em vez de `(select auth.uid())`).
**O que é:** o app só acessa por RPC; a policy é inofensiva mas sobra. Já está em produção — não valeu
uma migration só pra isso. Junta com a próxima migration que tocar essas tabelas.
**Esforço:** minutos.
