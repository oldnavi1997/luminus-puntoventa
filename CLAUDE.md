# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Luminus POS** is a Point of Sale system for an optical/eyeglasses retail store in Peru. It handles sales (BOLETA, FACTURA, NOTA_VENTA), inventory, cash register sessions, optical lens pricing, and electronic invoicing via SUNAT. It shares a PostgreSQL database with the Luminus ecommerce site.

## Critical: Schema is owned by the ecommerce repo

This POS project **shares its Postgres database** with the ecommerce project at `D:\Cursor\luminus`. The canonical `prisma/schema.prisma` lives there. This repo carries a synced copy — never edit `prisma/schema.prisma` here directly.

**Hard rules:**
- **NEVER** run `prisma db push`, `prisma migrate dev`, or `prisma migrate deploy` from this project. They will drop ecommerce tables (already happened once; recovered via Railway backup).
- **NEVER** add schema-modifying commands to `railway.toml` `startCommand`. It must stay as `npm start`.
- All schema changes originate in `D:\Cursor\luminus`. Bring them here via the sync flow below.

**Sync flow:**
- `npm run sync:schema` copies `../luminus/prisma/schema.prisma` into this repo.
- `npm run verify:schema` fails if the two files drift. Falls back to a presence check when the canonical repo is not accessible (e.g. Railway build).
- Hooks: `predev` runs `sync:schema` + `prisma generate`; `prebuild` runs `verify:schema` + `prisma generate`.

**When the ecommerce schema changes:** sync here (`npm run sync:schema`), commit the updated `prisma/schema.prisma`, push.

**The migration must be applied to the production DB by hand, BEFORE this app deploys.** Nothing does it automatically: the ecommerce runs on Vercel with `prisma generate && next build`, which only rebuilds the client. Deploying the POS first means it queries tables that do not exist yet and every affected request fails. See "Applying migrations to production" in `D:\Cursor\luminus\CLAUDE.md`.

### If the user asks to add/modify/drop a table from THIS project

You cannot do schema work from this repo. The full procedure lives in `D:\Cursor\luminus\CLAUDE.md` under "Workflow for schema changes". Summary of what you must do instead:

1. Tell the user the schema change must originate in `D:\Cursor\luminus` (canonical schema owner).
2. Switch to that directory: edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <descriptor>`, build to verify.
3. Come back here: `npm run sync:schema && npx prisma generate`, then implement the feature.
4. Apply the migration to production by hand (`npx prisma migrate deploy` from the ecommerce repo against `DATABASE_URL_PROD`), THEN commit + push both repos. No pipeline applies migrations.

Never edit `prisma/schema.prisma` here directly, never run `prisma migrate`/`db push` from this repo — both break the contract and the second one will drop ecommerce tables.

## Commands

```bash
npm run dev          # Auto-syncs schema, generates client, starts dev server on :3003
npm run build        # Verifies schema, generates client, builds
npm run sync:schema  # Pull canonical schema from ecommerce repo
npm run verify:schema# Fail if local schema differs from canonical
npm start            # Production server
npm run lint         # ESLint

