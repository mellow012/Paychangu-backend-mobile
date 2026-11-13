import "./admin.css";

export const metadata = { title: "Escrow moderator console" };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="adm">{children}</div>;
}
