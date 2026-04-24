import * as XLSX from '../node_modules/xlsx/xlsx.mjs';
import pg from 'pg';
import { readFileSync, writeFileSync } from 'fs';

const DB_URL   = 'postgresql://postgres:75207666@localhost:5433/luminus';
const XLS_PATH = 'C:/Users/jmarr/Downloads/stock.xlsx';
const OUT_PATH = 'C:/Users/jmarr/Downloads/reporte-sync-final.xlsx';

// ─── Leer Excel ───────────────────────────────────────────────────────────────
const wb   = XLSX.read(readFileSync(XLS_PATH));
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

function parseStock(val) {
  if (val == null || val === '') return 0;
  return Number(String(val).trim().replace(/\./g, '').replace(',', '.')) || 0;
}

const excelProducts = rows.map(r => ({
  sku:   String(r['COD. PROD.'] ?? '').trim(),
  name:  String(r['PRODUCTO']   ?? '').trim(),
  stock: parseStock(r['STOCK']),
})).filter(r => r.name);

// ─── Conectar DB ──────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
const { rows: dbProducts } = await client.query(
  `SELECT id, name, sku, stock, "stockTienda", "stockAlmacen" FROM "Product" WHERE active = true`
);
await client.end();

console.log(`Excel: ${excelProducts.length} | DB: ${dbProducts.length}`);

// ─── Matching ─────────────────────────────────────────────────────────────────
function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\/\-_\.]/g, ' ').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
function tokens(str) { return new Set(normalize(str).split(' ').filter(t => t.length > 1)); }
function jaccard(a, b) {
  const tA = tokens(a), tB = tokens(b);
  const inter = [...tA].filter(x => tB.has(x)).length;
  const union = new Set([...tA, ...tB]).size;
  return union === 0 ? 0 : inter / union;
}

// Mapa nombre→producto para lookup rápido exacto
const dbByName = new Map(dbProducts.map(p => [p.name, p]));

const excelRows  = [];  // hoja 1: todos los productos Excel
const usedDbIds  = new Set();

for (const ep of excelProducts) {
  // Buscar el mejor match en DB (excluyendo coincidencia exacta de string)
  const scored = dbProducts
    .filter(p => p.name !== ep.name)  // ignorar exactos — los manejamos aparte
    .map(p => ({ product: p, score: jaccard(ep.name, p.name) }))
    .filter(s => s.score >= 0.50)
    .sort((a, b) => b.score - a.score);

  const best   = scored[0];
  const rivals = scored.length > 0
    ? scored.filter(s => s.score >= best.score - 0.05 && s.product.id !== best.product.id)
    : [];

  const exactDb = dbByName.get(ep.name);

  let estado, dbNombre, dbSkuAnterior, similitud;

  if (exactDb) {
    // Nombre idéntico en DB — fue actualizado (match exacto original) o creado
    usedDbIds.add(exactDb.id);
    estado        = 'Exacto';
    dbNombre      = exactDb.name;
    dbSkuAnterior = exactDb.sku ?? '';
    similitud     = 100;
  } else if (best && rivals.length === 0 && best.score >= 0.75) {
    // Match aproximado confiado — producto original con nombre similar actualizado
    usedDbIds.add(best.product.id);
    estado        = 'Actualizado (nombre aproximado)';
    dbNombre      = best.product.name;
    dbSkuAnterior = best.product.sku ?? '';
    similitud     = Math.round(best.score * 100);
  } else if (best && rivals.length > 0) {
    // Ambiguo — fue creado con nombre exacto del Excel
    const created = dbByName.get(ep.name);
    if (created) usedDbIds.add(created.id);
    estado        = 'Creado (era ambiguo)';
    dbNombre      = [best.product.name, ...rivals.map(r => r.product.name)].slice(0, 3).join(' | ');
    dbSkuAnterior = '';
    similitud     = Math.round(best.score * 100);
  } else if (best && best.score < 0.75) {
    // Parcial sin confianza — fue creado
    const created = dbByName.get(ep.name);
    if (created) usedDbIds.add(created.id);
    estado        = 'Creado (similitud baja)';
    dbNombre      = best.product.name;
    dbSkuAnterior = '';
    similitud     = Math.round(best.score * 100);
  } else {
    // Sin similitud alguna — fue creado
    const created = dbByName.get(ep.name);
    if (created) usedDbIds.add(created.id);
    estado        = 'Creado (sin coincidencia)';
    dbNombre      = '';
    dbSkuAnterior = '';
    similitud     = 0;
  }

  // Buscar el producto en DB para mostrar su stock actual
  const dbProd = exactDb ?? (best?.product);
  excelRows.push({
    'Excel - Nombre':       ep.name,
    'Excel - SKU':          ep.sku,
    'Excel - Stock':        ep.stock,
    'Estado':               estado,
    'DB - Nombre':          dbNombre,
    'DB - SKU anterior':    dbSkuAnterior,
    'Similitud %':          similitud || '',
    'Stock Tienda actual':  dbProd?.stockTienda ?? ep.stock,
    'Stock Almacén actual': dbProd?.stockAlmacen ?? 0,
  });
}

// DB sin ninguna coincidencia Excel
const dbSinExcelRows = dbProducts
  .filter(p => !usedDbIds.has(p.id))
  .map(p => ({
    'DB - Nombre':        p.name,
    'DB - SKU':           p.sku ?? '',
    'Stock Tienda':       p.stockTienda,
    'Stock Almacén (→0)': p.stockAlmacen,
    'Nota':               'Sin coincidencia en Excel — stockAlmacen puesto a 0',
  }));

// ─── Estadísticas ─────────────────────────────────────────────────────────────
const byEstado = {};
excelRows.forEach(r => { byEstado[r['Estado']] = (byEstado[r['Estado']] ?? 0) + 1; });

// ─── Escribir Excel ───────────────────────────────────────────────────────────
const outWb = XLSX.utils.book_new();

function addSheet(name, data, widths) {
  const sheet = XLSX.utils.json_to_sheet(data.length ? data : [{ '(sin datos)': '' }]);
  sheet['!cols'] = widths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(outWb, sheet, name);
}

addSheet('📋 Todos los productos Excel', excelRows,
  [40, 10, 12, 30, 40, 14, 12, 16, 16]);

addSheet(`❌ DB sin Excel (${dbSinExcelRows.length})`, dbSinExcelRows,
  [40, 14, 14, 18, 50]);

const buf = XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(OUT_PATH, buf);

console.log(`\n✅ Reporte: ${OUT_PATH}`);
Object.entries(byEstado).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
console.log(`   ❌ DB sin Excel: ${dbSinExcelRows.length}`);
