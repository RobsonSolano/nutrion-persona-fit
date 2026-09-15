// NutriOn — transforma o JSON revisado de descrições em migration de seed (DESC-03)
//
// Uso:
//   node scripts/gerar-seed-descricoes.mjs
// ou:
//   npm run gerar:seed-descricoes
//
// Lê scripts/data/descricoes-exercicios.json (já revisado pelo dev) e escreve
// supabase/migrations/20260915010000_descricoes_exercicios.sql.
//
// O seed casa por (group_id, name) — a unique que o catálogo já tem desde
// 20260420120000. Id de banco não serve: o JSON precisa sobreviver a reseed.
//
// Idempotente por construção: só preenche onde `description is null`, então
// rodar a migration de novo não sobrescreve texto ajustado à mão no banco.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRADA = resolve(RAIZ, 'scripts/data/descricoes-exercicios.json');
const SAIDA = resolve(
  RAIZ,
  'supabase/migrations/20260915010000_descricoes_exercicios.sql',
);
/** Igual ao check da coluna em 20260915000000. */
const MAX_CARACTERES = 400;

const dados = JSON.parse(await readFile(ENTRADA, 'utf8'));
const entradas = Object.values(dados).filter((e) => e.descricao && e.grupo);

const longas = entradas.filter((e) => e.descricao.length > MAX_CARACTERES);
if (longas.length > 0) {
  console.error(
    `❌ ${longas.length} descrição(ões) passam de ${MAX_CARACTERES} caracteres e o check do banco recusaria:`,
  );
  for (const e of longas.slice(0, 5)) {
    console.error(`   - ${e.nome} (${e.descricao.length})`);
  }
  process.exit(1);
}

const linhas = entradas
  .map(
    (e) =>
      `  (${sql(e.grupo)}, ${sql(e.nome)}, ${sql(e.descricao)})`,
  )
  .join(',\n');

const conteudo = `-- =====================================================================
-- NutriOn — Descrições breves do catálogo de exercícios (spec DESC-03)
--
-- Gerado por scripts/gerar-seed-descricoes.mjs a partir de
-- scripts/data/descricoes-exercicios.json, revisado antes de virar migration.
-- Para regerar: ajuste o JSON e rode \`npm run gerar:seed-descricoes\`.
--
-- Casa por (grupo, nome) — a unique do catálogo desde 20260420120000. Id de
-- banco não serviria: o JSON precisa sobreviver a um reseed do catálogo.
--
-- IDEMPOTENTE: só preenche onde description is null. Rodar de novo não
-- sobrescreve texto que tenha sido ajustado à mão no banco.
--
-- Total: ${entradas.length} exercícios.
-- =====================================================================

with novas(grupo_slug, exercicio_nome, descricao) as (
  values
${linhas}
)
update public.exercises e
   set description = n.descricao
  from novas n
  join public.exercise_groups g on g.slug = n.grupo_slug
 where e.group_id = g.id
   and e.name = n.exercicio_nome
   and e.description is null;
`;

await writeFile(SAIDA, conteudo, 'utf8');
console.log(`✅ ${entradas.length} descrições → ${SAIDA}`);

/** Literal SQL com aspas simples escapadas. */
function sql(valor) {
  return `'${String(valor).replace(/'/g, "''")}'`;
}
