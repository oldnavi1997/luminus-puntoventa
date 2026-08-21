import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // El cliente SOAP espacia sus llamadas porque el gateway de SUNAT
    // rechaza las que van pegadas. Con fetch simulado no hay gateway, así
    // que esa pausa sólo alargaría la suite.
    env: { SUNAT_PAUSA_LLAMADAS_MS: "0" },
  },
});
