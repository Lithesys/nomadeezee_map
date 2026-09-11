import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = serverEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = serverEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !key) return null;

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components cannot always mutate cookies. Route handlers can.
        }
      },
    },
  });
}

export function createSupabaseServiceClient(): SupabaseClient | null {
  const url = serverEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = serverEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false as const, reason: "Supabase is not configured" };

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false as const, reason: "Authentication required" };

  // Authorization comes from app_metadata or a server-side role table, never user_metadata.
  const appMetadata = data.user.app_metadata as { role?: string; roles?: string[] } | undefined;
  const isAdmin = appMetadata?.role === "admin" || appMetadata?.roles?.includes("admin") === true;
  if (!isAdmin) return { ok: false as const, reason: "Admin role required" };

  return { ok: true as const, user: data.user, supabase };
}
