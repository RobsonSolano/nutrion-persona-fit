/**
 * Identificador local, gerado no cliente.
 *
 * Serve a dois usos que precisam da mesma garantia: a `localId` dos rascunhos
 * do editor (key do React e chave do mapa de refs) e a `pair_key` das séries
 * conjuntas, que precisa marcar as duas linhas irmãs no MESMO insert em lote —
 * o banco não pode gerar.
 *
 * Não usa `crypto.randomUUID` nem `expo-crypto`: não há lib de uuid no projeto
 * e o módulo nativo obrigaria a gerar APK novo (ver src/services/exercises.ts).
 *
 * O contador é o que garante unicidade de verdade. Só `Date.now()` + random não
 * basta: o editor gera uma id por exercício dentro de um único `map`, todas no
 * mesmo milissegundo, e aí a única defesa seriam ~31 bits de aleatório.
 */
let contador = 0;

export function novoIdLocal(): string {
  contador += 1;
  return `${Date.now()}-${contador}-${Math.random().toString(36).slice(2, 8)}`;
}
