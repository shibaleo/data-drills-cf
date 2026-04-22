"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { LoginPage } from "./login-page";

export interface MeUser {
  id: string;
  name: string;
  email: string;
}

interface UserContextValue {
  me: MeUser;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function useMe(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useMe must be used within AuthGate");
  return ctx;
}

type AuthState = "loading" | "authenticated" | "unauthenticated";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const [state, setState] = useState<AuthState>("loading");
  const [me, setMe] = useState<MeUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkKey, setCheckKey] = useState(0);

  const fetchMe = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/v1/me");
      if (res.ok) {
        const json = await res.json();
        setMe(json.data);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, []);

  const verifySession = useCallback(async () => {
    setState("loading");
    setError(null);
    const ok = await fetchMe();
    if (ok) {
      setState("authenticated");
    } else {
      if (isSignedIn) {
        setError("Authentication failed");
        await signOut();
      }
      setState("unauthenticated");
    }
  }, [isSignedIn, signOut, fetchMe]);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      verifySession();
    } else {
      fetchMe().then((ok) => {
        setState(ok ? "authenticated" : "unauthenticated");
      });
    }
  }, [isLoaded, isSignedIn, checkKey, verifySession, fetchMe]);

  if (state === "loading" || (state === "authenticated" && !me)) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (state === "unauthenticated" || !me) {
    return (
      <LoginPage
        error={error}
        onPasswordLogin={() => setCheckKey((k) => k + 1)}
      />
    );
  }

  return (
    <UserContext.Provider value={{ me, refresh: async () => { await fetchMe(); } }}>
      {children}
    </UserContext.Provider>
  );
}
