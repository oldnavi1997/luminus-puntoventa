import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding POS data...");

  // Document series NV001, B001, F001
  await prisma.documentSerie.upsert({
    where: { type_serie: { type: "NOTA_VENTA", serie: "NV001" } },
    update: {},
    create: { type: "NOTA_VENTA", serie: "NV001", lastNumber: 0 },
  });

  await prisma.documentSerie.upsert({
    where: { type_serie: { type: "BOLETA", serie: "B001" } },
    update: {},
    create: { type: "BOLETA", serie: "B001", lastNumber: 0 },
  });

  await prisma.documentSerie.upsert({
    where: { type_serie: { type: "FACTURA", serie: "F001" } },
    update: {},
    create: { type: "FACTURA", serie: "F001", lastNumber: 0 },
  });

  console.log("  ✓ Document series NV001, B001, F001 created");

  // Admin user
  const adminPassword = await bcrypt.hash("Admin123!", 10);
  await prisma.user.upsert({
    where: { email: "admin@luminus.pe" },
    update: { password: adminPassword, role: "ADMIN" },
    create: {
      email: "admin@luminus.pe",
      name: "Administrador",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  console.log("  ✓ Admin user: admin@luminus.pe / Admin123!");

  // Cashier user
  const cashierPassword = await bcrypt.hash("Cajero123!", 10);
  await prisma.user.upsert({
    where: { email: "cajero@luminus.pe" },
    update: { password: cashierPassword, role: "CASHIER" },
    create: {
      email: "cajero@luminus.pe",
      name: "Cajero Principal",
      password: cashierPassword,
      role: "CASHIER",
    },
  });

  console.log("  ✓ Cashier user: cajero@luminus.pe / Cajero123!");

  // Calculador de Lunas — fabrication costs (10 filas, id estable 1-10)
  const fabricationCosts = [
    { id: 1,  label: "Esf ≤2 · Cil ≤2",       costOd: 47.50, costOi: 47.50 },
    { id: 2,  label: "Esf ≤2 · Cil 2–3",      costOd: 57.50, costOi: 57.50 },
    { id: 3,  label: "Esf ≤2 · Cil 4",        costOd: 62.50, costOi: 62.50 },
    { id: 4,  label: "Esf ≤2 · Cil 5",        costOd: 67.50, costOi: 65.00 },
    { id: 5,  label: "Esf ≤2 · Cil 6",        costOd: 67.50, costOi: 67.50 },
    { id: 6,  label: "Esf 3 · Cil ≤3",        costOd: 57.50, costOi: 57.50 },
    { id: 7,  label: "Esf 3 · Cil 4",         costOd: 62.50, costOi: 62.50 },
    { id: 8,  label: "Esf 3 · Cil ≥5",        costOd: 67.50, costOi: 67.50 },
    { id: 9,  label: "Esf 4 exacto · Cil 4",  costOd: 62.50, costOi: 62.50 },
    { id: 10, label: "Esf ≥4 (resto)",        costOd: 67.50, costOi: 67.50 },
  ];

  for (const row of fabricationCosts) {
    await prisma.fabricationCost.upsert({
      where: { id: row.id },
      update: {},
      create: row,
    });
  }
  console.log("  ✓ Fabrication costs (10 rows)");

  // Lens catalog (7 filas)
  const lensCatalog = [
    { nombre: "Lunas Transition Kodak Blue Defense/Antireflex",                nota: "(6 colores)",                            ar16: 650, arsy: null,  arshapire: 750,  sortOrder: 1 },
    { nombre: "Lunas Kodak Transition 1.74 Blue Defense/Antireflex",           nota: "(Gris y Marron)",                        ar16: 680, arsy: null,  arshapire: 900,  sortOrder: 2 },
    { nombre: "Lunas Kodak Blue Defense/Antireflex",                           nota: null,                                     ar16: 500, arsy: 550,   arshapire: 630,  sortOrder: 3 },
    { nombre: "Lunas Alto Indice 1.74 Free Evolution Blue Defense/Antireflex", nota: null,                                     ar16: 650, arsy: null,  arshapire: 850,  sortOrder: 4 },
    { nombre: "Lunas Eyezen Blue Defense/Antireflex",                          nota: null,                                     ar16: 550, arsy: 600,   arshapire: 680,  sortOrder: 5 },
    { nombre: "Lunas Tridurex Blue Defense/Antireflex",                        nota: null,                                     ar16: 420, arsy: 470,   arshapire: null, sortOrder: 6 },
    { nombre: "Lunas Crizal Blue Defense/Antireflex",                          nota: "(Solo disponible hasta medida de 2,00)", ar16: 330, arsy: null,  arshapire: null, sortOrder: 7 },
  ];

  for (const row of lensCatalog) {
    const existing = await prisma.lensCatalog.findFirst({
      where: { nombre: row.nombre, sortOrder: row.sortOrder },
    });
    if (!existing) {
      await prisma.lensCatalog.create({ data: row });
    }
  }
  console.log("  ✓ Lens catalog (7 rows)");

  // Lunas sin medida (3 filas)
  const lunasSinMedida = [
    { nombre: "Lunas Nk 55 (Resina) Blue Defense/Antireflex", precio: 80,  sortOrder: 1 },
    { nombre: "Lunas Policarbonato Blue Defense/Antireflex",  precio: 150, sortOrder: 2 },
    { nombre: "Lunas Crizal Blue Defense/Antireflex",         precio: 300, sortOrder: 3 },
  ];

  for (const row of lunasSinMedida) {
    const existing = await prisma.lunaSinMedida.findFirst({
      where: { nombre: row.nombre, sortOrder: row.sortOrder },
    });
    if (!existing) {
      await prisma.lunaSinMedida.create({ data: row });
    }
  }
  console.log("  ✓ Lunas sin medida (3 rows)");

  console.log("\nPOS seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
