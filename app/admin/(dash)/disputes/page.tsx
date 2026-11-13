"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader, PageSkeleton, Spinner } from "../../ui";

type Proposal = {
  summary: string; buyerClaim: string; sellerClaim: string; keyFacts: string[];
  evidenceNotes: string[]; proposedOutcome: string; reasoning: string; confidence: string;
};
type Dispute = {
  tradeId: string; status: string; openedByRole?: string;
  createdAt: number | null; resolvedAt: number | null; aiAnalyzedAt: number | null;
  buyerSubmittedAt: number | null; sellerSubmittedAt: number | null;
  buyerStatement?: string; sellerStatement?: string; buyerEvidence?: string[]; sellerEvidence?: string[];
  aiProposal?: Proposal; aiError?: string; resolution?: string; resolveTxHash?: string; moderatorNote?: string;
  trade: { itemDescription: string; amount: number; buyerName: string; sellerName: string; status: string };
};

type Status = "open" | "resolved" | "all";
type Sort = "newest" | "oldest" | "amount";

function ago(ms: number | null): string {
  if (!ms) return "";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function clock(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
const initial = (name: string, fallback: string) => (name.trim()[0] ?? fallback).toUpperCase();

function Photos({ urls, onZoom }: { urls?: string[]; onZoom: (u: string) => void }) {
  if (!urls?.length) return null;
  return (
    <div className="photos">
      {urls.map((u) => (
        <button key={u} onClick={() => onZoom(u)} aria-label="View photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="evidence" />
        </button>
      ))}
    </div>
  );
}

type Ev =
  | { key: string; ts: number; kind: "system"; text: string }
  | { key: string; ts: number; kind: "buyer" | "seller"; text: string; photos: string[] }
  | { key: string; ts: number; kind: "ai"; p: Proposal }
  | { key: string; ts: number; kind: "decision"; text: string };

function buildChat(d: Dispute): Ev[] {
  const start = d.createdAt ?? 0;
  const opener = d.openedByRole === "seller" ? "seller" : "buyer";
  const evs: Ev[] = [
    { key: "open", ts: start, kind: "system", text: `Dispute opened by the ${opener} · ${clock(d.createdAt)}` },
  ];
  const side = (role: "buyer" | "seller") => {
    const text = (role === "buyer" ? d.buyerStatement : d.sellerStatement) ?? "";
    const photos = (role === "buyer" ? d.buyerEvidence : d.sellerEvidence) ?? [];
    if (!text && photos.length === 0) return;
    const submitted = role === "buyer" ? d.buyerSubmittedAt : d.sellerSubmittedAt;
    const ts = role === opener ? start + 1 : submitted ?? start + 2;
    evs.push({ key: role, ts, kind: role, text, photos });
  };
  side("buyer");
  side("seller");
  if (d.aiProposal) evs.push({ key: "ai", ts: d.aiAnalyzedAt ?? start + 3, kind: "ai", p: d.aiProposal });
  if (d.status === "resolved") {
    const forSeller = d.resolution === "release";
    evs.push({
      key: "decision",
      ts: d.resolvedAt ?? start + 4,
      kind: "decision",
      text: forSeller
        ? "Moderator decided in favour of the seller. Funds released."
        : "Moderator decided in favour of the buyer. Buyer refunded.",
    });
  }
  return evs.sort((a, b) => a.ts - b.ts);
}

function Case({
  d, expanded, onToggle, onZoom, busy, onAnalyze, onResolve,
}: {
  d: Dispute; expanded: boolean; onToggle: () => void; onZoom: (u: string) => void; busy: string;
  onAnalyze: () => void; onResolve: (outcome: "release" | "refund", note: string) => void;
}) {
  const [note, setNote] = useState("");
  const open = d.status === "open";
  const buyer = d.trade.buyerName.trim() || "Buyer";
  const seller = d.trade.sellerName.trim() || "Seller";
  const photoCount = (d.buyerEvidence?.length ?? 0) + (d.sellerEvidence?.length ?? 0);
  const ai = d.aiProposal;
  const events = useMemo(() => buildChat(d), [d]);
  const waitingFor = open ? (!d.buyerStatement && !(d.buyerEvidence?.length) ? "buyer" : !d.sellerStatement && !(d.sellerEvidence?.length) ? "seller" : null) : null;
  const working = !!busy;

  return (
    <div className={`case ${expanded ? "open-card" : ""}`} id={`case-${d.tradeId}`}>
      <button className="case-head" onClick={onToggle} aria-expanded={expanded}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="case-title">{d.trade.itemDescription.trim() || "(no description)"} · MWK {Number(d.trade.amount).toLocaleString()}</div>
          <div className="sub">{buyer} vs {seller}</div>
          <div className="case-meta">
            <span className={`chip ${d.status}`}>{open ? "open" : `resolved · ${d.resolution === "release" ? "seller paid" : "buyer refunded"}`}</span>
            {ai && <span className="chip ai">AI: {ai.proposedOutcome.replace("_", " ")}</span>}
            {photoCount > 0 && <span className="chip">📷 {photoCount}</span>}
            {waitingFor && <span className="chip warn">waiting for {waitingFor}</span>}
            <span className="sub">{ago(d.createdAt)}</span>
          </div>
        </div>
        <span className="chev">▾</span>
      </button>

      {expanded && (
        <div className="case-body">
          <div className="chat">
            {events.map((e) => {
              if (e.kind === "system") return <div className="sys" key={e.key}>{e.text}</div>;
              if (e.kind === "decision") return <div className="decision" key={e.key}>⚖️ {e.text}</div>;
              if (e.kind === "ai") {
                const p = e.p;
                return (
                  <div className="ai-card" key={e.key}>
                    <div className="ai-top">
                      ✨ AI assistant <span className="chip ai">advice only</span>
                      <span className={`chip ${p.proposedOutcome === "insufficient_evidence" ? "warn" : "ai"}`}>
                        {p.proposedOutcome.replace("_", " ")} · {p.confidence} confidence
                      </span>
                    </div>
                    <p>{p.summary}</p>
                    <div className="lbl">Reasoning</div>
                    <p style={{ marginTop: 2 }}>{p.reasoning}</p>
                    {p.evidenceNotes.length > 0 && (<><div className="lbl">Photos</div><p style={{ marginTop: 2 }}>{p.evidenceNotes.join(" ")}</p></>)}
                  </div>
                );
              }
              const isBuyer = e.kind === "buyer";
              const name = isBuyer ? buyer : seller;
              return (
                <div className={`msg ${e.kind}`} key={e.key}>
                  <div className={`avatar ${e.kind}`}>{initial(name, isBuyer ? "B" : "S")}</div>
                  <div className="bubble">
                    <div className="who">{name} <span className="t">{isBuyer ? "buyer" : "seller"}</span></div>
                    {e.text && <p>{e.text}</p>}
                    <Photos urls={e.photos} onZoom={onZoom} />
                  </div>
                </div>
              );
            })}

            {waitingFor && (
              <div className={`msg ${waitingFor} ghost`}>
                <div className={`avatar ${waitingFor}`}>{waitingFor === "buyer" ? initial(buyer, "B") : initial(seller, "S")}</div>
                <div className="bubble">Waiting for the {waitingFor}&apos;s side <span className="dots"><span /><span /><span /></span></div>
              </div>
            )}
            {d.aiError && !ai && <div className="sys" style={{ color: "var(--bad)" }}>AI analysis failed: {d.aiError}</div>}
          </div>

          {open ? (
            <div className="composer">
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button className="btn" onClick={onAnalyze} disabled={working}>
                  {busy === "analyze" ? <><Spinner /> Analysing…</> : ai ? "✨ Re-run AI analysis" : "✨ Run AI analysis"}
                </button>
              </div>
              <input className="input" placeholder="Moderator note (optional, shown to both parties)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions">
                <button
                  className={`btn primary ${ai?.proposedOutcome === "release" ? "hint" : ""}`}
                  disabled={working}
                  onClick={() => confirm("Release the funds to the SELLER? This is final.") && onResolve("release", note)}
                >
                  {busy === "resolve" ? <><Spinner /> Working on-chain…</> : "Release to seller"}
                </button>
                <button
                  className={`btn danger ${ai?.proposedOutcome === "refund" ? "hint" : ""}`}
                  disabled={working}
                  onClick={() => confirm("Refund the BUYER? This is final.") && onResolve("refund", note)}
                >
                  Refund buyer
                </button>
              </div>
            </div>
          ) : (
            <div className="composer">
              {d.moderatorNote && <p style={{ marginTop: 0 }}><b>Moderator note:</b> {d.moderatorNote}</p>}
              {d.resolveTxHash && (
                <a href={`https://sepolia.etherscan.io/tx/${d.resolveTxHash}`} target="_blank" rel="noreferrer">
                  View resolution on Etherscan ↗
                </a>
              )}
              {!d.moderatorNote && !d.resolveTxHash && <span className="muted">Resolved.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DisputesInner() {
  const params = useSearchParams();
  const focus = params.get("trade");

  const [items, setItems] = useState<Dispute[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>("open");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [noAi, setNoAi] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [withPhotos, setWithPhotos] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState<string | null>(null);
  const focused = useRef<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/disputes");
    if (res.status === 401) { window.location.href = "/admin/login"; return; }
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to load"); return; }
    setItems(data.items);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Open + scroll to a dispute linked from the header search
  useEffect(() => {
    if (!focus || !items || focused.current === focus) return;
    const target = items.find((d) => d.tradeId === focus);
    if (!target) return;
    focused.current = focus;
    setStatus("all");
    setExpanded((s) => new Set(s).add(focus));
    setTimeout(() => document.getElementById(`case-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [focus, items]);

  async function call(tradeId: string, action: "analyze" | "resolve", body?: object) {
    setBusy((b) => ({ ...b, [tradeId]: action }));
    setError("");
    const res = await fetch(`/api/admin/disputes/${tradeId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? `${action} failed`);
    setBusy((b) => { const n = { ...b }; delete n[tradeId]; return n; });
    await load();
  }

  const counts = useMemo(() => ({
    open: items?.filter((d) => d.status === "open").length ?? 0,
    resolved: items?.filter((d) => d.status === "resolved").length ?? 0,
    all: items?.length ?? 0,
  }), [items]);

  const shown = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    const list = items.filter((d) => {
      if (status !== "all" && d.status !== status) return false;
      if (noAi && d.aiProposal) return false;
      if (awaiting && !(d.status === "open" && (!d.sellerStatement && !d.sellerEvidence?.length || !d.buyerStatement && !d.buyerEvidence?.length))) return false;
      if (withPhotos && !((d.buyerEvidence?.length ?? 0) + (d.sellerEvidence?.length ?? 0))) return false;
      if (!needle) return true;
      return [d.trade.itemDescription, d.trade.buyerName, d.trade.sellerName, d.buyerStatement ?? "", d.sellerStatement ?? ""]
        .some((f) => f.toLowerCase().includes(needle));
    });
    return list.sort((a, b) =>
      sort === "amount" ? b.trade.amount - a.trade.amount
        : sort === "oldest" ? (a.createdAt ?? 0) - (b.createdAt ?? 0)
        : (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [items, status, q, sort, noAi, awaiting, withPhotos]);

  function toggle(id: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  if (!items && !error) return <PageSkeleton />;

  return (
    <>
      <div className="adm-head">
        <h1>Disputes</h1>
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      <div className="filters">
        <div className="seg" role="tablist">
          {(["open", "resolved", "all"] as Status[]).map((s) => (
            <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}<span className="count">{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="filter-row">
          <input className="input" placeholder="Filter by item, name or what they said" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amount">Highest amount</option>
          </select>
        </div>
        <div className="filter-row">
          <button className={`pill ${noAi ? "on" : ""}`} onClick={() => setNoAi(!noAi)}>✨ Needs AI analysis</button>
          <button className={`pill ${awaiting ? "on" : ""}`} onClick={() => setAwaiting(!awaiting)}>⏳ Waiting for a side</button>
          <button className={`pill ${withPhotos ? "on" : ""}`} onClick={() => setWithPhotos(!withPhotos)}>📷 Has photos</button>
          {(noAi || awaiting || withPhotos || q) && (
            <button className="pill" onClick={() => { setNoAi(false); setAwaiting(false); setWithPhotos(false); setQ(""); }}>Clear</button>
          )}
        </div>
      </div>

      {error && <p className="err">{error}</p>}
      {items && shown.length === 0 && (
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>🕊️</div>
          <p className="muted">No disputes match these filters.</p>
        </div>
      )}

      {shown.map((d) => (
        <Case
          key={d.tradeId}
          d={d}
          expanded={expanded.has(d.tradeId)}
          onToggle={() => toggle(d.tradeId)}
          onZoom={setZoom}
          busy={busy[d.tradeId] ?? ""}
          onAnalyze={() => call(d.tradeId, "analyze")}
          onResolve={(outcome, note) => call(d.tradeId, "resolve", { outcome, note })}
        />
      ))}

      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="evidence" />
        </div>
      )}
    </>
  );
}

export default function DisputesPage() {
  return (
    <Suspense fallback={<Loader label="Loading disputes…" />}>
      <DisputesInner />
    </Suspense>
  );
}
