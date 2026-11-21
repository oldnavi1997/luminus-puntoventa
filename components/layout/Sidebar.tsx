"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ShoppingCart, Package, FileText, BarChart2,
  Clock, Settings, LogOut, History, Timer, DollarSign, ArrowRightLeft, Eye, Boxes, Globe, Ban,
  Menu, X,
} from "lucide-react";

interface SidebarUser {
  name?: string | null;
  email: string;
  role: string;
  posSessionId: string | null;
}

const MAIN_NAV = [
  { href: "/pos",          label: "Punto de Venta",  icon: ShoppingCart, shortcut: "F1", roles: null },
  { href: "/inventario",   label: "Inventario",      icon: Package,      shortcut: "F2", roles: ["ADMIN"] },
  { href: "/movimientos",  label: "Movimientos",     icon: Boxes,        shortcut: "F10", roles: ["ADMIN"] },
  { href: "/comprobantes", label: "Comprobantes",        icon: FileText,        shortcut: "F3", roles: null },
  { href: "/convertir",    label: "Convertir NV",        icon: ArrowRightLeft,  shortcut: "F4", roles: null },
  { href: "/dashboard",    label: "Dashboard",           icon: BarChart2,       shortcut: "F5", roles: ["ADMIN"] },
  { href: "/ventas",       label: "Historial de ventas", icon: History,         shortcut: "F6", roles: null },
  { href: "/pendientes",   label: "Pendientes",          icon: Timer,           shortcut: "F7", roles: null },
  { href: "/pedidos",      label: "Ventas web",          icon: Globe,           shortcut: null, roles: ["ADMIN"] },
  { href: "/sesion",       label: "Sesión de Caja",      icon: Clock,           shortcut: "F8", roles: null },
  { href: "/calculador-lunas", label: "Calculador Lunas", icon: Eye,             shortcut: "F9", roles: null },
];

const ADMIN_NAV = [
  { href: "/caja",          label: "Control de Caja", icon: DollarSign, roles: ["ADMIN"] },
  { href: "/anulados",      label: "Anulados",        icon: Ban,        roles: ["ADMIN"] },
  { href: "/configuracion", label: "Configuración",   icon: Settings,   roles: ["ADMIN"] },
];

const ROLE_LABEL: Record<string, string> = {
  CASHIER: "Cajero",
  ADMIN:   "Administrador",
};

export function Sidebar({ user, cartCount }: { user: SidebarUser; cartCount?: number }) {
  const pathname = usePathname();
  // En celular el menú es un panel que se abre con el botón de la barra superior.
  const [open, setOpen] = useState(false);

  const initials = (user.name ?? user.email)
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const isActive = (href: string) => isActiveHref(pathname, href);

  return (
    <>
    {/* Barra superior — solo celular */}
    <div className="md:hidden flex items-center gap-3 px-3 h-12 shrink-0 bg-surface border-b border-border">
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 -ml-1 flex items-center justify-center rounded-lg text-ink-2 hover:bg-surface-light"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>
      <div className="w-6 h-6 rounded-md bg-ink flex items-center justify-center shrink-0">
        <span className="text-[11px] font-bold text-white">L</span>
      </div>
      <span className="text-[14px] font-semibold tracking-tight">Luminus</span>
    </div>

    {/* Fondo oscuro detrás del menú abierto — solo celular */}
    {open && (
      <div
        className="md:hidden fixed inset-0 z-40 bg-black/40 animate-fade-in"
        onClick={() => setOpen(false)}
      />
    )}

    <aside
      className={`w-[260px] md:w-[220px] shrink-0 bg-surface border-r border-border flex flex-col py-4 px-3
        fixed inset-y-0 left-0 z-50 overflow-y-auto transition-transform duration-200
        ${open ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
        md:static md:translate-x-0 md:shadow-none md:h-dvh md:z-auto`}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <div className="w-8 h-8 rounded-lg bg-ink flex items-center justify-center shrink-0">
          <span className="text-[13px] font-bold text-white">L</span>
        </div>
        <div>
          <div className="text-[14px] font-semibold leading-none tracking-tight">Luminus</div>
          <div className="text-[11px] text-ink-3 leading-tight mt-0.5">Punto de Venta</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="md:hidden ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-ink-3 hover:bg-surface-light"
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
      </div>

      {/* Operación */}
      <div className="text-[10px] uppercase tracking-[0.08em] text-ink-4 px-2 pb-1.5 font-medium">
        Operación
      </div>
      <nav className="flex flex-col gap-0.5">
        {MAIN_NAV.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/pos" && cartCount && cartCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-2 py-2.5 md:py-2 rounded-lg text-[14px] md:text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-ink text-white"
                  : "text-ink-2 hover:bg-surface-light"
              }`}
            >
              <Icon size={15} className={active ? "opacity-90" : "opacity-70"} />
              <span className="flex-1 leading-none">{item.label}</span>
              {showBadge ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  active ? "bg-white/20 text-white" : "bg-surface-light text-ink-3"
                }`}>{cartCount}</span>
              ) : (
                <span className={`hidden md:inline text-[10px] font-normal ${active ? "text-white/50" : "text-ink-4"}`}>
                  {item.shortcut}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Administración — solo si el rol tiene al menos un ítem */}
      {ADMIN_NAV.some((item) => item.roles.includes(user.role)) && (<>
      <div className="text-[10px] uppercase tracking-[0.08em] text-ink-4 px-2 pt-4 pb-1.5 font-medium">
        Administración
      </div>
      <nav className="flex flex-col gap-0.5">
        {ADMIN_NAV.filter((item) => item.roles.includes(user.role)).map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-2 py-2.5 md:py-2 rounded-lg text-[14px] md:text-[13.5px] font-medium transition-colors ${
                active
                  ? "bg-ink text-white"
                  : "text-ink-2 hover:bg-surface-light"
              }`}
            >
              <Icon size={15} className="opacity-70" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      </>)}

      {/* Footer */}
      <div className="mt-auto pt-3 border-t border-border flex items-center gap-2.5 px-2">
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
          <span className="text-[10px] font-semibold text-white">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-medium truncate leading-none">
            {user.name ?? user.email.split("@")[0]}
          </div>
          <div className="text-[10.5px] text-ink-3 mt-0.5">
            {ROLE_LABEL[user.role] ?? user.role}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-ink-4 hover:text-danger transition-colors p-1"
          title="Cerrar sesión"
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
    </>
  );
}

function isActiveHref(pathname: string, href: string) {
  return href === "/pos" ? pathname === "/pos" : pathname.startsWith(href);
}
