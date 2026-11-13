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

type Filter = "open" | "resolved" | "all";

function Photos({ urls }: { urls?: string[] }) {
  if (!urls?.length) return <em className="muted">no photos</em>;
  return (
    <div className="photos">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="evidence" />
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
  const [filter, setFilter] = useState<Filter>("open");

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

  const shown = items?.filter((d) => filter === "all" || d.status === filter) ?? [];
  const openCount = items?.filter((d) => d.status === "open").length ?? 0;

  return (
    <>
      <div className="adm-head"><h1>Disputes</h1></div>

      <div className="tabs">
        {(["open", "resolved", "all"] as Filter[]).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "open" ? `Open (${openCount})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && <p className="err">{error}</p>}
      {!items && <p className="muted">Loading…</p>}
      {items && shown.length === 0 && <p className="muted">No {filter === "all" ? "" : filter} disputes.</p>}

      {shown.map((d) => {
        const open = d.status === "open";
        const ai = d.aiProposal;
        return (
          <div key={d.tradeId} className="card">
            <div className="row" style={{ borderTop: 0, paddingTop: 0 }}>
              <div>
                <b>{d.trade.itemDescription.trim()} — MWK {Number(d.trade.amount).toLocaleString()}</b>
                <div className="sub">
                  Buyer {d.trade.buyerName.trim() || "—"} vs seller {d.trade.sellerName.trim() || "—"} · opened by the {d.openedByRole ?? "?"}
                </div>
              </div>
              <span className={`chip ${d.status}`}>{open ? "open" : `resolved: ${d.resolution}`}</span>
            </div>

            <h4>Buyer says</h4>
            <p className="quote">{d.buyerStatement || <em className="muted">nothing yet</em>}</p>
            <Photos urls={d.buyerEvidence} />
            <h4>Seller says</h4>
            <p className="quote">{d.sellerStatement || <em className="muted">nothing yet</em>}</p>
            <Photos urls={d.sellerEvidence} />

            <h4>AI analysis (advice only)</h4>
            {ai ? (
              <div className="ai">
                <p><b>Summary:</b> {ai.summary}</p>
                <p><b>Suggested outcome:</b> {ai.proposedOutcome.replace("_", " ")} ({ai.confidence} confidence)</p>
                <p><b>Reasoning:</b> {ai.reasoning}</p>
                {ai.evidenceNotes.length > 0 && <p style={{ marginBottom: 0 }}><b>Photos:</b> {ai.evidenceNotes.join(" ")}</p>}
              </div>
            ) : (
              <em className="muted">{d.aiError ? `Analysis failed: ${d.aiError}` : "Not analysed yet"}</em>
            )}
            {open && (
              <div style={{ marginTop: 10 }}>
                <button className="btn" onClick={() => call(d.tradeId, "analyze")} disabled={!!busy}>
                  {busy === `${d.tradeId}:analyze` ? "Analysing…" : ai ? "Re-run AI analysis" : "Run AI analysis"}
                </button>
              </div>
            )}

            {open ? (
              <div style={{ marginTop: 16 }}>
                <input
                  className="input"
                  placeholder="Moderator note (optional, shown to both parties)"
                  value={notes[d.tradeId] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [d.tradeId]: e.target.value })}
                />
                <div className="actions">
                  <button
                    className="btn primary"
                    disabled={!!busy}
                    onClick={() => confirm("Release the funds to the SELLER? This is final.") &&
                      call(d.tradeId, "resolve", { outcome: "release", note: notes[d.tradeId] })}
                  >
                    {busy === `${d.tradeId}:resolve` ? "Working…" : "Release to seller"}
                  </button>
                  <button
                    className="btn danger"
                    disabled={!!busy}
                    onClick={() => confirm("Refund the BUYER? This is final.") &&
                      call(d.tradeId, "resolve", { outcome: "refund", note: notes[d.tradeId] })}
                  >
                    Refund buyer
                  </button>
                </div>
              </div>
            ) : (
              <>
                {d.moderatorNote && <p><b>Moderator note:</b> {d.moderatorNote}</p>}
                {d.resolveTxHash && (
                  <p>
                    <a href={`https://sepolia.etherscan.io/tx/${d.resolveTxHash}`} target="_blank" rel="noreferrer">
                      View resolution on Etherscan
                    </a>
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
