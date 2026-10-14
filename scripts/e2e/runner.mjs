// Entry-point dos testes e2e. Cada suite é importada e registra-se
// via `suite(...)`. Roda tudo na ordem em que os imports acontecem.
//
// Uso:
//   npm run test:e2e                  # roda tudo
//   npm run test:e2e -- --filter auth # filtra por nome da suite

import { runAll } from './lib/runner.mjs';

// As suites se auto-registram no import.
await import('./suites/auth.mjs');
await import('./suites/logs.mjs');
await import('./suites/routines.mjs');
await import('./suites/coach.mjs');
await import('./suites/requests.mjs');
await import('./suites/enrollment.mjs');
await import('./suites/notes.mjs');
await import('./suites/data-export.mjs');
await import('./suites/announcements.mjs');

const filterIdx = process.argv.indexOf('--filter');
const filter = filterIdx > 0 ? process.argv[filterIdx + 1] : undefined;

const { fail } = await runAll({ filter });
process.exit(fail > 0 ? 1 : 0);
