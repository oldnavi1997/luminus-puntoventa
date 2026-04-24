import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { InventoryView } from "@/components/inventario/InventoryView";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CASHIER") redirect("/pos");

  return <InventoryView />;
}
