import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";

const POS_ROLES = ["CASHIER", "ADMIN"];

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session || !POS_ROLES.includes(session.user.role)) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-primary">
      <Sidebar user={session.user} />
      <main className="flex-1 min-w-0 overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