# Seeds (data only — no schema operations)
npx tsx prisma/seed.ts           # Seed users and roles
npx tsx prisma/seed-catalog.ts   # Seed lens catalog
```

No test suite is configured.

## Architecture

### Route Groups (App Router)

- `app/(auth)/login/` — Unauthenticated login page
- `app/(pos)/sesion/` — Open/close POS cash register session (requires auth but no active session)
- `app/(pos)/(requires-session)/` — All POS pages; middleware enforces an open `PosSession`

The session gate is enforced in middleware: users without an active `PosSession` are redirected to `/sesion` to open one before accessing `/pos`, `/caja`, `/inventario`, etc.

### State Management

- `stores/cartStore.ts` — Zustand store for the active shopping cart (product items, customer, payment method, discounts). Persisted to localStorage.
- `stores/sessionStore.ts` — Zustand store for the active `PosSession` ID. Updated on session open/close.

Cart state is not cleared on page navigation; it survives refreshes via Zustand persistence.

### Database (Prisma + PostgreSQL)

The schema is shared with the Luminus ecommerce app. POS-only models:
- `PosSession` — One open session per user at a time; holds totals by payment method
- `SaleDocument` — Issued receipt/invoice with `DocumentType` (BOLETA, FACTURA, NOTA_VENTA)
- `SaleDocumentItem` — Line items; may include lens prescription data
- `DocumentQueue` — Async queue for SUNAT submission (polled by `/api/queue`)
- `Customer` — Linked to sales via DNI/RUC
- `DocumentSerie` — Tracks next correlativo per series+type
- `LensCatalog`, `LunaSinMedida`, `FabricationCost` — Lens pricing models
- `CajaRetiro` — Cash withdrawal records within a session

### Electronic Invoicing (SUNAT) — SEE Del Contribuyente

The POS emits **directly to SUNAT**, with no OSE in between: it builds the UBL 2.1
XML, signs it with the company's own certificate, sends it over SOAP and reads the
CDR. `lib/apisunat.ts` survives **only** for DNI/RUC lookup (`consultarDNI`,
`consultarRUC`); `lib/nubefact.ts` is dead code. Neither emits anything any more.

Module map (`lib/sunat/`):

| File | Role |
|---|---|
| `config.ts` | Env-driven credentials + endpoints. Resolved on first call, never at import, so a build without env vars still succeeds |
| `certificado.ts` | PKCS#12 loader (`.pfx` and `.p12` are the same container — no conversion needed) |
| `calculo.ts` | Money. See the invariant below |
| `ubl/comprobante.ts` | UBL 2.1 for factura + boleta |
| `firma.ts` | XMLDSig enveloped signature |
| `empaquetado.ts` / `cliente-soap.ts` / `cdr.ts` | ZIP, `sendBill`/`sendSummary`/`getStatus` with WSSE, CDR parsing |
| `emitir.ts` | Orchestrator: XML → sign → zip → send → CDR → DB |
| `validacion.ts` | Buyer rules (factura needs RUC; boleta ≥ S/700 needs DNI) |

**Flow.** A BOLETA/FACTURA sale calls `emitirComprobante` synchronously from
`app/api/ventas/route.ts` (and from `.../[id]/convertir`). NOTA_VENTA is internal
and never reaches SUNAT. Every attempt writes a `SunatEnvio` row (XML, hash, CDR,
SUNAT code, observations); `SunatTicket` covers resumen diario / comunicación de baja.

**Invariants that cost real money to rediscover — do not "simplify" these:**

- **The canonicalization algorithm must stay listed explicitly in the signature's
  transform chain** (`firma.ts`). `xml-crypto`'s `getCanonXml` applies only the
  transforms you list and does *not* fall back to `canonicalizationAlgorithm`. With
  only the enveloped transform, the digest is computed over the raw DOM
  serialization while SUNAT canonicalizes per spec — every document is rejected for
  an invalid signature.
- **IGV is derived by subtraction** (`importe − valorVenta`), never by multiplying.
  That makes each line reconcile with itself and the declared total match the amount
  actually charged, to the cent. The global discount is prorated across lines rather
  than declared as a document-level `AllowanceCharge`.
- **`REJECTED` means SUNAT evaluated the document and refused it.** Anything else —
  bad SOL permissions, missing env var, certificate, network, malformed envelope —
  is `SEND_ERROR`, because SUNAT never registered it and **the correlativo is still
  usable**. Marking those `REJECTED` burns a live number and lies about what happened.
- **`emitirComprobante` refuses to re-send a document that already has an accepted
  envío.** Re-emitting over an accepted comprobante is the most expensive mistake to
  undo with SUNAT.
- **The `SunatEnvio` row is created *before* sending**, so a mid-flight failure still
  leaves evidence of what went out.

**Things the official SUNAT PDF guide gets wrong** (it is an older revision; all
three were found by getting rejected in beta, and are locked down by tests in
`tests/sunat/comprobante.test.ts`):

- `1008` — the issuer RUC goes in `cac:PartyIdentification/cbc:ID`, *not* in
  `cac:PartyTaxScheme/cbc:CompanyID`.
- `3205` — the operation type is read from `cbc:InvoiceTypeCode/@listID`, not from
  `cbc:ProfileID`.
- `3244` — `cac:PaymentTerms` is mandatory on facturas (RS 193-2020).
- Plus `4252`/`4255`/`4256`: `@listName` wants the short names (`Tipo de Documento`,
  `Tipo de Precio`, `Afectacion del IGV`) and `TaxScheme/cbc:ID` wants
  `schemeAgencyID="6"`, not `schemeName`/`schemeAgencyName`.

**Queue.** `DocumentQueue` only holds **transient** failures (timeouts, network). A
validator rejection or incomplete buyer data would fail identically on retry, so
those wait for correction instead. Drained by `POST /api/queue/process`, which
accepts either an ADMIN session or `Authorization: Bearer $QUEUE_SECRET`.
**No cron is configured yet** — nothing drains it on a schedule. (For years the
endpoint only accepted a session, so no cron *could* call it and the queue never
drained at all.)

**Not implemented yet:** voiding. `app/api/ventas/[id]/anular` returns **501** for
self-emitted documents — ApiSunat cannot void what it never issued, and letting it
try would mark the document `VOIDED` locally while SUNAT still considers it valid.
Needs comunicación de baja (facturas) and resumen de anulación (boletas).

**Tooling.** `npm test` (vitest), `npm run sunat:cert` (verify the certificate),
`npm run sunat:b64` (encode it for Railway), `npm run sunat:enviar` (send a test
document), and `GET /api/sunat/estado` (diagnose a deployment without emitting).

### Authentication

NextAuth v4 with credentials provider (`lib/auth.ts`). Only `ADMIN` and `CASHIER` roles can access the POS. The JWT session includes `posSessionId` (current open session). `USER` role is for ecommerce only.

### Key Utilities

- `lib/lens-calc.ts` + `lib/calculador-lunas/` — Optical prescription calculation logic
- `lib/sunat.ts` — XML generation helpers for SUNAT documents
- `scripts/` — One-off utility scripts (stock sync, price sync, reconciliation reports) run with `node scripts/<file>.mjs`

## Environment Variables

Copy `.env.example` to `.env.local`. Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | JWT secret (unique per env) |
| `NEXTAUTH_URL` | Full base URL (e.g. `http://localhost:3003`) |
| `SUNAT_RUC`, `SUNAT_RAZON_SOCIAL` | Issuer identity |
| `SUNAT_DIRECCION`, `SUNAT_UBIGEO`, `SUNAT_DISTRITO`… | Fiscal address for the UBL issuer block |
| `SUNAT_ENV` | `beta` or `produccion`. **`beta` documents have no tax validity** |
| `SUNAT_SOL_USER`, `SUNAT_SOL_PASSWORD` | SOL user, **without the RUC prefix** — it is prepended when building the WSSE envelope. The user needs the *send electronic comprobantes* permission or SUNAT answers `0111` |
| `SUNAT_CERTIFICATE_B64` | The `.p12`/`.pfx` as base64. Railway's filesystem is ephemeral, so a path will not survive; `SUNAT_CERTIFICATE_PATH` exists for local dev only |
| `SUNAT_CERTIFICATE_PASSWORD` | Certificate password |
| `QUEUE_SECRET` | Bearer token so a cron can drain the queue |
| `APISUNAT_TOKEN`, `APISUNAT_BASE_URL` | DNI/RUC lookup only — no longer used to emit |

