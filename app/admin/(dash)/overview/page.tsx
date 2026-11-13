"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Overview = {
  statusCounts: Record<string, number>;
  completedVolume: number;
  users: number;
  activeListings: number;
  openDisputes: number;
  arbiter: { address: string; balanceEth: number } | { error: string };
  recent: { id: string; itemDescription: string; amount: number; status: string; buyerName: string; sellerName: string; updatedAt: number | null }[];
};

const LOW_ETH = 0.002; // about a handful of resolveDispute calls on Sepolia

function ago(ms: number | null): string {
  if (!ms) return "";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    if (res.status === 401) { window.location.href = "/admin/login"; return; }
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
    setError("");
    setData(json);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const max = Math.max(1, ...Object.values(data.statusCounts));
  const arb = data.arbiter;
  const arbOk = "balanceEth" in arb;
  const arbLow = arbOk && arb.balanceEth < LOW_ETH;

  return (
    <>
      <div className="adm-head">
        <h1>Overview</h1>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="grid">
        <Link href="/admin/disputes" style={{ textDecoration: "none", color: "inherit" }}>
          <div className={`stat ${data.openDisputes > 0 ? "alert" : ""}`}>
            <div className="lbl">Open disputes</div>
            <div className="val">{data.openDisputes}</div>
          </div>
        </Link>
        <div className="stat">
          <div className="lbl">Completed volume</div>
          <div className="val">MWK {Number(data.completedVolume).toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="lbl">Active trades</div>
          <div className="val">{data.statusCounts.ACTIVE ?? 0}</div>
        </div>
        <div className="stat">
          <div className="lbl">Users · live listings</div>
          <div className="val">{data.users} · {data.activeListings}</div>
        </div>
      </div>

      <div className={`card ${arbLow || !arbOk ? "stat alert" : ""}`}>
        <b>Arbiter wallet</b>
        {arbOk ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{arb.balanceEth.toFixed(4)} ETH</div>
            <div className="sub muted" style={{ wordBreak: "break-all" }}>{arb.address}</div>
            {arbLow && (
              <p className="err" style={{ marginBottom: 0 }}>
                Low balance: disputes can&apos;t be resolved on-chain without gas. Top up from a Sepolia faucet.
              </p>
            )}
          </>
        ) : (
          <p className="err" style={{ marginBottom: 0 }}>Could not read the balance: {arb.error}</p>
        )}
      </div>

      <div className="card">
        <b>Trades by status</b>
        {Object.entries(data.statusCounts).map(([status, n]) => (
          <div className="bar-row" key={status}>
            <span className="name">{status.charAt(0) + status.slice(1).toLowerCase()}</span>
            <span className="track"><span className="fill" style={{ width: `${(n / max) * 100}%`, display: "block" }} /></span>
            <span className="n">{n}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <b>Recent activity</b>
        {data.recent.length === 0 && <p className="muted">No trades yet.</p>}
        {data.recent.map((t) => (
          <div className="row" key={t.id}>
            <div>
              <div>{t.itemDescription.trim() || "(no description)"} · MWK {Number(t.amount).toLocaleString()}</div>
              <div className="sub">{t.buyerName.trim() || "Buyer"} → {t.sellerName.trim() || "Seller"} · {ago(t.updatedAt)}</div>
            </div>
            <span className={`chip ${t.status}`}>{t.status.toLowerCase()}</span>
          </div>
        ))}
      </div>
    </>
  );
}
