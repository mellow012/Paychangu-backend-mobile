"use client";

import { useCallback, useEffect, useState } from "react";

type Proposal = {
  summary: string; buyerClaim: string; sellerClaim: string; keyFacts: string[];
  evidenceNotes: string[]; proposedOutcome: string; reasoning: string; confidence: string;
};
type Dispute = {
  tradeId: string; status: string; openedByRole?: string; createdAt: number | null;
  buyerStatement?: string; sellerStatement?: string; buyerEvidence?: string[]; sellerEvidence?: string[];
  aiProposal?: Proposal; aiError?: string; resolution?: string; resolveTxHash?: string; moderatorNote?: string;
  trade: { itemDescription: string; amount: number; buyerName: string; sellerName: string; status: string };
};

const box = { border: "1px solid #ddd", borderRadius: 10, padding: 16, marginBottom: 20 } as const;

function Photos({ urls }: { urls?: string[] }) {
  if (!urls?.length) return <em style={{ color: "#888" }}>no photos</em>;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="evidence" style={{ height: 90, borderRadius: 6 }} />
        </a>
      ))}
    </div>
  );
}

export default function DisputesPage() {
  const [items, setItems] = useState<Dispute[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/disputes");
    if (res.status === 401) { window.location.href = "/admin/login"; return; }
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
    setItems(data.items);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function call(tradeId: string, action: "analyze" | "resolve", body?: object) {
    setBusy(`${tradeId}:${action}`);
    setError("");
    const res = await fetch(`/api/admin/disputes/${tradeId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? `${action} failed`);
    setBusy("");
    await load();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Disputes</h1>
        <button onClick={logout}>Sign out</button>
      </div>
      {error && <p style={{ color: "#c00" }}>{error}</p>}
      {!items && <p>Loading…</p>}
      {items?.length === 0 && <p>No disputes yet.</p>}

      {items?.map((d) => {
        const open = d.status === "open";
        const ai = d.aiProposal;
        return (
          <div key={d.tradeId} style={box}>
            <h3 style={{ marginTop: 0 }}>
              {d.trade.itemDescription} — MWK {Number(d.trade.amount).toLocaleString()}
              <span style={{ float: "right", color: open ? "#c60" : "#080" }}>
                {open ? "OPEN" : `RESOLVED (${d.resolution})`}
              </span>
            </h3>
            <p style={{ color: "#666" }}>
              Buyer {d.trade.buyerName} vs seller {d.trade.sellerName}. Opened by the {d.openedByRole ?? "?"}.
            </p>

            <h4>Buyer says</h4>
            <p>{d.buyerStatement || <em style={{ color: "#888" }}>nothing yet</em>}</p>
            <Photos urls={d.buyerEvidence} />
            <h4>Seller says</h4>
            <p>{d.sellerStatement || <em style={{ color: "#888" }}>nothing yet</em>}</p>
            <Photos urls={d.sellerEvidence} />

            <h4>AI analysis (advice only)</h4>
            {ai ? (
              <div style={{ background: "#f6f6f6", padding: 12, borderRadius: 8 }}>
                <p><b>Summary:</b> {ai.summary}</p>
                <p><b>Suggested outcome:</b> {ai.proposedOutcome} ({ai.confidence} confidence)</p>
                <p><b>Reasoning:</b> {ai.reasoning}</p>
                {ai.evidenceNotes.length > 0 && <p><b>Photos:</b> {ai.evidenceNotes.join(" ")}</p>}
              </div>
            ) : (
              <em style={{ color: "#888" }}>{d.aiError ? `Analysis failed: ${d.aiError}` : "Not analysed yet"}</em>
            )}
            {open && (
              <div style={{ marginTop: 10 }}>
                <button onClick={() => call(d.tradeId, "analyze")} disabled={!!busy}>
                  {busy === `${d.tradeId}:analyze` ? "Analysing…" : ai ? "Re-run AI analysis" : "Run AI analysis"}
                </button>
              </div>
            )}

            {open ? (
              <div style={{ marginTop: 16 }}>
                <input
                  placeholder="Moderator note (optional, shown to both parties)"
                  value={notes[d.tradeId] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [d.tradeId]: e.target.value })}
                  style={{ width: "100%", padding: 8, marginBottom: 10, boxSizing: "border-box" }}
                />
                <button
                  disabled={!!busy}
                  onClick={() => confirm("Release the funds to the SELLER? This is final.") &&
                    call(d.tradeId, "resolve", { outcome: "release", note: notes[d.tradeId] })}
                  style={{ marginRight: 10, padding: "10px 16px" }}
                >
                  {busy === `${d.tradeId}:resolve` ? "Working…" : "Release to seller"}
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => confirm("Refund the BUYER? This is final.") &&
                    call(d.tradeId, "resolve", { outcome: "refund", note: notes[d.tradeId] })}
                  style={{ padding: "10px 16px" }}
                >
                  Refund buyer
                </button>
              </div>
            ) : (
              d.resolveTxHash && (
                <p>
                  <a href={`https://sepolia.etherscan.io/tx/${d.resolveTxHash}`} target="_blank" rel="noreferrer">
                    View resolution on Etherscan
                  </a>
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
