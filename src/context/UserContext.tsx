"use client";

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/supabase/queries/users";
import type { User } from "@/types/user";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { routing } from "@/i18n/routing";

interface UserContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    role: "student" | "tutor" | "both",
    options?: { emailRedirectTo?: string; username?: string }
  ) => Promise<"signed_in" | "email_confirmation_required">;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Id of the profile already in state, read inside the auth listener.
  const loadedUserIdRef = useRef<string | null>(null);
  // User whose profile the initial session load fetched, and whether that load
  // is still running: SIGNED_IN fires while supabase-js restores the session,
  // before getSession() resolves, and must not trigger a second fetch (F077).
  const initialUserIdRef = useRef<string | null>(null);
  const initializingRef = useRef(true);
  useEffect(() => {
    loadedUserIdRef.current = user?.id ?? null;
  }, [user]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const supabase = useMemo(() => createClient(), []);

  // Initialize: Check for existing session
  useEffect(() => {
    async function initializeUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          initialUserIdRef.current = session.user.id;
          const userData = await getCurrentUser(session.user.id);
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (err) {
        setError(err as Error);
        setUser(null);
      } finally {
        initializingRef.current = false;
        setIsLoading(false);
      }
    }

    initializeUser();

    async function syncUser(userId: string) {
      try {
        const userData = await getCurrentUser(userId);
        setUser(userData);
      } catch (err) {
        setError(err as Error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    // Listen for auth changes. The callback must stay synchronous: awaiting
    // Supabase calls inside it deadlocks the auth client's internal lock
    // (every query then hangs after a token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // initializeUser() already covers the initial session, and a token
      // refresh does not change the profile.
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      // SIGNED_IN also fires on load and right after login(), which already
      // loaded this same profile: skip the duplicate users fetch.
      if (
        event === "SIGNED_IN" &&
        (initializingRef.current ||
          session?.user.id === loadedUserIdRef.current ||
          session?.user.id === initialUserIdRef.current)
      ) {
        return;
      }

      if (session?.user) {
        const userId = session.user.id;
        setTimeout(() => void syncUser(userId), 0);
      } else {
        initialUserIdRef.current = null;
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setError(null);
      setIsLoading(true);

      const { data, error: authError } = await supabase.auth.signInWithPassword(
        {
          email,
          password,
        }
      );

      if (authError) {
        throw authError;
      }

      if (data?.user) {
        // Get user data from public.users table
        const userData = await getCurrentUser();
        setUser(userData);
      } else {
        throw new Error("Login failed: No user data returned");
      }
    } catch (error) {
      setError(error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  const register = useCallback(
    async (
      email: string,
      password: string,
      role: "student" | "tutor" | "both",
      options?: { emailRedirectTo?: string; username?: string }
    ) => {
      try {
        setError(null);
        setIsLoading(true);

        const isStudent = role === "student" || role === "both";
        const isTutor = role === "tutor" || role === "both";

        // Sign up with Supabase Auth
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: options?.emailRedirectTo,
            data: {
              is_student: isStudent,
              is_tutor: isTutor,
              // Read by the handle_new_user trigger (migration 040).
              ...(options?.username?.trim() ? { username: options.username.trim() } : {}),
            },
          },
        });

        if (authError) {
          throw authError;
        }

        if (!data.user) {
          throw new Error("Registration failed: No user data returned");
        }

        // If email confirmation is enabled, Supabase returns no session.
        // In that case, we should not attempt DB writes (RLS will block unauthenticated users).
        // The DB rows should be created by a trigger using auth.users metadata.
        if (!data.session) {
          return "email_confirmation_required";
        }

        // Get the updated user data
        const userData = await getCurrentUser();
        setUser(userData);
        return "signed_in";
      } catch (error) {
        setError(error as Error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [supabase]
  );

  const logout = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Sign out from Supabase - this will clear the session and cookies
      // The onAuthStateChange listener will automatically set user to null.
      // Only this device: other sessions (phone, other browser) stay open (F085).
      const { error: authError } = await supabase.auth.signOut({ scope: "local" });

      if (authError) {
        throw authError;
      }

      // Clear user state immediately as a fallback
      // The listener should also handle this, but we do it here for immediate feedback
      setUser(null);
    } catch (error) {
      setError(error as Error);
      // Even if there's an error, clear the user state
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
      // Full navigation so no page keeps rendering the previous user's data.
      const locale =
        routing.locales.find((l) => l === document.documentElement.lang) ??
        routing.defaultLocale;
      window.location.replace(`/${locale}/login`);
    }
  }, [supabase]);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
    } catch (error) {
      setError(error as Error);
    }
  }, []);

  const value = useMemo(
    () => ({ user, login, register, logout, refreshUser, isLoading, error }),
    [user, login, register, logout, refreshUser, isLoading, error]
  );

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within a UserProvider");
  }
  return context;
}
