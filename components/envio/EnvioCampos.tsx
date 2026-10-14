"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { MERCADERIAS, buscarAgenciasShalom, esAgenciaShalom } from "@/lib/shalom/catalogo";
import {
  COURIERS,
  ETIQUETA_COURIER,
  ETIQUETA_MODALIDAD,
  MODALIDADES,
  admiteDomicilio,
  type BorradorEnvio,
} from "@/lib/envio";

/**
 * Los campos de la etiqueta de envío. Controlado: no guarda nada, solo edita
 * el borrador que le pasan.
 */

const campo =
  "w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink " +
  "placeholder-ink-4 focus:outline-none focus:border-accent";

const rotulo = "block text-[10.5px] uppercase tracking-wide text-ink-3 font-medium mb-1";

function Segmentos<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-surface-light border border-border rounded-lg p-0.5">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={`flex-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
            valor === o.valor ? "bg-surface shadow-sm text-ink" : "text-ink-3 hover:text-ink"
          }`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

/**
 * La agencia de Shalom se elige de su lista, no se escribe: la carga masiva
 * rechaza cualquier nombre que no sea idéntico al suyo.
 */
function AgenciaShalom({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const valida = esAgenciaShalom(valor);
  const [consulta, setConsulta] = useState(valida ? "" : valor);
  const [abierto, setAbierto] = useState(false);
  const opciones = buscarAgenciasShalom(consulta);

  if (valida && !abierto) {
    return (
      <button
        type="button"
        onClick={() => { setConsulta(""); setAbierto(true); }}
        className={`${campo} flex items-center gap-2 text-left`}
        title="Cambiar agencia"
      >
        <Check size={13} className="text-success shrink-0" />
        <span className="truncate">{valor}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        className={campo}
        value={consulta}
        autoFocus={abierto}
        onChange={(e) => { setConsulta(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder="Busca la agencia: santa anita, independencia…"
      />
      {!valida && valor && !abierto && (
        <p className="mt-1 text-[11px] text-warning">
          «{valor}» no está en la lista de Shalom. Búscala y elígela.
        </p>
      )}
      {abierto && opciones.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {opciones.map((a) => (
            <li key={a}>
              <button
                type="button"
                // `onMouseDown` y no `onClick`: el blur del input cerraría la lista antes.
                onMouseDown={(e) => { e.preventDefault(); onChange(a); setAbierto(false); }}
                className="w-full px-3 py-1.5 text-left text-[13px] text-ink hover:bg-surface-light"
              >
                {a}
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierto && consulta.trim() && opciones.length === 0 && (
        <p className="mt-1 text-[11px] text-ink-4">
          Sin coincidencias. Shalom nombra las agencias por calle o zona, no por ciudad.
        </p>
      )}
    </div>
  );
}

export function EnvioCampos({
  valor,
  onChange,
}: {
  valor: BorradorEnvio;
  onChange: (b: BorradorEnvio) => void;
}) {
  const set = <K extends keyof BorradorEnvio>(k: K, v: BorradorEnvio[K]) =>
    onChange({ ...valor, [k]: v });

  const domicilio = admiteDomicilio(valor.courier);
  const modalidad = domicilio ? valor.modalidad : "AGENCIA";

  return (
    <div className="space-y-3">
      <div>
        <label className={rotulo}>Nombres</label>
        <input
          className={campo}
          value={valor.nombre}
          onChange={(e) => set("nombre", e.target.value)}
          placeholder="Quien recibe el paquete"
        />
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-2">
        <div>
          <label className={rotulo}>Doc.</label>
          <select
            className={campo}
            value={valor.tipoDocumento}
            onChange={(e) => set("tipoDocumento", e.target.value as BorradorEnvio["tipoDocumento"])}
          >
            <option value="DNI">DNI</option>
            <option value="CE">CE</option>
            <option value="RUC">RUC</option>
          </select>
        </div>
        <div>
          <label className={rotulo}>Número</label>
          <input
            className={campo}
            inputMode="numeric"
            value={valor.numeroDocumento}
            onChange={(e) => set("numeroDocumento", e.target.value)}
            placeholder={valor.courier === "SHALOM" ? "Shalom lo pide" : "Opcional"}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={rotulo}>Celular</label>
          <input
            className={campo}
            inputMode="tel"
            value={valor.celular}
            onChange={(e) => set("celular", e.target.value)}
            placeholder="9XXXXXXXX"
          />
        </div>
        <div>
          <label className={rotulo}>Ciudad</label>
          <input
            className={campo}
            value={valor.ciudad}
            onChange={(e) => set("ciudad", e.target.value)}
            placeholder="Juliaca"
          />
        </div>
      </div>

      <div>
        <label className={rotulo}>Courier</label>
        <Segmentos
          opciones={COURIERS.map((c) => ({ valor: c, etiqueta: ETIQUETA_COURIER[c] }))}
          valor={valor.courier}
          onChange={(c) =>
            // Shalom no entrega a domicilio: elegirlo devuelve la modalidad a agencia.
            onChange({ ...valor, courier: c, modalidad: admiteDomicilio(c) ? valor.modalidad : "AGENCIA" })
          }
        />
        {valor.courier === "OTRO" && (
          <input
            className={`${campo} mt-1.5`}
            value={valor.courierOtro}
            onChange={(e) => set("courierOtro", e.target.value)}
            placeholder="Nombre del courier"
          />
        )}
      </div>

      {domicilio && (
        <div>
          <label className={rotulo}>Entrega en</label>
          <Segmentos
            opciones={MODALIDADES.map((m) => ({ valor: m, etiqueta: ETIQUETA_MODALIDAD[m] }))}
            valor={modalidad}
            onChange={(m) => set("modalidad", m)}
          />
        </div>
      )}

      <div>
        <label className={rotulo}>{modalidad === "DIRECCION" ? "Dirección" : "Agencia (sede)"}</label>
        {valor.courier === "SHALOM" ? (
          <AgenciaShalom valor={valor.destino} onChange={(v) => set("destino", v)} />
        ) : (
          <input
            className={campo}
            value={valor.destino}
            onChange={(e) => set("destino", e.target.value)}
            placeholder={modalidad === "DIRECCION" ? "Av. Arequipa 1234 Dpto 501" : "Agencia Olva Miraflores"}
          />
        )}
      </div>

      {valor.courier === "SHALOM" && (
        <div>
          <label className={rotulo}>Mercadería (Shalom)</label>
          <select
            className={campo}
            value={valor.mercaderia}
            onChange={(e) => set("mercaderia", e.target.value as BorradorEnvio["mercaderia"])}
          >
            {MERCADERIAS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
