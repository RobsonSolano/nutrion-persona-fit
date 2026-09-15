// NutriOn — geração das descrições breves do catálogo de exercícios (DESC-02)
//
// Uso:
//   node --env-file=.env.local scripts/gerar-descricoes-exercicios.mjs
// ou:
//   npm run gerar:descricoes
//
// Escreve em scripts/data/descricoes-exercicios.json, NUNCA no banco. O JSON é
// versionado de propósito: a revisão do dev precisa ser diffável, e só depois
// dela o conteúdo vira migration de seed.
//
// É idempotente. Pula todo exercício que já tem descrição — seja na coluna
// `description` do banco, seja no JSON gerado numa rodada anterior. Rodar de
// novo não gasta cota nem sobrescreve texto já revisado. Pra forçar a
// regeração de um exercício, apague a entrada dele do JSON.

import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Mesmo default do DEFAULT_TEXT_MODEL em supabase/functions/_shared/groqRetry.ts.
// `llama-3.3-70b-versatile` foi descontinuado pela Groq e responde 404.
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Lotes pequenos: o modelo perde item em lista longa (lição do sanity check,
 *  ver STATE.md 2026-09-02) e um lote que falha custa pouco pra refazer. */
const TAMANHO_LOTE = 8;
/** Espaçamento entre lotes pra caber nos 8000 tokens/minuto do tier gratuito. */
const PAUSA_ENTRE_LOTES_MS = 9000;
/** O check do banco corta em 400. Pedimos menos pra sobrar folga. */
const MAX_CARACTERES = 320;

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = resolve(RAIZ, 'scripts/data/descricoes-exercicios.json');

