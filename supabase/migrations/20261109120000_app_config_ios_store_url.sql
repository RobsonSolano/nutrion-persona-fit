-- Endereço do app na App Store, usado pelo aviso de atualização no iOS ([IOS]-09).
-- Idempotente. Preencher depois que o app estiver publicado na loja.
alter table public.app_config add column if not exists ios_store_url text;

comment on column public.app_config.ios_store_url is
  'URL da página do app na App Store (aviso de atualização no iOS). Preencher depois da publicação; vazio usa a App Store genérica.';
