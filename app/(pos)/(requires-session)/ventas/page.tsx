import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { VentasView } from "@/components/ventas/VentasView";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <VentasView />;
}