if (!SUPABASE_URL || !ANON_KEY) {
  console.error(
    '❌ Faltam EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no env.',
  );
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.error('❌ Falta GROQ_API_KEY no env.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const gruposRes = await supabase
  .from('exercise_groups')
  .select('id, slug, name');

if (gruposRes.error) {
  console.error('❌ Erro lendo exercise_groups:', gruposRes.error.message);
  process.exit(1);
}

// A coluna `description` pode ainda não existir no banco remoto: o script roda
// na branch antes do db:push. Sem ela, o pulo do que já está descrito vem só do
// JSON local — que é o caso normal na primeira geração, já que a coluna nasce
// vazia de qualquer jeito.
const exerciciosRes = await lerExercicios();

async function lerExercicios() {
  const comDescricao = await supabase
    .from('exercises')
    .select('id, name, equipment, group_id, description')
    .order('name', { ascending: true });

  if (!comDescricao.error) return comDescricao;

  if (!/column .*description.* does not exist/i.test(comDescricao.error.message)) {
    console.error('❌ Erro lendo exercises:', comDescricao.error.message);
    process.exit(1);
  }

  console.warn(
    '⚠️  A coluna exercises.description ainda não existe no banco remoto ' +
      '(migration não aplicada). Seguindo só com o JSON local como controle.',
  );
  const semDescricao = await supabase
    .from('exercises')
    .select('id, name, equipment, group_id')
    .order('name', { ascending: true });

  if (semDescricao.error) {
    console.error('❌ Erro lendo exercises:', semDescricao.error.message);
    process.exit(1);
  }
  return {
    data: semDescricao.data.map((ex) => ({ ...ex, description: null })),
    error: null,
  };
}

const grupoPorId = new Map(gruposRes.data.map((g) => [g.id, g]));

/** Chave estável do exercício: o seed casa por (grupo, nome), que é a unique
 *  do catálogo. Id de banco não serve — o JSON precisa sobreviver a reseed. */
const chaveDe = (ex) =>
  `${grupoPorId.get(ex.group_id)?.slug ?? 'sem-grupo'}::${ex.name.trim().toLowerCase()}`;

const jaGeradas = await lerSaidaAnterior();

const pendentes = exerciciosRes.data.filter(
  (ex) => !ex.description && !jaGeradas[chaveDe(ex)],
);

console.log(
  `Catálogo: ${exerciciosRes.data.length} exercícios · ` +
    `já descritos: ${exerciciosRes.data.length - pendentes.length} · ` +
    `a gerar: ${pendentes.length}`,
);

if (pendentes.length === 0) {
  console.log('✅ Nada a fazer.');
  process.exit(0);
}

const resultado = { ...jaGeradas };
let gerados = 0;
let falhas = 0;

for (let i = 0; i < pendentes.length; i += TAMANHO_LOTE) {
  const lote = pendentes.slice(i, i + TAMANHO_LOTE);
  const numeroLote = Math.floor(i / TAMANHO_LOTE) + 1;
  const totalLotes = Math.ceil(pendentes.length / TAMANHO_LOTE);

  try {
    const descricoes = await descreverLote(lote);
    for (const ex of lote) {
      const texto = descricoes[ex.name];
      if (!texto) {
        console.warn(`  ⚠️  sem retorno para "${ex.name}"`);
        falhas += 1;
        continue;
      }
      resultado[chaveDe(ex)] = {
        grupo: grupoPorId.get(ex.group_id)?.slug ?? null,
        nome: ex.name,
        equipamento: ex.equipment,
        descricao: texto,
      };
      gerados += 1;
    }
    console.log(`Lote ${numeroLote}/${totalLotes} ✓ (${gerados} gerados)`);
  } catch (err) {
    falhas += lote.length;
    console.error(`Lote ${numeroLote}/${totalLotes} ✗ — ${err.message}`);
  }

  // Salva a cada lote: se a cota estourar no meio, o que já veio não se perde
  // e a próxima rodada continua de onde parou.
  await salvar(resultado);

  // Ritmo em vez de rajada. O tier gratuito dá 8000 tokens/minuto e um lote
  // consome perto de 1100, então ~7 lotes por minuto é o teto. Disparar sem
  // pausa só gera 429 em série e cada retry custa até 70s — na prática fica
  // MAIS lento do que esperar de propósito entre os lotes.
  if (i + TAMANHO_LOTE < pendentes.length) {
    await dormir(PAUSA_ENTRE_LOTES_MS);
  }
}

console.log(
  `\n✅ ${gerados} descrições geradas, ${falhas} falhas.\n   ${SAIDA}\n` +
    '\nRevise o JSON e depois gere a migration de seed.',
);

// ---------------------------------------------------------------------

async function lerSaidaAnterior() {
  try {
    return JSON.parse(await readFile(SAIDA, 'utf8'));
  } catch {
    return {};
  }
}

async function salvar(dados) {
  await mkdir(dirname(SAIDA), { recursive: true });
  // Chaves ordenadas pro diff da revisão não embaralhar entre rodadas.
  const ordenado = Object.fromEntries(
    Object.keys(dados)
      .sort()
      .map((k) => [k, dados[k]]),
  );
  await writeFile(SAIDA, `${JSON.stringify(ordenado, null, 2)}\n`, 'utf8');
}

// `function` e não `const`: o loop principal é top-level e roda ANTES desta
// linha, então um const cairia na temporal dead zone.
function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * O tier gratuito da Groq dá 8000 tokens por minuto, e um lote consome perto de
 * mil. Sem respeitar isso o script queima 60 dos 66 lotes em 429 — foi o que
 * aconteceu na primeira execução. Em 429 esperamos o `retry-after` que a
 * própria API manda (com teto de segurança) em vez de chutar o intervalo.
 */
async function chamarGroq(prompt, tentativa = 1) {
  const MAX_TENTATIVAS = 6;

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429 && tentativa <= MAX_TENTATIVAS) {
    const cabecalho = Number(res.headers.get('retry-after'));
    const esperaSeg = Math.min(
      Number.isFinite(cabecalho) && cabecalho > 0 ? cabecalho + 1 : 2 ** tentativa,
      70,
    );
    console.log(`  ⏳ rate limit — aguardando ${esperaSeg}s`);
    await dormir(esperaSeg * 1000);
    return chamarGroq(prompt, tentativa + 1);
  }

  if (!res.ok) {
    throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  return res.json();
}

async function descreverLote(lote) {
  // Numerado, e a resposta vem indexada pelo número. Casar pelo NOME não
  // funciona: o modelo reescreve o nome (tira parêntese, troca acento, encurta)
  // e o lote inteiro volta sem match — aconteceu em vários lotes na primeira
  // execução. O índice ele respeita.
  const lista = lote
    .map(
      (ex, i) =>
        `${i + 1}. ${ex.name}${ex.equipment ? ` (equipamento: ${ex.equipment})` : ''}` +
        ` [grupo: ${grupoPorId.get(ex.group_id)?.name ?? 'não informado'}]`,
    )
    .join('\n');

  const prompt = `Você é educador físico. Para CADA exercício da lista, escreva uma descrição curta em português do Brasil.

Regras:
- 2 a 3 frases, no máximo ${MAX_CARACTERES} caracteres.
- Primeira parte: como executar o movimento (posição e trajetória).
- Segunda parte: o erro mais comum que as pessoas cometem nesse exercício.
- Linguagem direta, para o aluno ler no celular antes da série.
- Não invente variação que não está no nome. Não cite marca de aparelho.
- Não use markdown, emoji, nem numeração.

Exercícios:
${lista}

Responda SOMENTE um objeto JSON no formato {"1": "descrição", "2": "descrição"}, com uma chave por exercício, usando o NÚMERO da lista como chave. Não repita o nome do exercício na resposta.`;

  const json = await chamarGroq(prompt);
  const conteudo = json.choices?.[0]?.message?.content;
  if (!conteudo) throw new Error('resposta sem conteúdo');

  const bruto = JSON.parse(conteudo);
  const saida = {};
  for (const [chave, texto] of Object.entries(bruto)) {
    if (typeof texto !== 'string') continue;
    const posicao = Number(chave.trim()) - 1;
    const ex = lote[posicao];
    if (!ex) continue;
    const limpo = texto.replace(/\s+/g, ' ').trim();
    if (!limpo) continue;
    saida[ex.name] = limpo.slice(0, MAX_CARACTERES);
  }
  return saida;
}
