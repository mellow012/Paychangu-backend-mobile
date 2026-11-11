"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      window.location.href = "/admin/disputes";
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Login failed");
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 360, margin: "80px auto" }}>
      <h1>Moderator login</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: 10, width: "100%", marginBottom: 10, boxSizing: "border-box" }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ padding: 10, width: "100%", marginBottom: 10, boxSizing: "border-box" }}
      />
      {error && <p style={{ color: "#c00" }}>{error}</p>}
      <button onClick={submit} disabled={busy || !email || !password} style={{ padding: "10px 20px" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </div>
  );
}
