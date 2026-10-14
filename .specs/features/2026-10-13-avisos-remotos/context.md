# Avisos remotos + atualização pela loja — contexto e decisões

Item #2 da ordem combinada em 2026-10-13 (BACKLOG: "Avisos/popups remotos + atualização
obrigatória com link pra loja", 2026-09-04).

## Por que agora

- O único popup do app é o do OTA, igual pra todos. Não dá pra mirar público nem mandar
  comunicado avulso (manutenção, novidade só pra professor).
- Quando um `.aab` novo sobe a versão, o binário antigo para de receber OTA (runtime =
  appVersion) e ninguém avisa o usuário. Aconteceu na 1.4.0.
- **Prazo:** o popup de versão só alcança quem recebe OTA. Tem que estar no ar ANTES do próximo
  `.aab` (item #3). Publicado agora na runtime 1.4.0, quando a 1.5.0 sair quem ficar na 1.4.0 vê o
  aviso de atualizar na loja.

## Decisões do dev (2026-10-13)

| Tema | Decisão |
|---|---|
| Público do aviso | Todos **ou** por perfil (comum, aluno, professor). Sem lista de usuários. |
| Atualização | Configurável: abaixo da versão **recomendada** → popup com "Depois"; abaixo da **mínima** → bloqueia até atualizar. |
| Gestão | Direto no Supabase (Table Editor). Sem tela de admin agora. |
| Frequência do aviso | Uma vez por usuário (registro no servidor), dentro do período do aviso. |

## Decisões técnicas (agente)

- **Versão instalada sem módulo nativo novo:** `Updates.runtimeVersion` (definido no binário;
  política runtime = appVersion). Fallback `Constants.expoConfig.version` em dev, onde o
  expo-updates fica desligado. Comparação de versão é lógica pura testada.
- **Só Android:** não existe config de iOS no `app.config.ts`. O link da loja fica no banco
  (`app_config.android_store_url`), com o da Play como padrão.
- **Atualização vale até deslogado:** a checagem de versão roda na raiz do app, antes do login.
  Aviso comum precisa do perfil (público por role), então só depois do login.
- **Um modal por vez:** bloqueio de versão > avisos de vínculo (contratação/desvínculo) > aviso
  comum. Evita empilhar modais na abertura.
