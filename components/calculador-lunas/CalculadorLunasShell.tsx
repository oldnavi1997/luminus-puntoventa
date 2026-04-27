"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import PrescriptionForm from "./PrescriptionForm";
import CostBreakdown from "./CostBreakdown";
import FabricationCostTable from "./FabricationCostTable";
import LensCatalog from "./LensCatalog";
import LunasSinMedida from "./LunasSinMedida";
import { calcularDesglose } from "@/lib/calculador-lunas/calculo";
import type { FabricationCostRow, Desglose } from "@/lib/calculador-lunas/types";

type PrescriptionField = "odSphere" | "odCylinder" | "oiSphere" | "oiCylinder";

const EMPTY_DESGLOSE: Desglose = {
  pOdEsf: 0, pOdCil: 0, pOiEsf: 0, pOiCil: 0,
  subtotalOD: 0, subtotalOI: 0, total: 0, hasValues: false,
};

export default function CalculadorLunasShell() {
  const [odSphere,   setOdSphere]   = useState("");
  const [odCylinder, setOdCylinder] = useState("");
  const [oiSphere,   setOiSphere]   = useState("");
  const [oiCylinder, setOiCylinder] = useState("");

  const [costos, setCostos]   = useState<FabricationCostRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calculador-lunas/fabrication-costs")
      .then((r) => r.json())
      .then((data: FabricationCostRow[]) => {
        setCostos(data);
        setLoading(false);
      })
      .catch(() => {
        toast.error("No se pudo cargar la tabla de costos");
        setLoading(false);
      });
  }, []);

  const desglose = loading
    ? EMPTY_DESGLOSE
    : calcularDesglose(odSphere, odCylinder, oiSphere, oiCylinder, costos);

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
            <FabricationCostTable costos={costos} onUpdated={setCostos} />
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
