import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding catalog data...");

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

  const tarifasLuna = [
    // Esfera 0 – 2
    { id:  1, esfMin: 0.00, esfMax: 2.00, cilMin: 0.00, cilMax: 2.00, poli: 47.5, foto: 62.5 },
    { id:  2, esfMin: 0.00, esfMax: 2.00, cilMin: 2.25, cilMax: 3.99, poli: 57.5, foto: 62.5 },
    { id:  3, esfMin: 0.00, esfMax: 2.00, cilMin: 4.00, cilMax: 4.99, poli: 62.5, foto: 70.0 },
    { id:  4, esfMin: 0.00, esfMax: 2.00, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 75.0 },
    { id:  5, esfMin: 0.00, esfMax: 2.00, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 75.0 },
    // Esfera 2.25 – 3.99
    { id:  6, esfMin: 2.25, esfMax: 3.00, cilMin: 0.00, cilMax: 2.00, poli: 57.5, foto: 60.0 },
    { id:  7, esfMin: 2.25, esfMax: 3.99, cilMin: 2.25, cilMax: 3.99, poli: 57.5, foto: 65.0 },
    { id:  8, esfMin: 2.25, esfMax: 3.99, cilMin: 4.00, cilMax: 4.99, poli: 62.5, foto: 65.0 },
    { id:  9, esfMin: 3.00, esfMax: 3.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
    { id: 10, esfMin: 3.00, esfMax: 3.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 70.0 },
    // Esfera 4 – 4.99
    { id: 11, esfMin: 4.00, esfMax: 4.99, cilMin: 0.00, cilMax: 2.00, poli: 67.5, foto: 70.0 },
    { id: 12, esfMin: 4.00, esfMax: 4.99, cilMin: 2.25, cilMax: 3.99, poli: 67.5, foto: 70.0 },
    { id: 13, esfMin: 4.00, esfMax: 4.99, cilMin: 4.00, cilMax: 4.99, poli: 62.5, foto: 70.0 },
    { id: 14, esfMin: 4.00, esfMax: 4.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
    { id: 15, esfMin: 4.00, esfMax: 4.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 75.0 },
    // Esfera 5 – 5.99
    { id: 16, esfMin: 5.00, esfMax: 5.99, cilMin: 0.00, cilMax: 2.00, poli: 67.5, foto: 70.0 },
    { id: 17, esfMin: 5.00, esfMax: 5.99, cilMin: 2.25, cilMax: 3.99, poli: 67.5, foto: 70.0 },
    { id: 18, esfMin: 5.00, esfMax: 5.99, cilMin: 4.00, cilMax: 4.99, poli: 67.5, foto: 70.0 },
    { id: 19, esfMin: 5.00, esfMax: 5.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
    { id: 20, esfMin: 5.00, esfMax: 5.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 70.0 },
    // Esfera 6 – 6.99
    { id: 21, esfMin: 6.00, esfMax: 6.99, cilMin: 0.00, cilMax: 2.00, poli: 67.5, foto: 70.0 },
    { id: 22, esfMin: 6.00, esfMax: 6.99, cilMin: 2.25, cilMax: 3.99, poli: 67.5, foto: 70.0 },
    { id: 23, esfMin: 6.00, esfMax: 6.99, cilMin: 4.00, cilMax: 4.99, poli: 67.5, foto: 70.0 },
    { id: 24, esfMin: 6.00, esfMax: 6.99, cilMin: 5.00, cilMax: 5.99, poli: 67.5, foto: 70.0 },
    { id: 25, esfMin: 6.00, esfMax: 6.99, cilMin: 6.00, cilMax: 6.99, poli: 67.5, foto: 70.0 },
  ];

  for (const row of tarifasLuna) {
    await prisma.tarifaLuna.upsert({
      where: { id: row.id },
      update: {},
      create: row,
    });
  }
  console.log("  ✓ Tarifas luna (25 filas)");

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

  console.log("Catalog seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
