import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ComprobantesView } from "@/components/comprobantes/ComprobantesView";

export const dynamic = "force-dynamic";

export default async function ComprobantesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <ComprobantesView />;
}
