import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const EDIT_ROLES = ["ADMIN"];

const CreateSchema = z.object({
  nombre:    z.string().min(1),
  nota:      z.string().nullable().optional(),
  ar16:      z.number().nullable().optional(),
  arsy:      z.number().nullable().optional(),
  arshapire: z.number().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

function serialize(row: {
  id: string;
  nombre: string;
  nota: string | null;
  ar16: unknown;
  arsy: unknown;
  arshapire: unknown;
  sortOrder: number;
}) {
  return {
    id: row.id,
    nombre: row.nombre,
    nota: row.nota,
    ar16:      row.ar16      == null ? null : Number(row.ar16),
    arsy:      row.arsy      == null ? null : Number(row.arsy),
    arshapire: row.arshapire == null ? null : Number(row.arshapire),
    sortOrder: row.sortOrder,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rows = await prisma.lensCatalog.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json(rows.map(serialize));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!EDIT_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { sortOrder, ...rest } = parsed.data;
  const nextSort = sortOrder ?? ((await prisma.lensCatalog.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1;

  const created = await prisma.lensCatalog.create({
    data: {
      nombre:    rest.nombre,
      nota:      rest.nota ?? null,
      ar16:      rest.ar16 ?? null,
      arsy:      rest.arsy ?? null,
      arshapire: rest.arshapire ?? null,
      sortOrder: nextSort,
    },
  });

  return NextResponse.json(serialize(created), { status: 201 });
}
