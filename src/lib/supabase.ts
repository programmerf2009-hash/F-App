/* ==========================================================================
   Supabase client
   --------------------------------------------------------------------------
   URL va anon (publishable) kalit build vaqtida VITE_* o'zgaruvchilaridan
   olinadi. Anon kalit ommaviy bo'lishi mumkin — himoya RLS'da.
   ========================================================================== */

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  key || "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "fapp-auth",
    },
  },
);
