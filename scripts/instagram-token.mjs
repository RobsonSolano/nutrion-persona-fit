// Persona Fit — troca o token curto do Explorador da Graph API pelo token de
// Página (sem expiração) e grava no .env.local. Guia: docs/instagram-automacao.md
//
// Uso (depois de colar META_APP_ID, META_APP_SECRET e INSTAGRAM_SHORT_TOKEN no .env.local):
//   node --env-file=.env.local scripts/instagram-token.mjs <usuario_do_instagram>
//
// O que faz:
//   1. token curto (1h) → token de usuário longo (60 dias)
//   2. lista as Páginas e acha a que está ligada ao @usuario
//   3. pega o token dessa Página: derivado do token longo, ele NÃO expira
//   4. confere validade e escopos, lê o perfil (não publica nada)
//   5. grava INSTAGRAM_USER_ID, FACEBOOK_PAGE_ID e INSTAGRAM_ACCESS_TOKEN no
//      .env.local e apaga o INSTAGRAM_SHORT_TOKEN
// Nunca imprime token.

import { readFileSync, writeFileSync } from 'node:fs';

const username = process.argv[2];
if (!username) {
  console.error('Uso: node --env-file=.env.local scripts/instagram-token.mjs <usuario_do_instagram>');
  process.exit(1);
}
const G = 'https://graph.facebook.com/v27.0';
const { META_APP_ID: appId, META_APP_SECRET: secret, INSTAGRAM_SHORT_TOKEN: short } = process.env;
const missing = Object.entries({ META_APP_ID: appId, META_APP_SECRET: secret, INSTAGRAM_SHORT_TOKEN: short })
  .filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`❌ Faltam no .env.local: ${missing.join(', ')}`);
  process.exit(1);
}
const get = async (url) => {
  const j = await (await fetch(url)).json();
  if (j.error) throw new Error(`${j.error.code ?? ''} ${j.error.message}`);
  return j;
};

const long = await get(`${G}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${encodeURIComponent(short)}`);
console.log(`1. token de usuário longo: ok (${Math.round((long.expires_in ?? 0) / 86400)} dias)`);

const pages = await get(`${G}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${long.access_token}`);
const page = pages.data.find((p) => p.instagram_business_account?.username === username);
if (!page) {
  console.error(`❌ Nenhuma Página ligada ao @${username}. Páginas visíveis: ${pages.data.map((p) => p.name).join(', ') || 'nenhuma'}`);
  process.exit(1);
}
console.log(`2. Página: ${page.name}`);

const dbg = await get(`${G}/debug_token?input_token=${page.access_token}&access_token=${appId}|${secret}`);
const exp = dbg.data.expires_at === 0 ? 'nunca' : new Date(dbg.data.expires_at * 1000).toISOString();
console.log(`3. token da Página: ${dbg.data.is_valid ? 'válido' : 'INVÁLIDO'} · expira: ${exp} · escopos: ${(dbg.data.scopes ?? []).join(', ')}`);

const ig = page.instagram_business_account.id;
const me = await get(`${G}/${ig}?fields=username,followers_count,media_count&access_token=${page.access_token}`);
console.log(`4. perfil: @${me.username} · ${me.followers_count} seguidores · ${me.media_count} posts`);

const lines = readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => !/^(INSTAGRAM_SHORT_TOKEN|INSTAGRAM_ACCESS_TOKEN|INSTAGRAM_USER_ID|FACEBOOK_PAGE_ID)=/.test(l));
while (lines.length && lines[lines.length - 1] === '') lines.pop();
lines.push(`INSTAGRAM_USER_ID=${ig}`, `FACEBOOK_PAGE_ID=${page.id}`, `INSTAGRAM_ACCESS_TOKEN="${page.access_token}"`, '');
writeFileSync('.env.local', lines.join('\n'));
console.log('5. .env.local atualizado (token curto removido)');
