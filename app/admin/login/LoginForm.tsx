"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      router.replace(nextPath as Route);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in");
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 24 }}>
      <label>
        Email
        <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} style={{ display: "block", marginTop: 6, padding: 10, width: "100%" }} />
      </label>
      <label>
        Password
        <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ display: "block", marginTop: 6, padding: 10, width: "100%" }} />
      </label>
      {error ? <p role="alert" style={{ color: "#b42318", margin: 0 }}>{error}</p> : null}
      <button type="submit" disabled={submitting} style={{ background: "var(--accent)", border: 0, borderRadius: 10, color: "white", cursor: submitting ? "wait" : "pointer", padding: "11px 16px" }}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
