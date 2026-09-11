import { redirect } from "next/navigation";
import type { Route } from "next";

import { requireAdmin } from "@/lib/supabase/server";
import LoginForm from "@/app/admin/login/LoginForm";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const auth = await requireAdmin();
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/admin";
  if (auth.ok) redirect(nextPath as Route);

  return (
    <main className="shell" style={{ maxWidth: 560 }}>
      <p className="eyebrow">Nomadeezee Map Platform</p>
      <h1>Admin sign in</h1>
      <p className="muted">Sign in with a Supabase account that has the server-managed admin role.</p>
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
