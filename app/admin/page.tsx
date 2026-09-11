import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { requireAdmin } from "@/lib/supabase/server";

export default async function AdminPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login?next=%2Fadmin" as Route);

  return (
    <main className="shell">
      <p className="eyebrow">Admin workspace</p>
      <h1>Geographic releases</h1>
      <p className="muted">
        This foundation exposes the authenticated feature and release APIs. Add the interactive
        geometry canvas here once the first PostGIS dataset has been imported.
      </p>
      <section className="card" style={{ marginTop: 24 }}>
        <h2>Safety rules</h2>
        <p className="muted">
          Editing creates a draft revision. Publish builds immutable artifacts in GitHub Actions;
          production changes only after tile and HTTP checks pass. Rollback moves the production
          pointer to a previously verified release.
        </p>
        <Link href="/api/map/version">View active version</Link>
      </section>
    </main>
  );
}
