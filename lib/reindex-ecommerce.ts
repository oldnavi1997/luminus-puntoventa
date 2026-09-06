/**
 * Avisar al ecommerce de que unos productos cambiaron.
 *
 * El POS y la web comparten la base, así que borrar, editar o vender aquí ya se
 * ve allá... salvo en el buscador, que no lee Postgres sino un índice de Algolia
 * que sólo el ecommerce sabe escribir. Sin este aviso, un producto eliminado
 * desde el POS seguía saliendo en el buscador de la web —con su precio viejo— y
 * al clicarlo daba 404. Pasó con cinco productos y con seis precios.
 *
 * El POS no indexa por su cuenta a propósito: eso obligaría a repartir la admin
 * key de Algolia y a duplicar aquí la regla de qué producto es publicable, que
 * es del ecommerce. Aquí sólo se mandan ids.
 *
 * Nada de esto puede tumbar la operación que ya se escribió en la base: la venta
 * está hecha y el stock descontado. Si el aviso falla se registra y se sigue; el
 * desfase lo recoge después `npm run algolia:resync` en el ecommerce.
 */

import { after } from "next/server";

const TIMEOUT_MS = 5_000;

let avisoDeConfiguracionDado = false;

function destino(): { url: string; secreto: string } | null {
  const base = process.env.ECOMMERCE_URL?.replace(/\/+$/, "");
  const secreto = process.env.REINDEX_SECRET;

  if (!base || !secreto) {
    if (!avisoDeConfiguracionDado) {
      avisoDeConfiguracionDado = true;
      console.warn(
        "[reindex] ECOMMERCE_URL o REINDEX_SECRET sin configurar: el buscador de la web " +
          "no se enterará de los cambios hechos desde el POS."
      );
    }
    return null;
  }

  return { url: `${base}/api/internal/reindex`, secreto };
}

/**
 * Pide al ecommerce que ponga esos productos al día en su buscador.
 * Llamar SIEMPRE después de que la transacción haya cerrado: si se hace dentro,
 * el ecommerce leería la base antes del commit y reindexaría lo de antes.
 */
export async function reindexarEnEcommerce(ids: string[]): Promise<void> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return;

  const config = destino();
  if (!config) return;

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.secreto}`,
      },
      body: JSON.stringify({ ids: unicos }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[reindex] el ecommerce respondió ${res.status} para ${unicos.length} producto(s)`);
    }
  } catch (e) {
    console.error("[reindex] no se pudo avisar al ecommerce", e);
  }
}

/**
 * Igual que `reindexarEnEcommerce`, pero sin hacer esperar a quien pidió.
 *
 * El aviso al buscador tarda hasta TIMEOUT_MS y ocurre cuando la transacción ya
 * cerró: son segundos en los que el stock ya está escrito y el cliente sigue
 * colgado. Si el celular corta por timeout en esa ventana, el cajero ve un error
 * de algo que sí se guardó y lo reintenta, duplicando el movimiento.
 *
 * `after` corre el aviso después de mandar la respuesta, así que esa ventana
 * desaparece. Fuera del ámbito de una petición (un script, un job) `after` no
 * existe y lanza: ahí no hay respuesta que esperar, así que se aguarda normal.
 */
export async function reindexarTrasResponder(ids: string[]): Promise<void> {
  try {
    after(() => reindexarEnEcommerce(ids));
  } catch {
    await reindexarEnEcommerce(ids);
  }
}
