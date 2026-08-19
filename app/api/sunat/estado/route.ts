import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfigSunat } from "@/lib/sunat/config";
import { cargarCertificado } from "@/lib/sunat/certificado";

/**
 * Diagnóstico de la emisión electrónica. **No contacta con SUNAT ni emite nada.**
 *
 * Existe para poder verificar un despliegue antes de arriesgar un comprobante
 * real: comprueba que las variables estén puestas, que el certificado abra con
 * su contraseña, que esté vigente y que su RUC coincida con el configurado.
 *
 * Lo que NO puede verificar sin emitir es la contraseña SOL: eso sólo lo dice
 * SUNAT cuando se le manda algo.
 */
export async function GET(req: NextRequest) {
  // Dos llamadores, igual que la cola: un ADMIN con sesión desde la interfaz,
  // o una herramienta con el token. Lo segundo permite verificar un despliegue
  // sin depender de tener sesión abierta en ese navegador y dominio.
  const secreto = process.env.QUEUE_SECRET;
  const esToken = !!secreto && req.headers.get("authorization") === `Bearer ${secreto}`;

  if (!esToken) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }
  }

  const problemas: string[] = [];
  const avisos: string[] = [];

  let config;
  try {
    config = getConfigSunat();
  } catch (err) {
    return NextResponse.json({
      listo: false,
      problemas: [err instanceof Error ? err.message : String(err)],
      avisos: [],
      configuracion: null,
      certificado: null,
    });
  }

  let certificado = null;
  try {
    const cert = cargarCertificado(config.certificado.pfx, config.certificado.clave);
    const diasRestantes = Math.floor((cert.validoHasta.getTime() - Date.now()) / 86_400_000);

    if (diasRestantes < 0) problemas.push(`El certificado venció hace ${-diasRestantes} días.`);
    else if (diasRestantes <= 30) avisos.push(`El certificado vence en ${diasRestantes} días.`);

    if (cert.rucDelCertificado && cert.rucDelCertificado !== config.ruc) {
      problemas.push(
        `El RUC del certificado (${cert.rucDelCertificado}) no coincide con el configurado (${config.ruc}).`,
      );
    }

    certificado = {
      titular: cert.subjectName,
      emisor: cert.emisor,
      validoHasta: cert.validoHasta,
      diasRestantes,
      rucCoincide: cert.rucDelCertificado === config.ruc,
    };
  } catch (err) {
    problemas.push(err instanceof Error ? err.message : String(err));
  }

  if (config.ambiente === "beta") {
    avisos.push(
      "Estás en el ambiente de PRUEBAS: los comprobantes que se emitan no tienen validez tributaria.",
    );
  }

  // Estado de la base y de la cola.
  //
  // Va con red porque aquí se cae justo el caso que este endpoint existe para
  // detectar: si la migración del ecommerce no llegó a producción, esta base no
  // conoce ni la tabla SunatEnvio ni los valores nuevos del enum, y entonces
  // NINGUNA venta con comprobante puede completarse. Reventar con un 500 sería
  // la peor forma posible de contarlo.
  let cola: { pendientes: number; agotados: number; enSendError: number } | null = null;
  let esquemaAlDia = false;

  try {
    const [pendientes, agotados, enSendError, envios] = await Promise.all([
      prisma.documentQueue.count(),
      prisma.documentQueue.count({ where: { attempts: { gte: 10 } } }),
      prisma.saleDocument.count({ where: { status: "SEND_ERROR" } }),
      prisma.sunatEnvio.count(),
    ]);

    esquemaAlDia = true;
    cola = { pendientes, agotados, enSendError };

    if (agotados > 0) avisos.push(`${agotados} comprobante(s) agotaron sus reintentos.`);
    if (enSendError > 0) avisos.push(`${enSendError} comprobante(s) quedaron en SEND_ERROR.`);
    if (envios === 0) avisos.push("Todavía no se ha emitido ningún comprobante por esta vía.");
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    problemas.push(
      "La base de datos no tiene la estructura de emisión electrónica. " +
        "Falta desplegar el servicio de ecommerce, que es el único que aplica las migraciones " +
        "(`prisma migrate deploy`). Hasta entonces NINGUNA venta con boleta o factura podrá " +
        `completarse. Detalle: ${detalle.slice(0, 200)}`,
    );
  }
  if (!process.env.QUEUE_SECRET) {
    avisos.push("QUEUE_SECRET no está definido: ningún cron podrá drenar la cola.");
  }

  return NextResponse.json({
    listo: problemas.length === 0,
    problemas,
    avisos,
    configuracion: {
      ambiente: config.ambiente,
      endpoint: config.endpoints.comprobantes,
      ruc: config.ruc,
      razonSocial: config.razonSocial,
      // El usuario SOL se muestra tal como viaja, para cazar el error clásico
      // de haberle puesto el RUC delante en la variable.
      usuarioWsse: `${config.ruc}${config.sol.usuario}`,
      domicilio: `${config.domicilio.distrito}, ${config.domicilio.provincia}, ${config.domicilio.departamento} (ubigeo ${config.domicilio.ubigeo}, local ${config.domicilio.codigoEstablecimiento})`,
    },
    certificado,
    esquemaAlDia,
    cola,
  });
}
