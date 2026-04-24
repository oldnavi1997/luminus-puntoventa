import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ConvertirView } from "@/components/convertir/ConvertirView";

export const dynamic = "force-dynamic";

export default async function ConvertirPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <ConvertirView />;
}
