import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/adminAuth";
import AdminNav from "./AdminNav";

// Every page inside (dash) requires a valid admin session; the login page lives outside it.
export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return (
    <div className="adm-shell">
      <AdminNav email={admin} />
      <main className="adm-main">{children}</main>
    </div>
  );
}
