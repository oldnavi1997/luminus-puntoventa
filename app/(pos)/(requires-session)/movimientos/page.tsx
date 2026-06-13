import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MovimientosView } from "@/components/movimientos/MovimientosView";

export const dynamic = "force-dynamic";

export default async function MovimientosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role === "CASHIER") redirect("/pos");

  return <MovimientosView />;
}
