import * as XLSX from '../node_modules/xlsx/xlsx.mjs';
import pg from 'pg';
import { readFileSync, writeFileSync } from 'fs';

const DB_URL   = 'postgresql://postgres:75207666@localhost:5433/luminus';
const XLS_PATH = 'C:/Users/jmarr/Downloads/stock.xlsx';
const OUT_PATH = 'C:/Users/jmarr/Downloads/cuadre-productos.xlsx';

// ─── Leer Excel ───────────────────────────────────────────────────────────────
const wb   = XLSX.read(readFileSync(XLS_PATH));
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });

function parseStock(val) {
  return Number(String(val ?? '').trim().replace(/\./g, '').replace(',', '.')) || 0;
}
const excelProducts = rows.map(r => ({
  sku:   String(r['COD. PROD.'] ?? '').trim(),
  name:  String(r['PRODUCTO']   ?? '').trim(),
  stock: parseStock(r['STOCK']),
})).filter(r => r.name);

// ─── DB ───────────────────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
const { rows: dbAll } = await client.query(
  `SELECT id, name, sku, stock, "stockTienda", "stockAlmacen", "createdAt", "updatedAt"
   FROM "Product" WHERE active = true ORDER BY name`
);

// Productos originales = existían ANTES del sync de hoy
// Productos nuevos = creados HOY por el sync
const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const dbOriginales = dbAll.filter(p => new Date(p.createdAt) < hoy);
const dbNuevos     = dbAll.filter(p => new Date(p.createdAt) >= hoy);

await client.end();

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

const dbOriginalesByName = new Map(dbOriginales.map(p => [p.name, p]));
const dbNuevosByName     = new Map(dbNuevos.map(p => [p.name, p]));
const usedDbIds          = new Set();

// Clasificar cada producto Excel
const actualizados = [];  // Excel matcheó producto original con nombre distinto
const exactosOrig  = [];  // Excel matcheó producto original con nombre idéntico
const creados      = [];  // Excel fue creado como producto nuevo hoy

for (const ep of excelProducts) {
  // ¿Existe como producto nuevo (creado hoy)?
  if (dbNuevosByName.has(ep.name)) {
    const db = dbNuevosByName.get(ep.name);
    usedDbIds.add(db.id);
    creados.push({ excel: ep, db });
    continue;
  }
  // ¿Existe como producto original con nombre exacto?
  if (dbOriginalesByName.has(ep.name)) {
    const db = dbOriginalesByName.get(ep.name);
    usedDbIds.add(db.id);
    exactosOrig.push({ excel: ep, db });
    continue;
  }
  // Buscar match aproximado entre originales
  const scored = dbOriginales
    .map(p => ({ product: p, score: jaccard(ep.name, p.name) }))
    .filter(s => s.score >= 0.75)
    .sort((a, b) => b.score - a.score);
  const best   = scored[0];
  const rivals = scored.filter(s => s.score >= (best?.score ?? 0) - 0.05 && s.product.id !== best?.product.id);
  if (best && rivals.length === 0) {
    usedDbIds.add(best.product.id);
    actualizados.push({ excel: ep, db: best.product, score: best.score });
  } else {
    creados.push({ excel: ep, db: dbNuevosByName.get(ep.name) ?? null });
  }
}

// DB originales sin ningún Excel
const sinExcel = dbOriginales.filter(p => !usedDbIds.has(p.id));

// ─── Hojas ────────────────────────────────────────────────────────────────────

