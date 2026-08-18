import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolverDocumento } from "@/lib/consulta-documento";

const CustomerSchema = z.object({
  docType: z.string().default("DNI"),
  docNumber: z.string().min(8).max(11),
  name: z.string().min(2),
  address: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const docNumber = searchParams.get("docNumber");
  const q = searchParams.get("q");

  if (docNumber) {
    const customer = await resolverDocumento(docNumber);
    return NextResponse.json({ customer });
  }

  if (q) {
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { docNumber: { contains: q } },
        ],
      },
      take: 10,
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ customers });
  }

  return NextResponse.json({ customers: [] });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();
  const parsed = CustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const customer = await prisma.customer.upsert({
    where: { docType_docNumber: { docType: parsed.data.docType, docNumber: parsed.data.docNumber } },
    create: parsed.data,
    update: { name: parsed.data.name, address: parsed.data.address, email: parsed.data.email || null, phone: parsed.data.phone },
  });

  return NextResponse.json({ customer }, { status: 201 });
}
