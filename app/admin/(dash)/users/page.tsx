"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type U = {
  uid: string; name: string; email: string; phone: string; isVerified: boolean; walletAddress: string;
  avgRating: number; ratingCount: number; createdAt: number | null;
  tradesBuying: number; tradesSelling: number; lastActive: number | null;
};
type Data = {
  metrics: {
    totalUsers: number; joined7: number; joined30: number; active7: number; active30: number;
    everTraded: number; verified: number; withWallet: number; listed: number; truncated: boolean;
  };
  signupsByDay: { day: string; count: number }[];
  users: U[];
};
type Filter = "all" | "traders" | "never" | "verified";

function ago(ms: number | null): string {
  if (!ms) return "never";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function UsersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 401) { window.location.href = "/admin/login"; return; }
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
    setError("");
    setData(json);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function setVerified(uid: string, verified: boolean) {
    setBusy(uid);
    const res = await fetch(`/api/admin/users/${uid}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Update failed");
    setBusy("");
    await load();
  }

  const shown = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.users.filter((u) => {
      const traded = u.tradesBuying + u.tradesSelling > 0;
      if (filter === "traders" && !traded) return false;
      if (filter === "never" && traded) return false;
      if (filter === "verified" && !u.isVerified) return false;
      if (!needle) return true;
      return [u.name, u.email, u.phone].some((f) => f.toLowerCase().includes(needle));
    });
  }, [data, q, filter]);

  if (error && !data) return <p className="err">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const m = data.metrics;
  const maxSignups = Math.max(1, ...data.signupsByDay.map((d) => d.count));
  const pct = (n: number) => (m.listed ? Math.round((n / m.listed) * 100) : 0);

  return (
    <>
      <div className="adm-head">
        <h1>Users</h1>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="grid">
        <div className="stat"><div className="lbl">Total users</div><div className="val">{m.totalUsers}</div></div>
        <div className="stat"><div className="lbl">New (7 days · 30 days)</div><div className="val">{m.joined7} · {m.joined30}</div></div>
        <div className="stat"><div className="lbl">Active (7 days · 30 days)</div><div className="val">{m.active7} · {m.active30}</div></div>
        <div className="stat"><div className="lbl">Have traded</div><div className="val">{m.everTraded} <span className="muted" style={{ fontSize: 13 }}>({pct(m.everTraded)}%)</span></div></div>
      </div>

      <div className="card">
        <b>New sign-ups, last 14 days</b>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, marginTop: 12 }}>
          {data.signupsByDay.map((d) => (
            <div key={d.day} title={`${d.day}: ${d.count}`} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: `${(d.count / maxSignups) * 60}px`, minHeight: d.count ? 4 : 1, background: "var(--brand)", borderRadius: 3 }} />
              <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>{d.day.slice(3)}</div>
            </div>
          ))}
        </div>
        <p className="sub muted" style={{ marginBottom: 0 }}>
          &quot;Active&quot; means took part in a trade in that period. Verified: {m.verified} · with a wallet: {m.withWallet}.
          App opens aren&apos;t stored here; use Firebase Analytics for daily and monthly app users.
        </p>
      </div>

      <input className="input" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <div className="tabs">
        {([["all", "All"], ["traders", "Traders"], ["never", "Never traded"], ["verified", "Verified"]] as [Filter, string][]).map(([f, label]) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{label}</button>
        ))}
      </div>

      {error && <p className="err">{error}</p>}
      {m.truncated && <p className="muted">Showing the newest {m.listed} of {m.totalUsers} users.</p>}

      <div className="card" style={{ padding: "4px 16px" }}>
        {shown.length === 0 && <p className="muted">No users match.</p>}
        {shown.map((u) => (
          <div key={u.uid} className="row" style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }}
              onClick={() => setOpen(open === u.uid ? null : u.uid)}>
              <div>
                <div><b>{u.name.trim() || "(no name)"}</b> {u.isVerified && <span className="chip COMPLETED">verified</span>}</div>
                <div className="sub">{u.email} · joined {ago(u.createdAt)} · last trade {ago(u.lastActive)}</div>
              </div>
              <div className="sub" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {u.tradesBuying + u.tradesSelling} trades
                {u.ratingCount > 0 && <div>★ {u.avgRating.toFixed(1)} ({u.ratingCount})</div>}
              </div>
            </div>
            {open === u.uid && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div>Phone: {u.phone || "—"}</div>
                <div>Buying: {u.tradesBuying} · Selling: {u.tradesSelling}</div>
                <div style={{ wordBreak: "break-all" }}>Wallet: {u.walletAddress || "none yet"}</div>
                <div className="actions">
                  <button className={`btn ${u.isVerified ? "" : "primary"}`} disabled={busy === u.uid} onClick={() => setVerified(u.uid, !u.isVerified)}>
                    {u.isVerified ? "Remove verified badge" : "Mark as verified trader"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
