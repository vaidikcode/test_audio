import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabaseConfigured = Boolean(url && anon);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anon)
  : null;

export const BUCKET = "music-samples";

export type DbPrompt = {
  prompt_text: string;
  created_at: string;
};

export type DbProvider = {
  id: string;
  prompt_text: string;
  name: string;
  created_at: string;
};

export type DbAudioSample = {
  id: string;
  provider_id: string;
  label: string;
  storage_path: string;
  created_at: string;
};
