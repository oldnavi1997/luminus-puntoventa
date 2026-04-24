import { createRequire } from 'module';
import pg from 'pg';

const require = createRequire(import.meta.url);
const XLSX = require('../node_modules/xlsx/xlsx.js');

// ─── Configuración ────────────────────────────────────────────────────────────
const DB_URL   = 'postgresql://postgres:75207666@localhost:5433/luminus';
const XLS_PATH = 'C:/Users/jmarr/Downloads/stock.xlsx';

// ─── Leer Excel ───────────────────────────────────────────────────────────────
const wb   = XLSX.readFile(XLS_PATH);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

const excelProducts = rows.map(r => ({
  sku:        String(r['COD. PROD.'] ?? '').trim(),
  name:       String(r['PRODUCTO']   ?? '').trim(),
  storePrice: Number(r['PRECIO VENTA S/'] ?? 0),
  stock:      Number(r['STOCK']           ?? 0),
})).filter(r => r.name.length > 0);

console.log(`Excel: ${excelProducts.length} productos leídos`);

// ─── Conectar a DB ────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const { rows: dbProducts } = await client.query(
  `SELECT id, name, slug FROM "Product"`
);
console.log(`DB: ${dbProducts.length} productos totales`);

// ─── Matching ─────────────────────────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatch(excelName, dbList) {
  const normExcel = normalize(excelName);

  const exact = dbList.find(p => normalize(p.name) === normExcel);
  if (exact) return { product: exact, confidence: 'exact' };

  const partial = dbList.filter(p => {
    const normDb = normalize(p.name);
    return normDb.includes(normExcel) || normExcel.includes(normDb);
  });
  if (partial.length === 1) return { product: partial[0], confidence: 'partial' };
  if (partial.length > 1)   return { product: null, confidence: 'ambiguous', candidates: partial };

  return { product: null, confidence: 'none' };
}

// ─── Generar slug único ────────────────────────────────────────────────────────
const usedSlugs = new Set(dbProducts.map(p => p.slug).filter(Boolean));
function makeSlug(name) {
  let base = normalize(name).replace(/\s+/g, '-').substring(0, 80);
  let slug = base;
  let i = 1;
  while (usedSlugs.has(slug)) slug = `${base}-${++i}`;
  usedSlugs.add(slug);
  return slug;
}

// ─── Sincronización ───────────────────────────────────────────────────────────
const results = { updated: [], created: [], ambiguous: [] };

for (const ep of excelProducts) {
  const { product, confidence, candidates } = findMatch(ep.name, dbProducts);

  if (confidence === 'ambiguous') {
    results.ambiguous.push({ excel: ep.name, candidates: candidates.map(c => c.name) });
    continue;
  }

  if (product) {
    await client.query(
      `UPDATE "Product" SET stock = $1, sku = $2, "storePrice" = $3, "updatedAt" = now() WHERE id = $4`,
      [ep.stock, ep.sku || null, ep.storePrice || null, product.id]
    );
    results.updated.push({ excel: ep.name, db: product.name, confidence, stock: ep.stock });
  } else {
    const slug = makeSlug(ep.name);
    await client.query(
      `INSERT INTO "Product" (id, name, slug, price, stock, sku, "storePrice", active, featured, images, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, false, '{}', now(), now())`,
      [ep.name, slug, ep.storePrice || 0, ep.stock, ep.sku || null, ep.storePrice || null]
    );
    results.created.push({ name: ep.name, sku: ep.sku, stock: ep.stock, storePrice: ep.storePrice });
  }
}

await client.end();

// ─── Reporte ─────────────────────────────────────────────────────────────────
console.log('\n═══════════ RESUMEN ═══════════');
console.log(`✅ Actualizados:  ${results.updated.length}`);
console.log(`🆕 Creados:       ${results.created.length}`);
console.log(`⚠️  Ambiguos:     ${results.ambiguous.length}`);

if (results.ambiguous.length) {
  console.log('\n⚠️  Productos con múltiples coincidencias (revisar manualmente):');
  results.ambiguous.forEach(a =>
    console.log(`  Excel: "${a.excel}"\n    DB: ${a.candidates.join(' | ')}`)
  );
}

if (results.created.length) {
  console.log('\n🆕 Productos creados (nuevos en DB):');
  results.created.forEach(p =>
    console.log(`  [${p.sku}] ${p.name} | stock: ${p.stock} | S/ ${p.storePrice}`)
  );
}

console.log('\n✅ Actualizaciones:');
results.updated.slice(0, 30).forEach(u =>
  console.log(`  "${u.excel}" → "${u.db}" [${u.confidence}] stock=${u.stock}`)
);
if (results.updated.length > 30)
  console.log(`  ... y ${results.updated.length - 30} más`);
