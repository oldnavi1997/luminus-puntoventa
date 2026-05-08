"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import PrescriptionForm from "./PrescriptionForm";
import CostBreakdown from "./CostBreakdown";
import TarifasTable from "./TarifasTable";
import LensCatalog from "./LensCatalog";
import LunasSinMedida from "./LunasSinMedida";
import { calcularDesglose, TARIFAS_DEFAULT } from "@/lib/calculador-lunas/calculo";
import type { TarifaLunaRow } from "@/lib/calculador-lunas/types";

type PrescriptionField = "odSphere" | "odCylinder" | "oiSphere" | "oiCylinder";

export default function CalculadorLunasShell() {
  const [odSphere,   setOdSphere]   = useState("0.00");
  const [odCylinder, setOdCylinder] = useState("0.00");
  const [oiSphere,   setOiSphere]   = useState("0.00");
  const [oiCylinder, setOiCylinder] = useState("0.00");

  const [tarifas, setTarifas] = useState<TarifaLunaRow[]>(TARIFAS_DEFAULT);

  useEffect(() => {
    fetch("/api/calculador-lunas/tarifas")
      .then((r) => r.json())
      .then((data: TarifaLunaRow[]) => setTarifas(data))
      .catch(() => toast.error("No se pudieron cargar las tarifas"));
  }, []);

  const desglose = calcularDesglose(odSphere, odCylinder, oiSphere, oiCylinder, tarifas);

  function handleChange(field: PrescriptionField, value: string) {
    const setters: Record<PrescriptionField, (v: string) => void> = {
      odSphere:   setOdSphere,
      odCylinder: setOdCylinder,
      oiSphere:   setOiSphere,
      oiCylinder: setOiCylinder,
    };
    setters[field](value);
  }

  return (
    <div className="flex-1 overflow-auto bg-primary px-6 py-6">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Calculador de Lunas</h1>
          <p className="text-[13px] text-ink-3 mt-1">
            Costo de fabricación por graduación + catálogo de precios.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-5">
            <PrescriptionForm
              odSphere={odSphere} odCylinder={odCylinder}
              oiSphere={oiSphere} oiCylinder={oiCylinder}
              onChange={handleChange}
            />
            <CostBreakdown desglose={desglose} />
            <TarifasTable tarifas={tarifas} onUpdated={setTarifas} />
          </div>
          <div className="lg:col-span-8">
            <LensCatalog />
            <LunasSinMedida />
          </div>
        </div>
      </div>
    </div>
  );
}
