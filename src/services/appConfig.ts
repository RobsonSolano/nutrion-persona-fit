import { supabase } from './supabase';

/** Linha única de app_config — versões e texto da atualização pela loja. */
export type AppConfig = {
  min_version: string | null;
  recommended_version: string | null;
  update_title: string | null;
  update_message: string | null;
  android_store_url: string | null;
};

export async function getAppConfig(): Promise<AppConfig | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('min_version, recommended_version, update_title, update_message, android_store_url')
    .maybeSingle();
  if (error) throw error;
  return data;
}
