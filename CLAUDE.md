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
- `app/(pos)/(requires-session)/anulados/` — ADMIN-only history of voided sales

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
It is also drained automatically: `instrumentation.ts` starts an in-process
interval (5 min in production, off in dev; `QUEUE_DRAIN_INTERVAL_MS` overrides,
`0` disables). Railway runs a persistent Node process, so this needs no external
cron service and no secret that can expire. (For years the endpoint only accepted
a session, so no cron *could* call it and the queue never drained at all.)

**SUNAT rejects calls that arrive back to back**, with an HTTP `401` from its nginx
gateway — an HTML page, not a SOAP envelope, which is how it is told apart from a real
credential problem (those come back as fault `0111`). Verified in beta: two `sendBill`
in a row fail the second and third; half a second between them and both pass. So
`cliente-soap.ts` serializes every call and leaves `SUNAT_PAUSA_LLAMADAS_MS` (default
1200 ms) between them, and retries a gateway 401 twice. This is not a nicety: before it,
`processQueue` — which drains up to ten documents in a loop — placed only the first of
each pass and pushed the rest back into the queue as if SUNAT had never answered. The
pause is env-driven so the tests, where `fetch` is stubbed and there is no gateway, can
set it to `0`.

**Voiding, verified against beta on 2026-08-21** (`npm run sunat:probar-anulacion`):

- A boleta reported **individually** through `sendBill` *can* be voided with an `RC`
  carrying `cac:Status/cbc:ConditionCode = 3`. This was the open question that decided
  whether the boleta path was viable at all; it is.
- A factura is voided with an `RA` (`VoidedDocuments`). Both were accepted, code `0`.
- **The CDR of an RA/RC carries exactly one `DocumentResponse`, and its reference is the
  RA/RC’s own ID — not the voided comprobante.** So looking the response up by the
  comprobante number never matches; `lineaPara` falls back to the single response, which
  is why one document per RA/RC is the right granularity. Batching several would leave
  no way to tell which line SUNAT answered about.
- `idRespuesta` in the CDR is the ticket number.
- **A ticket is single use.** A second `getStatus` on a resolved ticket answers `0127`
  with content that is not a ZIP. The CDR has to be persisted the first time it is read;
  there is no asking again.
- Both tickets resolved on the first poll, ~3 s after sending. `98` (in process) exists
  and has to be handled, but the common case is fast.

**Voiding.** A factura is voided with a **comunicación de baja** (`RA`,
`ubl/baja.ts`) and a boleta with a **resumen de anulación** (`RC` with
`cac:Status/cbc:ConditionCode = 3`, `ubl/resumen.ts`). `anular.ts` orchestrates it the
way `emitir.ts` orchestrates emission — validate before writing anything, record before
sending — but it ends differently: `sendSummary` returns a **ticket**, not a CDR, so the
document is left in `VOID_PENDING`, the route answers **202**, and `tickets.ts` closes it
when SUNAT replies.

Four things about it that are not obvious:

- **Voiding undoes the whole sale.** The stock goes back, the cash session is debited and,
  if the comprobante came from converting a nota de venta, the nota is voided with it. In
  the usual POS flow the movement belongs to the *nota* — converting deducts nothing — so
  `documentoConElMovimiento` decides which of the two to revert against. Reverting against
  the comprobante would return nothing; reverting without touching the nota would leave it
  claiming stock that already came back.
- **The reversal only happens once SUNAT confirms**, inside the same transaction that marks
  the document `VOIDED`. Reverting when the baja is *requested* and having it rejected would
  need a compensating write that can fail too.
- **The daily correlativo of RA/RC is the `SunatTicket` table itself**, through its
  `@@unique([tipo, fechaReferencia, correlativo])` — the same space SUNAT makes unique. The
  number lives *inside* the signed XML, so a collision means rebuilding and **re-signing**,
  which is why `crearTicketConCorrelativo` takes a callback. Unlike a comprobante, a burnt
  RA/RC number costs nothing: summaries carry no gap-free obligation.
- **`fechaReferencia` holds the day the RA/RC was generated**, not the day the voided
  comprobante was issued, despite what the schema comment says. That is the field SUNAT
  makes unique; storing anything else would let two RA generated today both claim number 1.

A comprobante issued by the previous provider (no `SunatEnvio` of its own) still goes
through ApiSunat. That branch can be deleted once none is left within the 7-day window.

**Notas de crédito are still not implemented.** Past the deadline the baja is refused with
a message pointing at SEE-SOL, because a nota de crédito is the only valid correction then.

