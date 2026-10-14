// Motivo que o aluno escreve ao encerrar o acompanhamento ([TRAN]-10).
// Espelha a validação da edge function student-leave-coach — o servidor é
// quem decide; aqui é só pra habilitar o botão sem ida e volta.

export const LEAVE_REASON_MIN = 10;
export const LEAVE_REASON_MAX = 500;

export function leaveReasonOk(reason: string): boolean {
  const len = reason.trim().length;
  return len >= LEAVE_REASON_MIN && len <= LEAVE_REASON_MAX;
}
