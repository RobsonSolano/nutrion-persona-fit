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
