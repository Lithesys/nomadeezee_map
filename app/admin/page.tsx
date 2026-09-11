import { redirect } from "next/navigation";
import type { Route } from "next";

import { requireAdmin } from "@/lib/supabase/server";
import MapEditor from "@/components/admin/MapEditor";

export default async function AdminPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login?next=%2Fadmin" as Route);

  return (
    <main className="admin-shell">
      <MapEditor />
    </main>
  );
}