Dev database: `postgresql://postgres:75207666@localhost:5433/luminus` (shared with ecommerce, port 5433).

## Deployment (Railway)

`railway.toml`:
1. Build: `npm ci && npx prisma generate && npm run build`
2. Deploy: `npm start`

**No schema operations on Railway from this service.** The canonical schema belongs to the ecommerce repo, and its migrations are applied manually against the production DB — not by any deploy pipeline.

Catalog seeds are NOT auto-run on each deploy anymore — run `npx tsx prisma/seed-catalog.ts` manually as a Railway one-off job if `lens_catalog` ever needs reseeding.

## Key Design Decisions

- **Tailwind v4** with the new `@theme` syntax — no `tailwind.config.ts` theme extension needed; CSS variables are defined in `globals.css`.
- **Payment methods**: EFECTIVO, TARJETA, YAPE, MIXTO. Mixed payments split the total across methods; `SaleDocument` stores individual amounts per method.
- **Stock locations**: Products track `stockTienda` (showroom) and `stockAlmacen` (warehouse) separately. Sales deduct from `stockTienda`. `stock` is the total (tienda + almacén), so only `INGRESO` moves it — transfers just relocate units already counted.
- **Stock movements**: `TipoMovimientoStock` is INGRESO (new stock into the warehouse), TRASLADO (almacén → tienda) and RETORNO (tienda → almacén). The column matrix lives only in `lib/stock-movimiento.ts` (`dataDe`, `whereConStock`) — routes send a tipo and a quantity, never a column. The stock check rides inside the update's `where`, so two concurrent movements can't drive a product negative (there is no `CHECK >= 0` in the DB); a failed match surfaces as P2025 → 409. Every movement writes a `StockMovimiento` row with the resulting balances, listed by `GET /api/productos/movimientos`.
- **Document series**: Each `DocumentType` + series letter has its own `DocumentSerie` row with an auto-incrementing correlativo. Never set manually—always use the DB sequence.
- **Timezone**: All dates use Lima/Peru timezone (`America/Lima`, UTC-5). Use `toLocaleString('es-PE', { timeZone: 'America/Lima' })` for display.
