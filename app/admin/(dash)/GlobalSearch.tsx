"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "../ui";

type Res = {
  users: { uid: string; name: string; email: string; phone: string }[];
  disputes: { tradeId: string; item: string; buyer: string; seller: string; status: string }[];
};

export default function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // debounce
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`);
        if (r.status === 401) { window.location.href = "/admin/login"; return; }
        setRes(await r.json());
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const empty = res && res.users.length === 0 && res.disputes.length === 0;

  return (
    <div className="gs" ref={box}>
      <span className="mag">🔍</span>
      <input
        value={q}
        placeholder="Search users, disputes…"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => res && setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      />
      {loading && <Spinner />}
      {open && res && (
        <div className="gs-pop">
          {empty && <div style={{ padding: 14 }} className="muted">No matches for “{q.trim()}”.</div>}
          {res.users.length > 0 && <div className="grp">Users</div>}
          {res.users.map((u) => (
            <button key={u.uid} onClick={() => go(`/admin/users?q=${encodeURIComponent(u.email || u.name)}`)}>
              <div>{u.name.trim() || "(no name)"}</div>
              <div className="sub">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
            </button>
          ))}
          {res.disputes.length > 0 && <div className="grp">Disputes</div>}
          {res.disputes.map((d) => (
            <button key={d.tradeId} onClick={() => go(`/admin/disputes?trade=${d.tradeId}`)}>
              <div>{d.item || "(no description)"} <span className={`chip ${d.status}`}>{d.status}</span></div>
              <div className="sub">{d.buyer || "Buyer"} vs {d.seller || "Seller"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