**Tooling.** `npm test` (vitest), `npm run sunat:cert` (verify the certificate),
`npm run sunat:b64` (encode it for Railway), `npm run sunat:enviar` (send a test
document), `npm run sunat:serie` (ask SUNAT which correlativos of a series are
already taken — see below), `npm run sunat:baja <fullNumber>` (build and sign the
anulación of a real comprobante and print it, writing and sending nothing),
`npm run sunat:probar-anulacion` (emit and void throwaway documents against beta;
it refuses to run outside beta), and `GET /api/sunat/estado` (diagnose a deployment
without emitting).

### Where this stands (last touched 2026-08-21)

**Direct emission to SUNAT works, for both document types.** `B001-00000053` was the
first comprobante this POS ever got through by itself and `F001-00000028` the first
factura — both accepted on 2026-08-21 (code `0`, CDR stored). The SOL user is
`WENDY210`, `SUNAT_ENV=produccion`, certificate valid until 2027-08-19. Queue empty,
nothing in `SEND_ERROR`.

Counters were realigned by hand with what the previous billing provider left behind:
`B001` at 53, `F001` at **28**, `NV001` at 251. The `27` that `F001` continued from came
from the last PDF the owner still had — the same reasoning that cost three correlativos
on `B001` — but this time it was right: `F001-00000028` was accepted on the first
attempt and no number was lost. That factura was later voided (see below), so `F001` continues at `29`.

**Issue a factura as a conversion of a nota de venta, not as a direct FACTURA sale.**
That is how the first one was done, and the asymmetry on rejection is the reason. A
direct sale has already moved stock and cash by the time SUNAT answers, and the
rejected `SaleDocument` cannot be deleted (`DELETE /api/ventas/[id]` → 409 once a
`SunatEnvio` exists), so each retry needs a *second* sale that moves both again and
leaves a phantom behind. A conversion moves neither — the nota did that once — and a
`REJECTED` conversion is explicitly allowed to be redone, with the nota reappearing in
`/api/ventas/convertibles`. Retrying costs the correlativo and nothing else.

That run also exercised the **single-conversion guard through the running app** for the
first time; until then it had only been checked by tests and by replaying its queries
against production data.

**A factura with no buyer address is accepted** — verified in beta (`F001-90`, code `0`,
no observations). `ConvertirView` sends only `docType`/`docNumber`/`name`, so every
converted factura goes out with no `cac:RegistrationAddress`, unlike the earlier beta
run that had one.

**Voiding works in production.** `F001-00000028` — the first factura this POS ever issued —
was voided on 2026-08-21 with a comunicación de baja (ticket `202621682357685`). SUNAT
accepted it and shows it as voided in SEE-SOL, and the POS closed the loop by itself: the
document went `VOID_PENDING → VOIDED` when the poller picked up the ticket, and the cascade
ran on real data — the nota de venta it had been converted from was voided with it, the
stock went back and the cash session was debited.

That leaves the whole circuit exercised in production: issue a boleta, issue a factura,
void a factura. Only the boleta path (`RC` with `ConditionCode 3`) is still beta-only,
though it is the same code and the same transport.

**Never emit a comprobante just to test a baja.** The correlativo is spent either way and it
declares a sale that never happened. Wait for one that genuinely has to be voided.

**A voided correlativo does not come back.** `F001-00000028` is spent for good: reusing it
answers `1032` ("reported and then voided"). The series continues at `F001-00000029`.

**Still open:** notas de crédito, which is what the law asks for once the 7-day window has
passed; today the POS refuses and points at SEE-SOL. And `npm run sunat:serie` has still
never run against production — `.env.sunat-prod` misses `SUNAT_SOL_PASSWORD`, and the SOL
user has never exercised the *consultar validez de CPE* permission. It stays the right tool
before touching a counter; it simply was not needed this time.

**The 7-day deadline is from memory** (`DIAS_PLAZO_BAJA` in `lib/sunat/plazos.ts`). It is in
one place with the citation in the comment, but it is worth having the accountant confirm it
against the current resolution; if it differs between factura and boleta the constant splits
in two and the design already supports it.

### Authentication

NextAuth v4 with credentials provider (`lib/auth.ts`). Only `ADMIN` and `CASHIER` roles can access the POS. The JWT session includes `posSessionId` (current open session). `USER` role is for ecommerce only.

### Printed representation (`lib/impresion/`)

The ticket and the A4 PDF are two renderings of **one** thing. `cargar.ts` reads the sale,
`armar.ts` turns it into a `RepresentacionImpresa`, and both the 80 mm ticket
(`components/pos/Receipt.tsx`) and the PDF (`pdf/documento.ts`) just paint it. Endpoints:
`GET /api/ventas/[id]/impresion` (JSON, for the ticket), `/pdf` (A4, `?descargar=1` to force
a download) and `/xml` (the signed XML, `?cdr=1` for the CDR). All behind the session.

