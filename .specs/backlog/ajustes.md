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
