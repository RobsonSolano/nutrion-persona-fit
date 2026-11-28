# Usuários de teste

Contas fixas para testar o app, tirar prints e validar fluxos. Existem no Supabase
do projeto (`lqmxsp…`), que é o mesmo banco usado pelo app publicado. Por isso:
nunca use essas contas para nada além de teste e nunca troque a senha delas.

**Senha de todas:** `123456789`

| Perfil | E-mail | Papel (`profiles.role`) | Observação |
|---|---|---|---|
| Professor | `coach@nutrion.test` | `professor` | Tem linha em `coaches` (CREF 045821-G/SP) e alunos vinculados |
| Aluno | `aluno1@nutrion.test` | `aluno` | Vinculado ao `coach@`; histórico completo (ver abaixo) |
| Usuário comum | `comum@nutrion.test` | `comum` | Sem professor; tem 1 rotina |
| Aluno 2 | `aluno2@nutrion.test` | `comum` | Hoje está como comum (foi desvinculado em teste anterior) |
| Primeiro acesso | `novo@nutrion.test` | `comum` | Nunca concluiu o onboarding: o login cai nas telas de boas-vindas. Criada à mão em 26/11/2026, não está no seeder |

Todas já passaram do onboarding (`onboarding_completed_at` preenchido), então o
login cai direto nas abas.

## Como recriar ou reparar

```bash
npm run seed:test-users
```

O script (`scripts/seed-test-users.mjs`) é idempotente: se a conta existe, ele
redefine a senha, o papel e o vínculo com o professor. Ele **não** cria histórico
(refeições, água, treinos feitos), só as contas.

## Histórico do aluno (para prints e demos)

```bash
npm run seed:aluno-historico
```

O script (`scripts/seed-historico-aluno.mjs`) apaga e recria o histórico do
`aluno1@`: perfil físico, 4 rotinas (Treino A a D), 21 dias de refeições e
água, treinos com progressão de carga, anotações de evolução e 2 avaliações
físicas feitas pelo `coach@`. As datas são relativas a hoje, então rode de
novo antes de tirar prints para o painel mostrar o dia atual. Ele recusa
qualquer e-mail que não seja `@nutrion.test`.

## Usuário avulso com histórico

Para um usuário com histórico completo de refeições, água e treinos, existe o
`npm run seed:user` (`scripts/seed-user.mjs`), que cria o Gabriel Silva
(`gabriel.silva@gmail.com`, mesma senha).
