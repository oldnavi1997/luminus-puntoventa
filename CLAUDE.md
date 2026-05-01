# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Luminus POS** is a Point of Sale system for an optical/eyeglasses retail store in Peru. It handles sales (BOLETA, FACTURA, NOTA_VENTA), inventory, cash register sessions, optical lens pricing, and electronic invoicing via SUNAT. It shares a PostgreSQL database with the Luminus ecommerce site.

## Commands

```bash
npm run dev        # Start dev server with Turbopack on port 3003
npm run build      # npx prisma generate && next build
npm start          # Production server
npm run lint       # ESLint

# Database
npx prisma generate              # Regenerate Prisma client after schema changes
npx prisma db push               # Sync schema to DB (dev)
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

### Electronic Invoicing (SUNAT)

Two OSE integrations exist in parallel:
- **Primary**: ApiSunat (`lib/apisunat.ts`) — active, used in production
- **Backup**: Nubefact (`lib/nubefact.ts`) — disabled (env vars commented out)

Sales with `DocumentType` BOLETA/FACTURA are placed in `DocumentQueue` and processed asynchronously by `/api/queue`. NOTA_VENTA is a local document only (not submitted to SUNAT).

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
| `APISUNAT_TOKEN` | ApiSunat OSE token for SUNAT e-invoicing |
| `APISUNAT_BASE_URL` | ApiSunat base URL (sandbox vs production) |

Dev database: `postgresql://postgres:75207666@localhost:5433/luminus` (shared with ecommerce, port 5433).

## Deployment (Railway)

`railway.toml` configures the full lifecycle:
1. Build: `npm ci && npx prisma generate && npm run build`
2. Deploy: `npx prisma db push --accept-data-loss && npx tsx prisma/seed-catalog.ts && npm start`

The `--accept-data-loss` flag is intentional for Railway auto-migrations. Lens catalog is re-seeded on every deploy (idempotent).

## Key Design Decisions

- **Tailwind v4** with the new `@theme` syntax — no `tailwind.config.ts` theme extension needed; CSS variables are defined in `globals.css`.
- **Payment methods**: EFECTIVO, TARJETA, YAPE, MIXTO. Mixed payments split the total across methods; `SaleDocument` stores individual amounts per method.
- **Stock locations**: Products track `stockTienda` (showroom) and `stockAlmacen` (warehouse) separately. Sales deduct from `stockTienda`.
- **Document series**: Each `DocumentType` + series letter has its own `DocumentSerie` row with an auto-incrementing correlativo. Never set manually—always use the DB sequence.
- **Timezone**: All dates use Lima/Peru timezone (`America/Lima`, UTC-5). Use `toLocaleString('es-PE', { timeZone: 'America/Lima' })` for display.
