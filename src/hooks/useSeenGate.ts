import { useState } from 'react';

/**
 * Aviso de abertura do app (desfecho de solicitação, desvínculo): mostra o
 * item atual e, ao fechar, some na hora e marca como visto. Se marcar falhar,
 * o aviso volta na próxima abertura — melhor repetir do que engolir uma
 * mudança de estado da conta.
 */
export function useSeenGate(currentId: string | null) {
  const [fechado, setFechado] = useState<string | null>(null);

  async function dismiss(markSeen: () => Promise<void>) {
    if (!currentId) return;
    setFechado(currentId);
    try {
      await markSeen();
    } catch {
      // volta na próxima abertura
    }
  }

  return { visible: !!currentId && fechado !== currentId, dismiss };
}
