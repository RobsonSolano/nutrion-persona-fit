# Avisos remotos + atualização pela loja — Especificação

## Problema

O app não tem como falar com o usuário fora do popup genérico do OTA: não dá pra mandar um
comunicado avulso nem mirar um público. E quando sai um `.aab` novo, quem fica no binário antigo
para de receber OTA e nunca é avisado de que precisa atualizar na loja.

## Objetivos

- [ ] Publicar um aviso (título + texto) pra todos ou por perfil, editando uma tabela no Supabase,
      sem build nem OTA.
- [ ] Fazer quem está abaixo de uma versão ir pra Play Store: com opção de adiar (recomendada) ou
      sem (mínima).

## Fora do Escopo

| Item | Motivo |
|---|---|
| Tela de admin pra criar avisos | Decisão do dev: gestão direto no Supabase por enquanto. |
| Mirar usuários específicos (lista) | Decisão do dev: só todos ou por perfil. |
| Play In-App Updates (prompt nativo) | Item #3 — exige `.aab`. |
| iOS / App Store | O app não tem build iOS. |
| Imagem, vídeo ou formatação rica no aviso | Texto simples resolve os casos atuais. |
| Push junto do aviso | O canal aqui é o app aberto; push já tem infra própria. |

---

## Glossário

| Termo | Definição canônica | Fonte |
|---|---|---|
| Aviso | Mensagem remota (título + texto, botão opcional) mostrada na abertura do app, uma vez por usuário. | decisão do dev |
| Público | Quem recebe o aviso: `todos`, `comum`, `aluno` ou `professor`. | decisão do dev |
| Versão instalada | A versão do binário (runtime) no aparelho — não a do OTA. | técnica |
| Versão mínima | Abaixo dela, o app bloqueia até atualizar na loja. | decisão do dev |
| Versão recomendada | Abaixo dela, o app sugere atualizar, com "Depois". | decisão do dev |
| popup / banner | NÃO usar — usar **aviso** (comunicado) ou **atualização** (versão). | esta spec |

---

## User Stories

### P1: Atualização pela loja ⭐ MVP

**User Story**: Como dono do app, quero definir uma versão mínima e uma recomendada para que quem
ficou num binário antigo seja levado à Play Store.

**Por que P1**: Precisa estar no ar antes do próximo `.aab`; sem isso, quem não atualiza sozinho
fica congelado sem saber.

**Critérios de Aceite**:

1. **[ATU]-01** — QUANDO a versão instalada é menor que a **mínima** ENTÃO o app DEVE mostrar uma
   tela de atualização que não fecha, com o botão "Atualizar agora" que abre a Play Store.
2. **[ATU]-02** — QUANDO a versão instalada é igual ou maior que a mínima e menor que a
   **recomendada** ENTÃO o app DEVE mostrar o aviso de atualização com "Atualizar" e "Depois".
3. **[ATU]-03** — QUANDO o usuário toca "Depois" ENTÃO o aviso DEVE sumir até a próxima abertura
   do app.
4. **[ATU]-04** — QUANDO a versão instalada é igual ou maior que a recomendada, ou as versões não
   estão configuradas ENTÃO nada DEVE aparecer.
5. **[ATU]-05** — A checagem DEVE funcionar também na tela de login (deslogado).
6. **[ATU]-06** — QUANDO a configuração não carrega (sem rede, erro) ENTÃO o app DEVE seguir
   normalmente, sem bloquear.
7. **[ATU]-07** — A comparação de versões DEVE ser numérica por partes (`1.10.0` > `1.9.0`) e
   tolerar sufixos e partes faltando (`1.5` = `1.5.0`).
8. **[ATU]-08** — O texto do aviso de atualização e o link da loja DEVEM vir da configuração
   remota, com padrões quando vazios.

### P1: Aviso remoto por público ⭐ MVP

**User Story**: Como dono do app, quero publicar um aviso inserindo uma linha no Supabase para
falar com todos os usuários ou só com um perfil, sem build nem OTA.

**Critérios de Aceite**:

1. **[AVI]-01** — QUANDO existe um aviso ativo, dentro do período (`starts_at`/`ends_at`) e do
   público do usuário ENTÃO o app DEVE mostrá-lo na abertura, depois do login.
2. **[AVI]-02** — QUANDO o usuário fecha o aviso ENTÃO ele NÃO DEVE aparecer de novo pra esse
   usuário, em nenhum aparelho.
3. **[AVI]-03** — QUANDO o aviso é de outro público, está desativado, ainda não começou ou já
   terminou ENTÃO NÃO DEVE aparecer.
4. **[AVI]-04** — QUANDO há mais de um aviso pendente ENTÃO o app DEVE mostrar um por vez, do mais
   antigo pro mais novo.
5. **[AVI]-05** — QUANDO o aviso tem botão (`cta_label` + `cta_url`) ENTÃO o botão DEVE abrir o
   link (rota do app ou URL externa) e marcar o aviso como visto.
6. **[AVI]-06** — Um usuário NÃO DEVE conseguir criar, editar nem ver avisos de outro público, nem
   marcar como visto em nome de outro usuário.

### P2: Um modal por vez na abertura

1. **[MOD]-01** — QUANDO há bloqueio de versão ENTÃO nenhum outro aviso DEVE aparecer por cima.
2. **[MOD]-02** — QUANDO há aviso de vínculo (contratação/desvínculo) pendente ENTÃO o aviso remoto
   DEVE esperar ele ser fechado.

---

## Casos-limite

- Versão instalada indisponível (dev/Expo Go) → usa a do `app.config`; se ainda assim vier vazia,
  não bloqueia.
- Versão mínima maior que a recomendada (erro de digitação) → vale a mínima (bloqueia).
- Aviso sem `ends_at` → fica no ar até ser desativado.
- Usuário deslogado → só a checagem de versão roda.

## Rastreabilidade

| ID | Teste |
|---|---|
| [ATU]-01..04, -07 | unitário (`src/lib/appVersion.test.ts`) |
| [ATU]-05, -06, -08 | conferência em tela + revisão |
| [AVI]-01..04, -06 | SQL (`supabase/tests/announcements.test.sql`) + e2e |
| [AVI]-05, [MOD]-01..02 | conferência em tela |
