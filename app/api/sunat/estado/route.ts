import { NextResponse } from "next/server";
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
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
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

  // Estado de la cola: si hay documentos esperando, conviene saberlo antes de
  // dar por bueno el despliegue.
  const [enCola, agotados, conError] = await Promise.all([
    prisma.documentQueue.count(),
    prisma.documentQueue.count({ where: { attempts: { gte: 10 } } }),
    prisma.saleDocument.count({ where: { status: "SEND_ERROR" } }),
  ]);

  if (agotados > 0) avisos.push(`${agotados} comprobante(s) agotaron sus reintentos.`);
  if (conError > 0) avisos.push(`${conError} comprobante(s) quedaron en SEND_ERROR.`);
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
    cola: { pendientes: enCola, agotados, enSendError: conError },
  });
}
