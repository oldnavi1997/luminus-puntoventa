import * as XLSX from '../node_modules/xlsx/xlsx.mjs';
import pg from 'pg';
import { readFileSync } from 'fs';

const DB_URL   = 'postgresql://postgres:75207666@localhost:5433/luminus';
const XLS_PATH = 'C:/Users/jmarr/Downloads/stock.xlsx';

// ─── Leer Excel ───────────────────────────────────────────────────────────────
const wb   = XLSX.read(readFileSync(XLS_PATH));
const ws   = wb.Sheets[wb.SheetNames[0]];
// raw:false → valores formateados como string (ej: "1.000" en vez de 1000)
const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

// Parsea números con formato latinoamericano: "1.000" → 1, "2.500" → 2
function parseStock(val) {
  if (val == null || val === '') return 0;
  return Number(String(val).trim().replace(/\./g, '').replace(',', '.')) || 0;
}

const excelProducts = rows.map(r => ({
  sku:   String(r['COD. PROD.'] ?? '').trim(),
  name:  String(r['PRODUCTO']   ?? '').trim(),
  stock: parseStock(r['STOCK']),
})).filter(r => r.name);

console.log(`Excel: ${excelProducts.length} productos`);

// ─── Normalización y tokenización ─────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sin tildes
    .replace(/[\/\-_\.]/g, ' ')                          // separadores → espacio
    .replace(/[^a-z0-9\s]/g, '')                         // solo alfanumérico
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(str) {
  return new Set(normalize(str).split(' ').filter(t => t.length > 1));
}

// Similitud Jaccard sobre conjuntos de palabras
function jaccard(a, b) {
  const tA = tokens(a);
  const tB = tokens(b);
  const inter = [...tA].filter(x => tB.has(x)).length;
  const union = new Set([...tA, ...tB]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Conectar y cargar DB ─────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

const { rows: dbProducts } = await client.query(
  `SELECT id, name, sku, stock, "stockAlmacen", "stockTienda", slug FROM "Product" WHERE active = true`
);
console.log(`DB local: ${dbProducts.length} productos\n`);

// ─── Matching ─────────────────────────────────────────────────────────────────
const THRESHOLD_EXACT    = 1.0;   // coincidencia perfecta de palabras
const THRESHOLD_CONFIDENT = 0.75; // coincidencia alta → usar
const THRESHOLD_POSSIBLE  = 0.50; // coincidencia parcial → reportar

const matched        = [];  // excel ↔ db, score ≥ 0.75 → actualizar
const toCreate       = [];  // sin coincidencia o ambiguos → crear nuevo
const dbNoExcel      = [];  // productos DB sin ninguna coincidencia en Excel → stockAlmacen = 0
const usedDbIds      = new Set();

for (const ep of excelProducts) {
  const scored = dbProducts.map(p => ({
    product: p,
    score: jaccard(ep.name, p.name),
  })).filter(s => s.score >= THRESHOLD_POSSIBLE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Sin coincidencia en DB → crear
    toCreate.push({ excel: ep, reason: 'sin-coincidencia' });
    continue;
  }

  const best = scored[0];
  const rivals = scored.filter(s => s.score >= best.score - 0.05 && s.product.id !== best.product.id);

  if (rivals.length > 0 && best.score < THRESHOLD_EXACT) {
    // Ambiguo → crear igualmente
    toCreate.push({ excel: ep, reason: 'ambiguo' });
    continue;
  }

  if (best.score >= THRESHOLD_CONFIDENT) {
    matched.push({ excel: ep, db: best.product, score: best.score });
    usedDbIds.add(best.product.id);
  } else {
    // score 0.50-0.74 con un solo candidato → crear
    toCreate.push({ excel: ep, reason: 'parcial' });
  }
}

// Productos DB sin ninguna coincidencia Excel → stockAlmacen = 0
for (const p of dbProducts) {
  if (!usedDbIds.has(p.id)) {
    dbNoExcel.push(p);
  }
}

// Generador de slugs únicos (a partir de los slugs ya existentes en DB)
const usedSlugs = new Set(dbProducts.map(p => p.slug).filter(Boolean));
function makeSlug(name) {
  const base = normalize(name).replace(/\s+/g, '-');
  let slug = base;
  let i = 1;
  while (usedSlugs.has(slug)) slug = `${base}-${++i}`;
  usedSlugs.add(slug);
  return slug;
}

// ─── Aplicar cambios ──────────────────────────────────────────────────────────
console.log('Aplicando cambios...');

// 1. Coincidencias: actualizar stockTienda + sku
for (const { excel, db } of matched) {
  await client.query(
    `UPDATE "Product"
     SET "stockTienda" = $1, sku = $2, stock = "stockAlmacen" + $1, "updatedAt" = now()
     WHERE id = $3`,
    [excel.stock, excel.sku || db.sku, db.id]
  );
}

// 2. Sin coincidencia / ambiguos: crear en DB con stockTienda = Excel stock
for (const { excel } of toCreate) {
  const slug = makeSlug(excel.name);
  await client.query(
    `INSERT INTO "Product"
       (id, name, slug, price, stock, "stockTienda", "stockAlmacen", sku, active, featured, images, "trackInventory", "createdAt", "updatedAt")
     VALUES
       (gen_random_uuid(), $1, $2, 0, $3, $3, 0, $4, true, false, '{}', true, now(), now())`,
    [excel.name, slug, excel.stock, excel.sku || null]
  );
}

// 3. Productos DB sin coincidencia en Excel: stockAlmacen = 0
for (const p of dbNoExcel) {
  await client.query(
    `UPDATE "Product" SET "stockAlmacen" = 0, stock = "stockTienda", "updatedAt" = now() WHERE id = $1`,
    [p.id]
  );
}

await client.end();

// ─── Reporte ──────────────────────────────────────────────────────────────────
const ambiguosCreados = toCreate.filter(t => t.reason === 'ambiguo');
const sinMatchCreados = toCreate.filter(t => t.reason === 'sin-coincidencia');

console.log('\n═══════════════ RESUMEN ═══════════════');
console.log(`✅ Coincidencias actualizadas: ${matched.length}`);
console.log(`🆕 Creados (ambiguos):         ${ambiguosCreados.length}`);
console.log(`🆕 Creados (sin coincidencia): ${sinMatchCreados.length}`);
console.log(`❌ DB sin Excel (almacén → 0): ${dbNoExcel.length}`);

console.log('\n✅ COINCIDENCIAS:');
matched.forEach(({ excel, db, score }) => {
  const flag = score === 1 ? '  ' : '~';
  console.log(`${flag} [${(score * 100).toFixed(0)}%] "${excel.name}" → "${db.name}" | stockTienda=${excel.stock}`);
});

console.log('\n🆕 CREADOS (ambiguos):');
ambiguosCreados.forEach(({ excel }) =>
  console.log(`  "${excel.name}" | stockTienda=${excel.stock} | sku=${excel.sku}`)
);

console.log('\n🆕 CREADOS (sin coincidencia):');
sinMatchCreados.forEach(({ excel }) =>
  console.log(`  "${excel.name}" | stockTienda=${excel.stock} | sku=${excel.sku}`)
);
