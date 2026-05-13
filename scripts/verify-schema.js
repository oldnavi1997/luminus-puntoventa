// Verifies that prisma/schema.prisma in this POS repo matches the canonical
// schema in the ecommerce repo (D:\Cursor\luminus\prisma\schema.prisma).
// The canonical schema is the source of truth. Run `npm run sync:schema` to
// pull the latest before committing.
//
// On CI/Railway, the canonical file is not accessible (the ecommerce repo is
// not present alongside). In that case this script only checks that a local
// schema file exists and is non-empty — the sync was expected to happen
// locally before commit.

const fs = require("fs");
const path = require("path");

const localSchema = path.resolve(__dirname, "..", "prisma", "schema.prisma");
const canonicalSchema = path.resolve(
  __dirname,
  "..",
  "..",
  "luminus",
  "prisma",
  "schema.prisma"
);

if (!fs.existsSync(localSchema)) {
  console.error(`[verify-schema] missing: ${localSchema}`);
  process.exit(1);
}

const localBytes = fs.readFileSync(localSchema);
if (localBytes.length === 0) {
  console.error(`[verify-schema] empty: ${localSchema}`);
  process.exit(1);
}

if (!fs.existsSync(canonicalSchema)) {
  console.log(
    `[verify-schema] canonical schema not found at ${canonicalSchema} — assuming CI/Railway build. Local schema present (${localBytes.length} bytes). OK.`
  );
  process.exit(0);
}

const canonicalBytes = fs.readFileSync(canonicalSchema);

if (Buffer.compare(localBytes, canonicalBytes) !== 0) {
  console.error(
    `[verify-schema] DRIFT DETECTED between\n  ${localSchema}\n  ${canonicalSchema}\nRun: npm run sync:schema`
  );
  process.exit(1);
}

console.log(
  `[verify-schema] schemas match (${localBytes.length} bytes). OK.`
);
