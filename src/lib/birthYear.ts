// Validação do ano de nascimento — fonte única (cliente + edge function espelham).
// Espelha o CHECK do banco: profiles.birth_year >= 1900 AND <= ano atual.
// O campo é opcional; quando preenchido, precisa ser um ANO completo (ex: 1999),
// não a idade — foi exatamente o erro que gerava 500 (idade "46" no campo de ano).

export const MIN_BIRTH_YEAR = 1900;

export function isValidBirthYear(year: number, currentYear: number): boolean {
  return (
    Number.isInteger(year) && year >= MIN_BIRTH_YEAR && year <= currentYear
  );
}
