"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/overview", label: "Overview", ico: "📊" },
  { href: "/admin/disputes", label: "Disputes", ico: "⚖️" },
  { href: "/admin/users", label: "Users", ico: "👥" },
];

export default function AdminNav({ email }: { email: string }) {
  const path = usePathname();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <nav className="adm-nav">
      <div className="adm-brand">Escrow console</div>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : ""}>
          <span className="ico">{t.ico}</span>
          {t.label}
        </Link>
      ))}
      <button className="adm-out" onClick={logout}>
        <span className="ico">🚪</span>
        Sign out
      </button>
      <div className="adm-side-foot">
        <div className="muted" style={{ fontSize: 12, padding: "0 12px 8px", wordBreak: "break-all" }}>{email}</div>
        <button className="btn" style={{ width: "100%" }} onClick={logout}>Sign out</button>
      </div>
    </nav>
  );
}
