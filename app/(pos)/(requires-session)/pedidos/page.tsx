import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { PedidosView } from "@/components/pedidos/PedidosView";

export const dynamic = "force-dynamic";

export default async function PedidosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/pos");

  return <PedidosView />;
}
