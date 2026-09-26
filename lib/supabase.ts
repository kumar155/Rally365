import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Keep static Next.js builds from failing during module evaluation when
// environment variables are not injected into the build process. Production
// requests still require the real Supabase environment variables to be set.
const supabaseUrl = url || "https://placeholder.supabase.co";
const supabaseKey = key || "placeholder-publishable-key";

export const supabase = createClient(supabaseUrl, supabaseKey);
