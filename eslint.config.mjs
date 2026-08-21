import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * ESLint 9 dejó de leer `.eslintrc.*`, y este repo nunca llegó a tener la
 * configuración plana: `npm run lint` fallaba con "couldn't find an
 * eslint.config.js" antes de mirar un solo archivo, así que durante todo ese
 * tiempo no avisó de nada.
 *
 * `eslint-config-next` 16 ya exporta configuración plana, así que basta con
 * extenderla.
 */
const config = [
  {
    // El cliente de Prisma son 2 MB de código generado que se rehace en cada
    // `prisma generate`: analizarlo sólo produce ruido que nadie puede arreglar.
    ignores: ["app/generated/**", ".next/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Los `.js` de `scripts/` son tooling de Node en CommonJS, no código de la
    // app: a `verify-schema.js` lo ejecuta el hook `prebuild`, también en
    // Railway. Prohibirle `require()` obligaría a pasarlo a ESM y arriesgar el
    // build a cambio de nada.
    files: ["scripts/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default config;