// Hoja 1: Resumen
const resumenRows = [
  { Concepto: '── EXCEL ──────────────────────────────', Cantidad: '' },
  { Concepto: 'Productos en la hoja Excel',              Cantidad: excelProducts.length },
  { Concepto: '  → Actualizaron DB (nombre similar)',    Cantidad: actualizados.length },
  { Concepto: '  → Ya existían en DB (nombre exacto)',   Cantidad: exactosOrig.length },
  { Concepto: '  → Creados nuevos en DB',                Cantidad: creados.length },
  { Concepto: '  TOTAL Excel procesados',                Cantidad: actualizados.length + exactosOrig.length + creados.length },
  { Concepto: '', Cantidad: '' },
  { Concepto: '── BASE DE DATOS ───────────────────────', Cantidad: '' },
  { Concepto: 'DB original (antes del sync)',            Cantidad: dbOriginales.length },
  { Concepto: '  + Creados hoy desde Excel',             Cantidad: dbNuevos.length },
  { Concepto: '  = DB total ahora',                      Cantidad: dbAll.length },
  { Concepto: '', Cantidad: '' },
  { Concepto: '── STOCK ──────────────────────────────', Cantidad: '' },
  { Concepto: 'Con stock Tienda > 0',                    Cantidad: dbAll.filter(p => p.stockTienda > 0).length },
  { Concepto: 'Con stock Almacén > 0',                   Cantidad: dbAll.filter(p => p.stockAlmacen > 0).length },
  { Concepto: 'Sin stock (tienda=0 y almacén=0)',        Cantidad: dbAll.filter(p => p.stockTienda <= 0 && p.stockAlmacen <= 0).length },
  { Concepto: 'Stock negativo (Lunas/servicios vendidos)',Cantidad: dbAll.filter(p => p.stockTienda < 0).length },
  { Concepto: '', Cantidad: '' },
  { Concepto: '── ORIGINALES SIN EXCEL ────────────────', Cantidad: '' },
  { Concepto: 'DB originales sin match en Excel',        Cantidad: sinExcel.length },
  { Concepto: '  (stockAlmacén puesto a 0)',             Cantidad: '' },
];

// Hoja 2: Actualizados (Excel → DB nombre distinto)
const actualizadosRows = actualizados.map(({ excel, db, score }) => ({
  'Excel - Nombre':       excel.name,
  'Excel - SKU':          excel.sku,
  'Excel - Stock':        excel.stock,
  'DB - Nombre (web)':    db.name,
  'DB - SKU anterior':    db.sku ?? '',
  'Similitud %':          Math.round(score * 100),
  'Stock Tienda actual':  db.stockTienda,
  'Stock Almacén actual': db.stockAlmacen,
}));

// Hoja 3: Creados desde Excel
const creadosRows = creados.map(({ excel, db }) => ({
  'Nombre':              excel.name,
  'SKU':                 excel.sku,
  'Stock Tienda':        excel.stock,
  'Stock Almacén':       0,
  'En DB':               db ? 'Sí' : 'No encontrado',
  'Stock Tienda en DB':  db?.stockTienda ?? '',
}));

// Hoja 4: DB sin Excel
const sinExcelRows = sinExcel.map(p => ({
  'DB - Nombre':         p.name,
  'DB - SKU':            p.sku ?? '',
  'Stock Tienda':        p.stockTienda,
  'Stock Almacén (→0)':  p.stockAlmacen,
  'Nota':                'Sin match en Excel — solo existe en ecommerce',
}));

// ─── Escribir ─────────────────────────────────────────────────────────────────
const outWb = XLSX.utils.book_new();

function addSheet(name, data, widths) {
  const sheet = XLSX.utils.json_to_sheet(data.length ? data : [{ '(vacío)': '' }]);
  sheet['!cols'] = widths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(outWb, sheet, name);
}

// Hoja 3b: Exactos originales
const exactosRows = exactosOrig.map(({ excel, db }) => ({
  'Nombre':              excel.name,
  'SKU Excel':           excel.sku,
  'Stock Tienda':        db.stockTienda,
  'Stock Almacén':       db.stockAlmacen,
  'Nota':                'Nombre idéntico — producto original actualizado',
}));

addSheet('📊 Resumen', resumenRows, [50, 12]);
addSheet(`🔄 Actualizados nombre~ (${actualizados.length})`, actualizadosRows, [40, 10, 12, 40, 14, 12, 16, 16]);
addSheet(`✅ Exactos originales (${exactosOrig.length})`, exactosRows, [40, 12, 14, 14, 40]);
addSheet(`🆕 Creados nuevos (${creados.length})`, creadosRows, [40, 10, 12, 14, 14, 16]);
addSheet(`❌ DB sin Excel (${sinExcel.length})`, sinExcelRows, [40, 14, 14, 16, 40]);

writeFileSync(OUT_PATH, XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' }));

console.log(`✅ ${OUT_PATH}`);
console.log(`   Excel total:          ${excelProducts.length}`);
console.log(`   Actualizados (nombre~): ${actualizados.length}`);
console.log(`   Exactos originales:   ${exactosOrig.length}`);
console.log(`   Creados nuevos:       ${creados.length}`);
console.log(`   ─ suma:               ${actualizados.length + exactosOrig.length + creados.length}`);
console.log(`   DB original:          ${dbOriginales.length}`);
console.log(`   DB creados hoy:       ${dbNuevos.length}`);
console.log(`   DB total:             ${dbAll.length}`);
console.log(`   DB sin Excel:         ${sinExcel.length}`);
