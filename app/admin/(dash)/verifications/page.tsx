"use client";

import { useCallback, useEffect, useState } from "react";
import { PageSkeleton, Spinner } from "../../ui";

type V = {
  uid: string; name: string; status: string; idImageUrl: string; selfieUrl: string;
  rejectReason: string; submittedAt: number | null; reviewedAt: number | null;
};
type Filter = "pending" | "reviewed" | "all";

function when(ms: number | null) {
  return ms ? new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
}

export default function VerificationsPage() {
  const [items, setItems] = useState<V[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [busy, setBusy] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/verifications");
    if (res.status === 401) { window.location.href = "/admin/login"; return; }
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
    setItems(data.items);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(uid: string, action: "approve" | "reject") {
    setBusy(`${uid}:${action}`);
    setError("");
    const res = await fetch(`/api/admin/verifications/${uid}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: reasons[uid] ?? "" }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed");
    setBusy("");
    await load();
  }

  if (!items && !error) return <PageSkeleton />;

  const pending = items?.filter((v) => v.status === "pending").length ?? 0;
  const shown = (items ?? []).filter((v) =>
    filter === "all" ? true : filter === "pending" ? v.status === "pending" : v.status !== "pending");

  return (
    <>
      <div className="adm-head">
        <h1>Verifications</h1>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="filters">
        <div className="seg">
          {(["pending", "reviewed", "all"] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}{f === "pending" && <span className="count">{pending}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="err">{error}</p>}
      {shown.length === 0 && (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <p className="muted">Nothing here.</p>
        </div>
      )}

      {shown.map((v) => {
        const isPending = v.status === "pending";
        return (
          <div className="card" key={v.uid}>
            <div className="row" style={{ borderTop: 0, paddingTop: 0 }}>
              <div>
                <b>{v.name.trim() || "(no name)"}</b>
                <div className="sub">Submitted {when(v.submittedAt)}</div>
              </div>
              <span className={`chip ${v.status === "approved" ? "ok" : v.status === "rejected" ? "bad" : "warn"}`}>{v.status}</span>
            </div>

            <div className="photos" style={{ marginTop: 10 }}>
              {[["ID", v.idImageUrl], ["Selfie", v.selfieUrl]].map(([label, url]) => url && (
                <div key={label} style={{ textAlign: "center" }}>
                  <button onClick={() => setZoom(url)} style={{ padding: 0, border: 0, background: "none", cursor: "zoom-in" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={label} style={{ height: 150, borderRadius: 10, border: "1px solid var(--line)" }} />
                  </button>
                  <div className="sub">{label}</div>
                </div>
              ))}
            </div>

            {isPending ? (
              <div style={{ marginTop: 14 }}>
                <input
                  className="input"
                  placeholder="Reason (required to reject, shown to the user)"
                  value={reasons[v.uid] ?? ""}
                  onChange={(e) => setReasons({ ...reasons, [v.uid]: e.target.value })}
                />
                <div className="actions">
                  <button className="btn primary" disabled={!!busy} onClick={() => confirm("Approve and mark as verified?") && decide(v.uid, "approve")}>
                    {busy === `${v.uid}:approve` ? <><Spinner /> Approving…</> : "Approve"}
                  </button>
                  <button className="btn danger" disabled={!!busy || !(reasons[v.uid] ?? "").trim()} onClick={() => decide(v.uid, "reject")}>
                    {busy === `${v.uid}:reject` ? <><Spinner /> Rejecting…</> : "Reject"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="sub" style={{ marginBottom: 0 }}>
                Reviewed {when(v.reviewedAt)}{v.rejectReason ? ` · reason: ${v.rejectReason}` : ""}
              </p>
            )}
          </div>
        );
      })}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="verification" />
        </div>
      )}
    </>
  );
}
