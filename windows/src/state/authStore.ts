import { create } from "zustand";
import { authStatus } from "../ipc/commands";
import type { AuthStatus } from "../ipc/types";

interface AuthState {
  status: AuthStatus | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Applies an `auth://changed` payload; refetches when the payload is not a status object. */
  applyChanged: (payload: unknown) => void;
}

function isStatus(v: unknown): v is AuthStatus {
  return typeof v === "object" && v !== null && "kind" in v;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: null,
  hydrated: false,
  async hydrate() {
    set({ status: await authStatus(), hydrated: true });
  },
  applyChanged(payload) {
    if (isStatus(payload)) set({ status: payload, hydrated: true });
    else void get().hydrate();
  },
}));

export const isConnected = (s: AuthStatus | null): boolean => s !== null && s.kind !== null;