What earns its keep here, in rough order of how expensive it would be to rediscover:

- **`armar.ts` is pure on purpose** — no `prisma`, no `qrcode`, no `fs`, no `getConfigSunat`.
  Everything that decides what a comprobante says can be tested without a database, which
  matters because this project mocks Prisma nowhere. Only `cargar.ts` touches the DB.
- **`emisor.ts` must not use `getConfigSunat()`.** That function builds
  `certificado: { pfx: cargarPfx() }` inside the same memoised object, so it *throws* when the
  certificate is missing or unreadable. Taking the RUC from there would tie reprinting old,
  already-accepted comprobantes to the state of the certificate — exactly when it is most
  needed. It reads the same env vars directly instead.
- **Amounts come from `calcularComprobante` with the same arguments `emitir.ts` uses.** It is
  deterministic, so the paper reconciles with the XML by construction, global discount
  proration included. `cargar.ts` also cross-checks against `importesDelXml` of the stored
  envío; a mismatch is logged and printed as a banner but **never blocks printing** — a
  comprobante that exists has to be printable.
- **`sunat === null` is the single predicate** for "SUNAT does not know this document". Notas
  de venta and balance receipts get no QR, no hash and no legal legend. Nothing branches on
  the document class to decide that.
- **The title comes from `doc.type`, never from the `fullNumber` prefix**, which is what the
  ticket used to do: a nota de venta on a series starting with "F" printed as a factura.
- **Importing `armar.ts` from a client component breaks the build.** It imports the Prisma
  enums as *values*, which drags the Prisma client — and Node built-ins — into the browser
  bundle. Anything the ticket needs lives in `etiquetas.ts`, which only has types and plain
  constants.
- **The QR is always rasterised on the server**, both for the PDF (`qrPngBuffer`) and for the
  ticket (`qrDataUrl`, shipped inside the JSON). No QR library in the browser bundle, no two
  implementations that can drift, and the same bytes on thermal paper and in the PDF.
- **`@page` must declare `size: 72mm auto`.** Without `size` the browser lays the ticket out
  as A4. And `app/globals.css` sets `html, body { height:100%; overflow:hidden }`, which
  react-to-print copies into its iframe and which would clip any ticket taller than the
  viewport — hence the `!important` in the ticket’s `pageStyle`.
- **pdfkit adds a page when you write below the bottom margin.** That is where the page
  number goes, so a two-page factura came out with four. Lower `doc.page.margins.bottom`
  while writing the footer. Smoke tests do not catch this: the PDF generates fine, you have
  to count the pages.
- **`fechaEmision` (ISO) and `fechaEmisionCorta` (`DD/MM/YYYY`) are separate fields.** The QR
  needs the first; people read the second.
- **The prescription is never printed.** `cargar.ts` does not even select it, and a test
  asserts it appears nowhere in the serialised representation.

`SaleDocument.pdfUrl` / `qrCode` / `xmlUrl` stay unused: the PDF is a deterministic function
of the row plus the envío plus the env, and the QR string is derivable. Persisting either
would only create a copy that ages the moment the layout changes. The canonical URL is the
endpoint.

Per-establishment data (`SUCURSAL: …`, phone) is keyed by **series** — `B001`/`F001` are the
main shop, `B002` is Tienda Moral — overridable whole with `EMPRESA_SUCURSALES`. The footer
says only verifiable things and points at SUNAT’s own CPE validator, not at a provider.
`SUNAT_RESOLUCION` is empty by default: an invented resolution number on a tax document is
worse than none.

### El buscador del ecommerce no lee la base

Borrar o editar un producto desde el POS **sí** lo cambia en la web: comparten la
base y el catálogo, la ficha y la portada la consultan en vivo. La excepción es
el **buscador** de la web, que lee un índice de Algolia que sólo el ecommerce
sabe escribir. Durante mucho tiempo el POS no lo avisó, y el resultado, medido
contra producción el 2026-09-02: 263 productos publicables en la base contra 273
registros en el índice — 10 de ellos invendibles (5 borrados de la base, que dan
404 al clicarlos, y 5 desactivados) — más 187 con el nombre, el precio o el stock
desfasados respecto a la fila.

`lib/reindex-ecommerce.ts` cierra el circuito: manda los ids a
`POST /api/internal/reindex` del ecommerce con `REINDEX_SECRET`, y allí se decide
indexar o borrar mirando la base. **El POS no indexa por su cuenta a propósito**
— eso repartiría la admin key de Algolia y duplicaría aquí la regla de qué
producto es publicable, que es del ecommerce.

