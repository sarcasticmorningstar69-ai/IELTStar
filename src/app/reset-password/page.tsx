"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { BrandLockup } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Lock,
  Eye,
  EyeOff,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

/**
 * How the current session was obtained.
 *
 * "recovery"  - arrived through a password reset link, so possession of the
 *               emailed link is the proof of identity.
 * "existing"  - the browser was already signed in. Possession of an open tab
 *               is NOT proof of identity, so the current password is required
 *               before it can be changed. Without this distinction, brief
 *               access to an unlocked device is a permanent account takeover.
 * "none"      - no usable session; the link has expired.
 */
type SessionKind = "unknown" | "recovery" | "existing" | "none";

const MIN_PASSWORD_LENGTH = 8;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = React.useMemo(() => getSupabase(), []);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [initChecking, setInitChecking] = React.useState(true);
  const [sessionKind, setSessionKind] =
    React.useState<SessionKind>("unknown");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Subscribe first so the PASSWORD_RECOVERY event cannot fire before we are
    // listening. The subscription is torn down in this effect's cleanup, which
    // the previous version never did: it returned the cleanup from inside an
    // async function, so React received a Promise and discarded it.
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setSessionKind("recovery");
        setInitChecking(false);
      }
    });

    async function checkRecovery() {
      try {
        // 1. PKCE flow: ?code=... in the query string.
        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!mounted) return;
          if (!error) {
            setSessionKind("recovery");
            setInitChecking(false);
            return;
          }
        }

        // 2. Implicit flow: the SDK processes #access_token=...&type=recovery
        //    on load. The hash tells us the session came from a reset link.
        const hash =
          typeof window !== "undefined" ? window.location.hash : "";
        const cameFromRecoveryLink = hash.includes("type=recovery");

        // getSession() is fine here: this only decides which form to render.
        // The real authorisation happens server-side inside updateUser().
        const { data: sessionData } = await supabase.auth.getSession();
        if (!mounted) return;

        if (sessionData?.session) {
          setSessionKind(cameFromRecoveryLink ? "recovery" : "existing");
          setInitChecking(false);
          return;
        }

        // 3. Give the PASSWORD_RECOVERY listener a moment before giving up.
        timer = setTimeout(() => {
          if (!mounted) return;
          setSessionKind((prev) => (prev === "unknown" ? "none" : prev));
          setInitChecking(false);
        }, 3000);
      } catch (err) {
        console.error("Error verifying password recovery session:", err);
        if (mounted) {
          setSessionKind("none");
          setInitChecking(false);
        }
      }
    }

    checkRecovery();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      authListener.subscription.unsubscribe();
    };
  }, [supabase, searchParams]);

  const requiresCurrentPassword = sessionKind === "existing";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(
        "Password must be at least " + MIN_PASSWORD_LENGTH + " characters."
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    if (requiresCurrentPassword && !currentPassword) {
      setErrorMsg("Enter your current password to confirm this change.");
      return;
    }

    setLoading(true);

    try {
      // An ordinary logged-in session must prove it knows the current
      // password before it may replace it.
      if (requiresCurrentPassword) {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email;

        if (!email) {
          setErrorMsg(
            "Your session has expired. Please request a new reset link."
          );
          setLoading(false);
          return;
        }

        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });

        if (reauthError) {
          setErrorMsg("That current password is not correct.");
          setLoading(false);
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Revoke sessions in other browsers so a stolen session does not
      // outlive the password it was created with.
      try {
        await supabase.auth.signOut({ scope: "others" });
      } catch {
        /* non-fatal */
      }

      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to update password. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const brandButton =
    "w-full h-11 bg-[var(--brand)] hover:opacity-90 text-white font-medium " +
    "rounded-xl gap-2 transition-opacity";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center mb-2">
          <BrandLockup />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl">
          {initChecking ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <LoaderCircle className="w-8 h-8 animate-spin text-[var(--brand)]" />
              <p className="text-sm font-medium">Verifying reset link...</p>
            </div>
          ) : success ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight">
                  Password updated
                </h1>
                <p className="text-sm text-muted-foreground">
                  Your password has been changed and you are signed in. Any
                  other devices have been signed out.
                </p>
              </div>
              <Button onClick={() => router.push("/")} className={brandButton}>
                Go to Speaking Lab
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ) : sessionKind === "none" ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight">
                  This link has expired
                </h1>
                <p className="text-sm text-muted-foreground">
                  Reset links can only be used once, and they stop working after
                  a while. Request a new one and it will arrive in a moment.
                </p>
              </div>
              <Link href="/" className="block">
                <Button className={brandButton}>
                  Back to sign in
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-bold tracking-tight">
                  Choose a new password
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {requiresCurrentPassword
                    ? "You are already signed in, so please confirm your current password first."
                    : "Enter a new password for your account."}
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 text-xs sm:text-sm rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-3">
                {requiresCurrentPassword && (
                  <div className="space-y-1.5">
                    <Label htmlFor="current-password">Current password</Label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="current-password"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Your current password"
                        className="pl-9 pr-9 h-11 rounded-xl"
                        autoFocus
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        "At least " + MIN_PASSWORD_LENGTH + " characters"
                      }
                      className="pl-9 pr-9 h-11 rounded-xl"
                      autoFocus={!requiresCurrentPassword}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm new password</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      className="pl-9 pr-9 h-11 rounded-xl"
                      required
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" disabled={loading} className={brandButton}>
                {loading ? (
                  <>
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  "Update password"
                )}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to IELTStar Speaking Lab
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <LoaderCircle className="w-8 h-8 animate-spin text-[var(--brand)]" />
        </div>
      }
    >
      <ResetPasswordForm />
    </React.Suspense>
  );
}
