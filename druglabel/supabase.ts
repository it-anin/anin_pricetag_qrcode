import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseLabelError =
  !url || !key
    ? 'Missing Supabase env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
    : null;

// Read client — uses public views (dl_settings, dl_medicines, dl_medicine_translations)
export const supabaseLabel = url && key ? supabase : null;

// Write client — uses label schema directly for INSERT/UPSERT
export const supabaseLabelWrite = url && key
  ? createClient(url, key, {
      db: { schema: 'label' },
      auth: { persistSession: false },
    })
  : null;

// Table names for read operations (public views)
export const TBL_SETTINGS     = 'dl_settings';
export const TBL_MEDICINES    = 'dl_medicines';
export const TBL_TRANSLATIONS = 'dl_medicine_translations';