Se avisa desde todo lo que cambia un producto: crear (`POST /api/productos`),
editar (`PATCH`), borrar (`DELETE`, tanto el borrado real como el soft delete),
mover stock (`/api/productos/[id]/movimiento`), vender (`POST /api/ventas`),
borrar una venta y la anulación cuando SUNAT la confirma (`lib/sunat/tickets.ts`).

Tres cosas que no se pueden cambiar sin romperlo:

- **El aviso va SIEMPRE fuera de la transacción.** El ecommerce lee la base con
  su propia conexión: llamado desde dentro, indexaría los valores de antes del
  commit.
- **Nunca lanza.** La venta ya está escrita y el stock descontado; que el
  buscador quede un minuto desfasado no puede tumbar una operación cerrada. Los
  fallos se registran en consola y el desfase lo recoge después
  `npm run algolia:resync` en el ecommerce.
- **Sin `ECOMMERCE_URL` y `REINDEX_SECRET` el aviso no existe**, y el POS lo dice
  por consola una vez en lugar de fallar. Las dos variables van también en
  Railway; el secreto tiene que ser idéntico al del ecommerce.

Los scripts de `scripts/` que tocan productos por fuera de las rutas (sync de
stock, de precios) tampoco avisan: después de correrlos, cuadrar con
`npm run algolia:resync` desde el ecommerce.

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
| `EMPRESA_EMAIL` | Contact e-mail on the printed comprobante |
| `EMPRESA_SUCURSALES` | JSON keyed by series with each establishment’s name, address and phone. Omit to use the known defaults |
| `SUNAT_RESOLUCION` | Resolution that designated the electronic issuer. Empty prints no line — do not guess it |
| `APISUNAT_TOKEN`, `APISUNAT_BASE_URL` | DNI/RUC lookup only — no longer used to emit |
| `ECOMMERCE_URL` | Base de la web, sin barra final. A donde se avisa que un producto cambió |
| `REINDEX_SECRET` | Secreto compartido con el ecommerce para ese aviso. Idéntico en los dos. Si falta, el buscador de la web se queda con datos viejos |

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
- **Document series**: Each `DocumentType` + series letter has its own `DocumentSerie` row with an auto-incrementing correlativo. The series is **not in the code**: `reservarCorrelativo` (`lib/document-serie.ts`) reads the active row, so switching series is one `UPDATE`, not a deploy. If several rows are active for a type, the newest wins.
- **A correlativo SUNAT already knows is burned forever.** Emitting against one is rejected `1033` (already reported) or `1032` (reported and then voided — a voided number does *not* free up), and the number is spent either way. Luminus' B001 came from a previous provider and its real extent was unknown, so finding the end cost three correlativos. Before touching a counter, ask SUNAT: `npm run sunat:serie B001 1 120` consults `billConsultService` and emits nothing. It needs production credentials in `.env.sunat-prod` (gitignored) and a SOL user with the *consultar validez de CPE* permission.
- **Series in use**: `B001` boletas (local principal, POS), `F001` facturas, `B002` boletas of the Tienda Moral branch, `EB01` boletas issued by hand from the SEE-SOL portal. The POS must never touch `B002` or `EB01`.
- **A converted nota de venta does not move stock or cash** — the original already did. The comprobante carries a `Convertido de …` marker in `notes` (`lib/conversion.ts`) so that deleting it does not revert what it never took. `DELETE /api/ventas/[id]` also refuses any document that already has a `SunatEnvio`: the correlativo is spent and the signed XML is the evidence.
- **A nota de venta converts once.** That same marker is what `convertir` checks to refuse a second conversion (409) and what `GET /api/ventas/convertibles` uses to keep already-converted notas out of the Convertir screen. Two exceptions carry the whole design: a conversion left `REJECTED` **may** be redone — that comprobante is worthless and the sale still needs a valid one — while `PENDING`/`SEND_ERROR` must be **retried** via `/api/comprobantes/[id]/reintentar`, because its correlativo is still alive and converting again would burn a fresh number. `PATCH` re-applies the marker when `notes` is edited, or an edit would silently unlock the double conversion.
- **Voiding a converted comprobante voids its nota too**, and `convertir` refuses a nota that is not `ACCEPTED`. Without that guard the voided nota — whose stock and cash already went back — could be converted again through the API and would declare to SUNAT a sale that no longer exists. The Convertir screen does not offer it (it only lists `ACCEPTED` notas), but the route is callable all the same.
- **SUNAT rejects SOAP calls that arrive back to back** with a gateway `401`. `cliente-soap.ts` serializes them and spaces them by `SUNAT_PAUSA_LLAMADAS_MS`. See the SEE section — this one silently crippled the queue for a long time.
- **Timezone**: All dates use Lima/Peru timezone (`America/Lima`, UTC-5). Use `toLocaleString('es-PE', { timeZone: 'America/Lima' })` for display.
