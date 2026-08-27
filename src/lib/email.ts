// Validação de formato de e-mail — fonte única de verdade, usada no cliente
// (formulários) e no auth.ts (normalizeEmail). Regex proposital simples: exige
// parte local, @, e domínio com pelo menos um ponto (TLD). NÃO valida se o TLD
// existe de verdade — "nome@gmail.coms" é bem formado e passa; typos de TLD são
// tratados na UX (mostrar o e-mail digitado), não aqui.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim());
}
