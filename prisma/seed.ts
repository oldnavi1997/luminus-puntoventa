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
  const adminPassword = await bcrypt.hash("Admin123!", 12);
  await prisma.user.upsert({
    where: { email: "admin@luminus.pe" },
    update: {},
    create: {
      email: "admin@luminus.pe",
      name: "Administrador",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  console.log("  ✓ Admin user: admin@luminus.pe / Admin123!");

  // Cashier user
  const cashierPassword = await bcrypt.hash("Cajero123!", 12);
  await prisma.user.upsert({
    where: { email: "cajero@luminus.pe" },
    update: {},
    create: {
      email: "cajero@luminus.pe",
      name: "Cajero Principal",
      password: cashierPassword,
      role: "CASHIER",
    },
  });

  console.log("  ✓ Cashier user: cajero@luminus.pe / Cajero123!");

  // Supervisor user
  const supervisorPassword = await bcrypt.hash("Super123!", 12);
  await prisma.user.upsert({
    where: { email: "supervisor@luminus.pe" },
    update: {},
    create: {
      email: "supervisor@luminus.pe",
      name: "Supervisor",
      password: supervisorPassword,
      role: "SUPERVISOR",
    },
  });

  console.log("  ✓ Supervisor user: supervisor@luminus.pe / Super123!");
  console.log("\nPOS seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
