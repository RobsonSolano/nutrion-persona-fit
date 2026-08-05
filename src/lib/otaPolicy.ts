// Política de UX do OTA (expo-updates). Lógica pura → testável sem RN/SDK.
//
// O binário na loja fica cronicamente ATRÁS do topo do canal OTA (a gente publica
// updates por cima do mesmo runtimeVersion). Então TODA instalação nova detecta um
// update disponível já no 1º launch. Empurrar o modal "Atualizar agora" pra quem
// acabou de instalar dá impressão de app bugado ("atualizar o quê? acabei de
// instalar!"). Regra: na primeira execução não interrompemos — o expo aplica o
// update baixado sozinho no próximo cold start. O modal só faz sentido depois,
// quando o usuário já tem uma versão rodando e um OTA novo chega no meio do uso.

export function shouldPromptForUpdate({
  isFirstLaunch,
}: {
  isFirstLaunch: boolean;
}): boolean {
  return !isFirstLaunch;
}
