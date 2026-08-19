import { Package } from "lucide-react";
import { formatPEN } from "@/lib/utils";

export interface ProductoVendido {
  id: string;
  name: string;
  sku: string | null;
  category: string;
  units: number;
  revenue: number;
}

export interface CategoriaVendida {
  name: string;
  total: number;
}

const TH =
  "px-5 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium border-b border-border";

export function TopProductos({
  productos,
  periodoLabel,
}: {
  productos: ProductoVendido[];
  periodoLabel: string;
}) {
  const max = Math.max(...productos.map((p) => p.revenue), 1);

  return (
    <div className="col-span-2 bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-[14px] font-semibold text-ink">Productos más vendidos</h3>
        <p className="text-[12px] text-ink-3 mt-0.5">Ranking por ingreso · {periodoLabel}</p>
      </div>

      {productos.length === 0 ? (
        <div className="py-10 text-center">
          <Package size={30} className="mx-auto text-ink-4 mb-2 opacity-50" />
          <p className="text-[13px] text-ink-3">Sin productos vendidos en el periodo</p>
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-light">
              <th className={`text-left ${TH}`}>Producto</th>
              <th className={`text-left ${TH}`}>SKU</th>
              <th className={`text-right ${TH}`}>Unid.</th>
              <th className={`text-right ${TH}`}>Ingreso</th>
              <th className={`text-left ${TH} w-[150px]`}>Participación</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="hover:bg-surface-light">
                <td className="px-5 py-3 border-b border-border text-[13px] font-medium text-ink">
                  {p.name}
                </td>
                <td className="px-5 py-3 border-b border-border text-[12px] font-mono text-ink-3">
                  {p.sku ?? "—"}
                </td>
                <td className="px-5 py-3 border-b border-border text-right text-[13px] font-mono text-ink">
                  {p.units}
                </td>
                <td className="px-5 py-3 border-b border-border text-right text-[13px] font-mono font-semibold text-ink">
                  {formatPEN(p.revenue)}
                </td>
                <td className="px-5 py-3 border-b border-border">
                  <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent opacity-80 rounded-full"
                      style={{ width: `${(p.revenue / max) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Escala categórica del dashboard: el acento del sistema más tres tonos que
// comparten peso. Se usa igual aquí y en los métodos de pago.
const COLORES = ["bg-accent", "bg-success", "bg-[#7c3aed]", "bg-warning", "bg-ink-4"];

export function CategoriasCard({ categorias }: { categorias: CategoriaVendida[] }) {
  const total = categorias.reduce((s, c) => s + c.total, 0);

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-[14px] font-semibold text-ink">Ventas por categoría</h3>
      <p className="text-[12px] text-ink-3 mt-0.5 mb-4">Reparto del ingreso</p>

      {total === 0 ? (
        <p className="text-[13px] text-ink-3 py-6 text-center">Sin ventas en el periodo</p>
      ) : (
        <>
          <div className="flex h-2.5 rounded-sm overflow-hidden gap-0.5 mb-4">
            {categorias.map((c, i) => (
              <div
                key={c.name}
                className={COLORES[i % COLORES.length]}
                style={{ flexGrow: c.total / total }}
                title={c.name}
              />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {categorias.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2.5">
                <span
                  className={`w-2 h-2 rounded-sm shrink-0 ${COLORES[i % COLORES.length]}`}
                />
                <span className="text-[12.5px] text-ink flex-1 truncate">{c.name}</span>
                <span className="text-[12px] text-ink-4 font-mono">
                  {Math.round((c.total / total) * 100)}%
                </span>
                <span className="text-[12.5px] font-semibold font-mono text-ink">
                  {formatPEN(c.total)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
