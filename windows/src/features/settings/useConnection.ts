import { useCallback, useEffect, useState } from "react";
import { authDisconnect, authSaveToken, authTestConnection, oauthAvailable, oauthStart } from "../../ipc/commands";
import { isConnected, useAuthStore } from "../../state/authStore";
import { errorMessage } from "../pinning/usePinSearch";

export type ConnectionStatus =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "connected"; count: number }
  | { kind: "error"; message: string };

export const itemsText = (n: number): string => `${n} item${n === 1 ? "" : "s"}`;
export const pagesText = (n: number): string => `${n} page${n === 1 ? "" : "s"}`;

/** Shared by Settings and onboarding: save a token, test it, disconnect, sign in with Notion. */
export function useConnection() {
  const auth = useAuthStore((s) => s.status);
  const [status, setStatus] = useState<ConnectionStatus>({ kind: "idle" });
  const [oauth, setOauth] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => {
    void oauthAvailable().then(setOauth).catch(() => setOauth(false));
  }, []);

  const test = useCallback(async () => {
    setStatus({ kind: "testing" });
    try {
      setStatus({ kind: "connected", count: (await authTestConnection()).count });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "Could not connect.") });
    }
  }, []);

  /** Saves a non-empty token (if given), then tests whatever is stored. */
  const saveAndTest = useCallback(async (token: string) => {
    const t = token.trim();
    if (t !== "") {
      try {
        await authSaveToken(t);
        await useAuthStore.getState().hydrate();
      } catch (e) {
        setStatus({ kind: "error", message: errorMessage(e, "Could not save the token.") });
        return;
      }
    }
    await test();
  }, [test]);

  const disconnect = useCallback(async () => {
    await authDisconnect();
    await useAuthStore.getState().hydrate();
    setStatus({ kind: "idle" });
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await oauthStart();
      await useAuthStore.getState().hydrate();
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e, "Could not connect.") });
    } finally {
      setSigningIn(false);
    }
  }, []);

  return { auth, hasToken: isConnected(auth), status, oauth, signingIn, test, saveAndTest, disconnect, signIn };
}
