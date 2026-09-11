import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <p className="eyebrow">Nomadeezee Map Platform</p>
      <h1>Versioned maps for Nomadeezee.</h1>
      <p className="muted">
        This service owns the basemap, editable geographic layer, release manifest, and
        MapLibre style contract consumed by nomadeezee.com.
      </p>
      <div className="grid" style={{ marginTop: 28 }}>
        <section className="card">
          <h2>Public map contract</h2>
          <p className="muted">The stable endpoints are versioned behind the production channel.</p>
          <p><a href="/api/styles/plain.json">Style JSON</a> · <a href="/api/map/manifest">Manifest</a> · <a href="/api/map/version">Version</a></p>
        </section>
        <section className="card">
          <h2>Administration</h2>
          <p className="muted">Admin APIs use Supabase Auth and a server-side admin role check.</p>
          <p><Link href="/admin">Open the admin workspace</Link></p>
        </section>
      </div>
    </main>
  );
}
