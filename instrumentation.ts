/**
 * Arranque del servidor. Aquí vive el drenado periódico de la cola.
 *
 * La cola guarda los comprobantes que fallaron por algo transitorio —un timeout,
 * la red— y su única salida es `processQueue`. Durante años nadie lo llamaba: el
 * endpoint sólo aceptaba sesión de navegador, así que ningún cron podía hacerlo
 * y los comprobantes se quedaban dentro para siempre.
 *
 * Se hace con un intervalo dentro del proceso y no con un cron externo porque
 * Railway ejecuta un proceso Node persistente: no hace falta nada más, y así el
 * drenado no depende de que alguien recuerde configurar un servicio aparte ni de
 * que un secreto siga siendo válido. `POST /api/queue/process` sigue existiendo
 * para forzarlo a mano.
 */

/** Cada cuánto se drena. `0` lo apaga. En desarrollo está apagado por defecto. */
function intervaloMs(): number {
  const crudo = process.env.QUEUE_DRAIN_INTERVAL_MS?.trim();
  if (crudo) return Number(crudo);
  return process.env.NODE_ENV === "production" ? 5 * 60_000 : 0;
}

export async function register() {
  // El runtime edge no tiene ni temporizadores largos ni acceso a Prisma, y
  // `register` se ejecuta una vez por runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const intervalo = intervaloMs();
  if (!Number.isFinite(intervalo) || intervalo <= 0) return;

  const { processQueue } = await import("@/lib/queue");

  // Una pasada puede tardar más que el intervalo si SUNAT va lento; sin esto se
  // solaparían y dos pasadas cogerían el mismo comprobante.
  let enCurso = false;

  const timer = setInterval(async () => {
    if (enCurso) return;
    enCurso = true;
    try {
      const r = await processQueue();
      if (r.procesados > 0) {
        console.log(
          `[cola] procesados ${r.procesados}, aceptados ${r.aceptados}, ` +
            `errores ${r.errores}, agotados ${r.agotados}`,
        );
      }
    } catch (err) {
      // Que una pasada falle no puede tumbar el servidor ni parar las siguientes.
      console.error("[cola] fallo al drenar:", err instanceof Error ? err.message : err);
    } finally {
      enCurso = false;
    }
  }, intervalo);

  timer.unref();
  console.log(`[cola] drenado automático cada ${Math.round(intervalo / 1000)} s`);
}
