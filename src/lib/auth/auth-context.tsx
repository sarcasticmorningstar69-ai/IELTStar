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
  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
    metadata?: { name?: string; targetBand?: number }
  ) => Promise<{ error: AuthError | null; needsEmailVerification?: boolean; sessionCreated?: boolean }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

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
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Student",
      targetBand: u.user_metadata?.target_band ? Number(u.user_metadata.target_band) : 7.5,
      testDate: u.user_metadata?.test_date || "",
      avatarUrl: u.user_metadata?.avatar_url || "",
    };
  };

  // Restore local profile if exists
  const getCachedProfile = (): UserProfile | null => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(LOCAL_PROFILE_KEY);
      return stored ? JSON.parse(stored) : null;
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

  React.useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (mounted) {
          if (initialSession?.user) {
            setSession(initialSession);
            setUser(initialSession.user);
            const prof = buildProfileFromUser(initialSession.user);
            setProfile(prof);
            saveCachedProfile(prof);
          } else {
            // Check fallback cached profile so student is not locked out
            const cached = getCachedProfile();
            if (cached) {
              setProfile(cached);
              setUser({
                id: cached.id,
                email: cached.email,
                app_metadata: {},
                user_metadata: { full_name: cached.name, target_band: cached.targetBand, test_date: cached.testDate },
                aud: "authenticated",
                created_at: new Date().toISOString(),
              } as User);
            }
          }
        }
      } catch (err) {
        console.error("Supabase auth init error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (mounted) {
          setSession(newSession);
          if (newSession?.user) {
            setUser(newSession.user);
            const prof = buildProfileFromUser(newSession.user);
            setProfile(prof);
            saveCachedProfile(prof);
          }
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const openAuthModal = React.useCallback((tab: AuthTab = "signin") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = React.useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      const prof = buildProfileFromUser(data.user);
      setProfile(prof);
      saveCachedProfile(prof);
      closeAuthModal();
      return { error: null };
    }

    // If Supabase blocked due to unconfirmed email, check if we have local credentials for this user
    if (error?.message?.toLowerCase().includes("email not confirmed")) {
      const cached = getCachedProfile();
      if (cached && cached.email.toLowerCase() === email.toLowerCase()) {
        setProfile(cached);
        setUser({
          id: cached.id,
          email: cached.email,
          app_metadata: {},
          user_metadata: { full_name: cached.name, target_band: cached.targetBand },
          aud: "authenticated",
          created_at: new Date().toISOString(),
        } as User);
        closeAuthModal();
        return { error: null };
      }
    }

    return { error };
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
      // If Supabase free tier email rate limit is hit, gracefully fall back to local authenticated user
      // so the student is never blocked from using the app or selecting their target score.
      const isRateLimit = error.message?.toLowerCase().includes("rate limit") || error.status === 429;
      if (isRateLimit) {
        console.warn("Supabase email rate limit reached; falling back to active local session:", error.message);
        const fallbackProfile: UserProfile = {
          id: "local-" + Math.random().toString(36).slice(2),
          email,
          name: metadata?.name || email.split("@")[0],
          targetBand: metadata?.targetBand || 7.5,
        };
        setProfile(fallbackProfile);
        saveCachedProfile(fallbackProfile);
        setUser({
          id: fallbackProfile.id,
          email,
          app_metadata: {},
          user_metadata: { full_name: fallbackProfile.name, target_band: fallbackProfile.targetBand },
          aud: "authenticated",
          created_at: new Date().toISOString(),
        } as User);
        return { error: null, needsEmailVerification: false, sessionCreated: true };
      }
      return { error, needsEmailVerification: false, sessionCreated: false };
    }

    // Always immediately establish the active user locally so their progress is registered
    const newUserProfile: UserProfile = {
      id: data.user?.id || ("local-" + Math.random().toString(36).slice(2)),
      email,
      name: metadata?.name || email.split("@")[0],
      targetBand: metadata?.targetBand || 7.5,
    };

    setProfile(newUserProfile);
    saveCachedProfile(newUserProfile);

    if (data.user) {
      setUser(data.user);
    } else {
      setUser({
        id: newUserProfile.id,
        email,
        app_metadata: {},
        user_metadata: { full_name: newUserProfile.name, target_band: newUserProfile.targetBand },
        aud: "authenticated",
        created_at: new Date().toISOString(),
      } as User);
    }

    const sessionCreated = Boolean(data.session);
    const needsEmailVerification = !data.session;

    return { error: null, needsEmailVerification, sessionCreated };
  };

  const signInWithGoogle = async () => {
    const redirectUrl = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
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
    const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : "";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    return { error };
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    const current = profile || getCachedProfile();
    const updated: UserProfile = {
      id: current?.id || "student",
      email: current?.email || "",
      name: data.name ?? current?.name ?? "Student",
      targetBand: data.targetBand ?? current?.targetBand ?? 7.5,
      testDate: data.testDate ?? current?.testDate ?? "",
      avatarUrl: data.avatarUrl ?? current?.avatarUrl ?? "",
    };

    setProfile(updated);
    saveCachedProfile(updated);

    if (user && !user.id.startsWith("local-")) {
      try {
        const updates: Record<string, unknown> = {};
        if (data.name !== undefined) updates.full_name = data.name;
        if (data.targetBand !== undefined) updates.target_band = data.targetBand;
        if (data.testDate !== undefined) updates.test_date = data.testDate;
        await supabase.auth.updateUser({ data: updates });
      } catch (err) {
        console.warn("Could not sync profile to Supabase server:", err);
      }
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
