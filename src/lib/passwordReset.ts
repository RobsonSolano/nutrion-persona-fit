// Validação pura do formulário de recuperação de senha (código OTP + nova senha).
// Sem RN/SDK → testável. O fluxo mobile é por OTP: o usuário recebe um código de 6
// dígitos por e-mail (verifyOtp type 'recovery') e define a nova senha no app.

export function isResetFormValid(params: {
  token: string;
  password: string;
  confirm: string;
}): boolean {
  const { token, password, confirm } = params;
  return (
    token.trim().length >= 6 && password.length >= 8 && password === confirm
  );
}
