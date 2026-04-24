"use client";

import { create } from "zustand";

interface SessionStore {
  posSessionId: string | null;
  cashierName: string | null;
  setSession: (id: string, name: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionStore>()((set) => ({
  posSessionId: null,
  cashierName: null,
  setSession: (id, name) => set({ posSessionId: id, cashierName: name }),
  clearSession: () => set({ posSessionId: null, cashierName: null }),
}));
