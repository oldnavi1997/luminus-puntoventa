"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut, User, Settings, Clock } from "lucide-react";

interface PosHeaderProps {
  user: {
    name?: string | null;
    email: string;
    role: string;
    posSessionId: string | null;
  };
}

export function PosHeader({ user }: PosHeaderProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);

  const roleLabel: Record<string, string> = {
    CASHIER: "Cajero",
    SUPERVISOR: "Supervisor",
    ADMIN: "Admin",
  };

  return (
    <header className="h-12 bg-primary border-b border-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">L</span>
        </div>
        <span className="text-text font-semibold text-sm">Luminus POS</span>
      </div>

      <nav className="flex items-center gap-1">
        <button
          onClick={() => router.push("/pos")}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface rounded-md transition-colors"
        >
          Terminal
        </button>
        <button
          onClick={() => router.push("/documentos")}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface rounded-md transition-colors"
        >
          Documentos
        </button>
        <button
          onClick={() => router.push("/sesion")}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text hover:bg-surface rounded-md transition-colors flex items-center gap-1"
        >
          <Clock size={12} />
          Caja
        </button>
      </nav>

      <div className="relative">
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface transition-colors"
        >
          <div className="w-6 h-6 bg-accent/20 rounded-full flex items-center justify-center">
            <User size={12} className="text-accent" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-xs font-medium text-text leading-none">
              {user.name ?? user.email.split("@")[0]}
            </p>
            <p className="text-[10px] text-text-muted">{roleLabel[user.role] ?? user.role}</p>
          </div>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-lg shadow-xl z-20 overflow-hidden">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-medium text-text truncate">{user.email}</p>
                <p className="text-[10px] text-text-muted">
                  {user.posSessionId ? "Sesión activa" : "Sin sesión"}
                </p>
              </div>
              <button
                onClick={() => { setShowMenu(false); router.push("/sesion"); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-text hover:bg-surface-light transition-colors"
              >
                <Settings size={13} />
                Gestionar caja
              </button>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger hover:bg-danger/10 transition-colors"
              >
                <LogOut size={13} />
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
