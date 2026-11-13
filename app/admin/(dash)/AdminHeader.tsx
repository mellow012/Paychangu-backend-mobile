"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GlobalSearch from "./GlobalSearch";

const TABS = [
  { href: "/admin/overview", label: "Overview", ico: "📊" },
  { href: "/admin/disputes", label: "Disputes", ico: "⚖️" },
  { href: "/admin/users", label: "Users", ico: "👥" },
  { href: "/admin/verifications", label: "Verify", ico: "🪪" },
];

export default function AdminHeader({ email }: { email: string }) {
  const path = usePathname();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <>
      <header className="adm-top">
        <div className="adm-top-in">
          <div className="adm-brand"><span>🛡️</span> Escrow console</div>

          <nav className="adm-tabs">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : ""}>
                <span>{t.ico}</span>{t.label}
              </Link>
            ))}
          </nav>

          <div className="adm-right">
            <span className="sub" style={{ display: "none" }} title={email}>{email}</span>
            <button className="iconbtn" onClick={logout} title={`Sign out (${email})`}>Sign out</button>
          </div>

          <div className="adm-search-row"><GlobalSearch /></div>
        </div>
      </header>

      <nav className="adm-bottom">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : ""}>
            <span className="ico">{t.ico}</span>{t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
