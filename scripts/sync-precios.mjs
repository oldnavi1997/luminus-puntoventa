import * as XLSX from '../node_modules/xlsx/xlsx.mjs';
import pg from 'pg';
import { readFileSync } from 'fs';

const DB_URL   = 'postgresql://postgres:75207666@localhost:5433/luminus';
const XLS_PATH = 'C:/Users/jmarr/Downloads/stock.xlsx';

// ─── Leer Excel ───────────────────────────────────────────────────────────────
const wb   = XLSX.read(readFileSync(XLS_PATH));
const ws   = wb.Sheets[wb.SheetNames[0]];
// raw: true → valores numéricos reales de Excel (sin formateo de string)
const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

function parsePrecio(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return isNaN(n) || n <= 0 ? null : n;
}

// Construir mapa SKU → precio (si hay duplicados, tomar el mayor)
const skuPriceMap = new Map();
for (const r of rows) {
  const sku   = String(r['COD. PROD.'] ?? '').trim();
  const precio = parsePrecio(r['PRECIO VENTA S/']);
  if (!sku || precio === null) continue;
  const actual = skuPriceMap.get(sku);
  if (actual === undefined || precio > actual) {
    skuPriceMap.set(sku, precio);
  }
}
console.log(`Excel: ${skuPriceMap.size} SKUs con precio válido`);

// ─── DB ───────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const { rows: dbProducts } = await client.query(
  `SELECT id, name, sku, "storePrice" FROM "Product" WHERE active = true AND sku IS NOT NULL AND sku != ''`
);
console.log(`DB: ${dbProducts.length} productos con SKU`);

// ─── Actualizar ───────────────────────────────────────────────────────────────
let actualizados = 0;
let sinMatchExcel = 0;

for (const p of dbProducts) {
  const precio = skuPriceMap.get(p.sku);
  if (precio === undefined) {
    sinMatchExcel++;
    continue;
  }
  await client.query(
    `UPDATE "Product" SET "storePrice" = $1, "updatedAt" = now() WHERE id = $2`,
    [precio, p.id]
  );
  actualizados++;
}

await client.end();

// ─── Reporte ──────────────────────────────────────────────────────────────────
console.log('\n═══════════════ RESUMEN ═══════════════');
console.log(`✅ Actualizados con precio tienda: ${actualizados}`);
console.log(`❌ SKU sin match en Excel:         ${sinMatchExcel}`);
