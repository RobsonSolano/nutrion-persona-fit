/** Limpa input livre/mascarado pro formato armazenado (só dígitos). */
export function parsePhoneInput(masked: string): string {
  return masked.replace(/\D/g, '');
}

/**
 * Formata `5511999999999` → `+55 (11) 99999-9999`. Tolera 10, 11 ou 13
 * dígitos. Fora desses tamanhos retorna a string limpa sem máscara.
 */
export function formatPhoneBR(digits: string): string {
  const cleaned = digits.replace(/\D/g, '');
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(
      4,
      9,
    )}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return cleaned;
}

/**
 * Máscara progressiva pra campo de telefone BR: `(11`, `(11) 9999`,
 * `(11) 99999-9999` (celular) ou `(11) 3333-4444` (fixo). Corta em 11 dígitos
 * (DDD + número) e descarta o DDI 55
 * de número já salvo com ele. O parêntese só fecha quando começa o número —
 * assim apagar o espaço depois do DDD não prende o cursor.
 */
export function maskPhoneBR(input: string): string {
  let d = parsePhoneInput(input);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);

  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;

  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  // Celular começa com 9 (5+4); fixo, com 2–5 (4+4). Decidir pelo primeiro
  // dígito, e não pelo tamanho, evita o hífen pular de lugar no 11º dígito.
  const split = rest.startsWith('9') ? 5 : 4;
  // Hífen só com dígito depois: pendurado, o backspace o apagaria e a
  // máscara o devolveria — o campo travaria ali.
  if (rest.length <= split) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/**
 * wa.me/<digits>. Aceita digits ou número formatado. O wa.me exige o código
 * do país: número BR salvo só com DDD + número (10 ou 11 dígitos) ganha o 55,
 * senão `11...` seria lido como +1.
 */
export function whatsappUrl(input: string): string {
  const digits = parsePhoneInput(input);
  const intl = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${intl}`;
}

/** 10 a 13 dígitos cobrem BR (DDD+número, ou DDI+DDD+número). */
export function isValidPhone(digits: string): boolean {
  return /^[0-9]{10,13}$/.test(parsePhoneInput(digits));
}
