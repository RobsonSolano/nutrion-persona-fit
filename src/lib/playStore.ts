// Endereços da Play Store do app — um lugar só (o package vem do app.config).

const PACKAGE = 'br.com.nutrion';

/** Página do app no app da Play (falha sem o app da Play instalado). */
export const PLAY_APP_URL = `market://details?id=${PACKAGE}`;
/** Página do app na web — fallback do PLAY_APP_URL. */
export const PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${PACKAGE}`;
/** Gerenciar assinaturas do app na Play. */
export const PLAY_SUBSCRIPTIONS_URL = `https://play.google.com/store/account/subscriptions?package=${PACKAGE}`;
