"use client";

import * as React from "react";
import type { User, Session, AuthError } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  targetBand?: number;
  testDate?: string;
  avatarUrl?: string;
}

export type AuthTab = "signin" | "signup" | "forgot" | "target-band";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: UserProfile | null;
  authModalOpen: boolean;
  authModalTab: AuthTab;
  openAuthModal: (tab?: AuthTab) => void;
  closeAuthModal: () => void;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error: AuthError | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
    metadata?: { name?: string; targetBand?: number }
  ) => Promise<{
    error: AuthError | null;
    needsEmailVerification?: boolean;
    sessionCreated?: boolean;
  }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

/**
 * Display-only cache of the signed-in student's profile.
 *
 * This exists so the UI can paint their name and target band instantly on a
 * cold load. It is NEVER a source of authentication: a cached profile cannot
 * create a user or a session. An earlier version of this file synthesised a
 * `User` object from this key when Supabase had no session, which meant anyone
 * could sign in as anyone by editing localStorage, and which also silently
 * gave students a `local-<random>` id that no server knew about, so their
 * progress never synced across devices.
 */
const LOCAL_PROFILE_KEY = "ieltstar_user_profile";

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = React.useState(false);
  const [authModalTab, setAuthModalTab] = React.useState<AuthTab>("signin");

  const supabase = React.useMemo(() => getSupabase(), []);

  const buildProfileFromUser = (u: User | null): UserProfile | null => {
    if (!u) return null;
    return {
      id: u.id,
      email: u.email || "",
      name:
        u.user_metadata?.full_name ||
        u.user_metadata?.name ||
        u.email?.split("@")[0] ||
        "Student",
      targetBand: u.user_metadata?.target_band
        ? Number(u.user_metadata.target_band)
        : 7.5,
      testDate: u.user_metadata?.test_date || "",
      avatarUrl: u.user_metadata?.avatar_url || "",
    };
  };

  const getCachedProfile = (): UserProfile | null => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(LOCAL_PROFILE_KEY);
      return stored ? (JSON.parse(stored) as UserProfile) : null;
    } catch {
      return null;
    }
  };

  const saveCachedProfile = (p: UserProfile | null) => {
    if (typeof window === "undefined") return;
    try {
      if (p) localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(p));
      else localStorage.removeItem(LOCAL_PROFILE_KEY);
    } catch {
      /* ignore */
    }
  };

  const applySession = React.useCallback((next: Session | null) => {
    setSession(next);
    if (next?.user) {
      setUser(next.user);
      const prof = buildProfileFromUser(next.user);
      setProfile(prof);
      saveCachedProfile(prof);
    } else {
      setUser(null);
      setProfile(null);
      saveCachedProfile(null);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        // getUser() validates the token with the auth server. getSession()
        // only reads local storage, so it must not gate anything.
        const { data, error } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error || !data?.user) {
          setUser(null);
          setSession(null);
          setProfile(null);
          saveCachedProfile(null);
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(sessionData?.session ?? null);
        setUser(data.user);
        const prof = buildProfileFromUser(data.user);
        setProfile(prof);
        saveCachedProfile(prof);
      } catch (err) {
        console.error("Supabase auth init error:", err);
        if (mounted) {
          setUser(null);
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      applySession(newSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, applySession]);

  const openAuthModal = React.useCallback((tab: AuthTab = "signin") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = React.useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error };
    }

    applySession(data.session ?? null);
    closeAuthModal();
    return { error: null };
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    metadata?: { name?: string; targetBand?: number }
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata?.name || email.split("@")[0],
          target_band: metadata?.targetBand || 7.5,
        },
      },
    });

    if (error) {
      return { error, needsEmailVerification: false, sessionCreated: false };
    }

    // With "Confirm email" disabled in the Supabase dashboard, signUp returns a
    // session immediately and no email is sent, so the 2-emails-per-hour limit
    // on the built-in provider never applies.
    if (data.session) {
      applySession(data.session);
      closeAuthModal();
      return {
        error: null,
        needsEmailVerification: false,
        sessionCreated: true,
      };
    }

    // No session means the project still requires email confirmation. Tell the
    // student the truth rather than faking a signed-in state.
    return { error: null, needsEmailVerification: true, sessionCreated: false };
  };

  const signInWithGoogle = async () => {
    const redirectUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    saveCachedProfile(null);
  };

  const resetPassword = async (email: string) => {
    const redirectUrl =
      typeof window !== "undefined"
        ? window.location.origin + "/reset-password"
        : "";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error };
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!user) {
      openAuthModal("signin");
      return;
    }

    const current = profile || getCachedProfile();
    const updated: UserProfile = {
      id: user.id,
      email: user.email || current?.email || "",
      name: data.name ?? current?.name ?? "Student",
      targetBand: data.targetBand ?? current?.targetBand ?? 7.5,
      testDate: data.testDate ?? current?.testDate ?? "",
      avatarUrl: data.avatarUrl ?? current?.avatarUrl ?? "",
    };

    setProfile(updated);
    saveCachedProfile(updated);

    try {
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.full_name = data.name;
      if (data.targetBand !== undefined) updates.target_band = data.targetBand;
      if (data.testDate !== undefined) updates.test_date = data.testDate;
      if (Object.keys(updates).length > 0) {
        await supabase.auth.updateUser({ data: updates });
      }
    } catch (err) {
      console.warn("Could not sync profile to Supabase:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        profile,
        authModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
        resetPassword,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
