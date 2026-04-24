"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Pencil, Trash2, ShieldCheck, User, KeyRound } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";

interface PosUser {
  id: string;
  name: string | null;
  email: string;
  role: "CASHIER" | "SUPERVISOR" | "ADMIN";
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  CASHIER:    "Cajero",
  SUPERVISOR: "Supervisor",
  ADMIN:      "Administrador",
};

const ROLE_COLOR: Record<string, string> = {
  CASHIER:    "bg-surface-dark text-ink-3",
  SUPERVISOR: "bg-accent/10 text-accent",
  ADMIN:      "bg-success-soft text-success",
};

interface UsuariosViewProps {
  currentUserId: string;
}

export function UsuariosView({ currentUserId }: UsuariosViewProps) {
  const [users, setUsers] = useState<PosUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PosUser | null>(null);
  const [deleting, setDeleting] = useState<PosUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/usuarios");
      const json = await res.json();
      setUsers(json.users ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function handleCreated(user: PosUser) {
    setUsers((prev) => [...prev, user]);
    setCreating(false);
  }

  function handleUpdated(user: PosUser) {
    setUsers((prev) => prev.map((u) => u.id === user.id ? user : u));
    setEditing(null);
  }

  function handleDeleted(id: string) {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setDeleting(null);
  }

  return (
    <>
      <ModuleHeader title="Configuración" subtitle="Gestión de usuarios del sistema" />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-4">
          {/* Header card */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Usuarios del POS</h2>
              <p className="text-[12px] text-ink-3 mt-0.5">{users.length} usuarios registrados</p>
            </div>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dark text-white text-[13px] font-semibold rounded-xl transition-colors"
            >
              <Plus size={15} />
              Nuevo usuario
            </button>
          </div>

          {/* Table */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-ink-3 text-[13px]">Cargando usuarios...</div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center">
                <User size={32} className="mx-auto text-ink-4 mb-3 opacity-40" />
                <p className="text-[13px] text-ink-3">Sin usuarios</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-light border-b border-border">
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium">Nombre</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium">Email</th>
                    <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-ink-3 font-medium">Rol</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-border last:border-0 hover:bg-surface-light transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-semibold text-accent">
                              {(user.name ?? user.email)[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-ink leading-none">{user.name ?? "—"}</p>
                            {user.id === currentUserId && (
                              <p className="text-[10px] text-ink-4 mt-0.5">Tú</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-ink-3 font-mono">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ROLE_COLOR[user.role]}`}>
                          {ROLE_LABEL[user.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setEditing(user)}
                            className="p-1.5 rounded-lg text-ink-4 hover:text-ink-2 hover:bg-surface-light transition-colors"
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                          {user.id !== currentUserId && (
                            <button
                              onClick={() => setDeleting(user)}
                              className="p-1.5 rounded-lg text-ink-4 hover:text-danger hover:bg-danger-soft transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {creating && (
        <UserFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSuccess={handleCreated}
        />
      )}

      {editing && (
        <UserFormModal
          mode="edit"
          user={editing}
          onClose={() => setEditing(null)}
          onSuccess={handleUpdated}
        />
      )}

      {deleting && (
        <DeleteUserModal
          user={deleting}
          onClose={() => setDeleting(null)}
          onSuccess={() => handleDeleted(deleting.id)}
        />
      )}
    </>
  );
}

// ─── UserFormModal ────────────────────────────────────────────────────────────

function UserFormModal({
  mode,
  user,
  onClose,
  onSuccess,
}: {
  mode: "create" | "edit";
  user?: PosUser;
  onClose: () => void;
  onSuccess: (u: PosUser) => void;
}) {
  const [name, setName]         = useState(user?.name ?? "");
  const [email, setEmail]       = useState(user?.email ?? "");
  const [role, setRole]         = useState<PosUser["role"]>(user?.role ?? "CASHIER");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = { name, role };
      if (mode === "create") {
        body.email    = email;
        body.password = password;
      } else if (password) {
        body.password = password;
      }

      const url  = mode === "create" ? "/api/usuarios" : `/api/usuarios/${user!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al guardar");
      onSuccess(json.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = name.trim().length >= 2 &&
    (mode === "edit" || (email.includes("@") && password.length >= 6));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        <div className="flex items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-ink text-[15px]">
            {mode === "create" ? "Nuevo usuario" : "Editar usuario"}
          </h2>
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] text-ink-3 mb-1">Nombre completo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: María López"
              autoFocus
              className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
            />
          </div>

          {mode === "create" && (
            <div>
              <label className="block text-[12px] text-ink-3 mb-1">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                type="email"
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent"
              />
            </div>
          )}

          <div>
            <label className="block text-[12px] text-ink-3 mb-1">Rol</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["CASHIER", "SUPERVISOR", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`py-2 rounded-lg text-[12px] font-medium transition-colors border ${
                    role === r
                      ? "bg-accent text-white border-accent"
                      : "bg-surface-light text-ink-3 border-border hover:border-accent/50"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[12px] text-ink-3 mb-1">
              {mode === "create" ? "Contraseña" : "Nueva contraseña (opcional)"}
            </label>
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPass ? "text" : "password"}
                placeholder={mode === "create" ? "Mínimo 6 caracteres" : "Dejar vacío para no cambiar"}
                className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 pr-9 text-[13px] text-ink focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2 transition-colors"
              >
                <KeyRound size={13} />
              </button>
            </div>
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 bg-surface-light border border-border rounded-xl py-2.5 text-[13px] text-ink hover:bg-border transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className="flex-1 bg-accent hover:bg-accent-dark disabled:opacity-40 text-white rounded-xl py-2.5 text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><ShieldCheck size={14} /> {mode === "create" ? "Crear usuario" : "Guardar"}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DeleteUserModal ──────────────────────────────────────────────────────────

function DeleteUserModal({
  user,
  onClose,
  onSuccess,
}: {
  user: PosUser;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/usuarios/${user.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al eliminar");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm border border-border">
        <div className="flex items-center px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-ink text-[15px]">Eliminar usuario</h2>
          <button onClick={onClose} className="ml-auto text-ink-3 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[13px] text-ink-3">
            ¿Eliminar a <span className="font-semibold text-ink">{user.name ?? user.email}</span>?
            Esta acción no se puede deshacer.
          </p>
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 bg-surface-light border border-border rounded-xl py-2.5 text-[13px] text-ink hover:bg-border transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 bg-danger hover:bg-danger/90 disabled:opacity-40 text-white rounded-xl py-2.5 text-[13px] font-semibold transition-colors"
            >
              {loading ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
