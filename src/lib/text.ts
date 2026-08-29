/**
 * Chave de comparação: sem acento, sem caixa, espaços colapsados.
 * "Supino  RÉTO " e "supino reto" são a mesma coisa; "sao paulo" acha
 * "São Paulo".
 *
 * Vive aqui porque o dedup de exercício e a busca de município precisam
 * exatamente da mesma normalização — dois `fold` locais divergiriam.
 */
export function foldText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
