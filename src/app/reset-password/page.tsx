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

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = React.useMemo(() => getSupabase(), []);

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [initChecking, setInitChecking] = React.useState(true);
  const [hasValidSession, setHasValidSession] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    async function checkRecovery() {
      try {
        // 1. Check for PKCE code in query params: ?code=...
        const code = searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && mounted) {
            setHasValidSession(true);
            setInitChecking(false);
            return;
          }
        }

        // 2. Check if a session already exists (e.g. hash token was processed by client)
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session && mounted) {
          setHasValidSession(true);
          setInitChecking(false);
          return;
        }

        // 3. Listen for PASSWORD_RECOVERY event
        const { data: authListener } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (!mounted) return;
            if (event === "PASSWORD_RECOVERY" || session) {
              setHasValidSession(true);
              setInitChecking(false);
            }
          }
        );

        // Fallback timeout so we don't spin indefinitely if the link was expired/invalid
        setTimeout(() => {
          if (mounted) {
            setInitChecking(false);
          }
        }, 1500);

        return () => {
          authListener.subscription.unsubscribe();
        };
      } catch (err) {
        console.error("Error verifying password recovery session:", err);
        if (mounted) setInitChecking(false);
      }
    }

    checkRecovery();

    return () => {
      mounted = false;
    };
  }, [supabase, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!password || password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center mb-2">
          <BrandLockup />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-xl">
          {initChecking ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <LoaderCircle className="w-8 h-8 animate-spin text-rose-500" />
              <p className="text-sm font-medium">Verifying reset link...</p>
            </div>
          ) : success ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold tracking-tight">Password Updated</h1>
                <p className="text-sm text-muted-foreground">
                  Your password has been changed successfully. You are signed in.
                </p>
              </div>
              <Button
                onClick={() => router.push("/")}
                className="w-full h-11 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl gap-2 mt-4"
              >
                Go to Speaking Lab
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5 text-center">
                <h1 className="text-xl font-bold tracking-tight">Reset Your Password</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Enter your new password below to secure your account.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 text-xs sm:text-sm rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!hasValidSession && (
                <div className="p-3 text-xs sm:text-sm rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    If this link was opened from an external app, your reset session may have expired. If updating fails, please request a new link.
                  </span>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="pl-9 pr-9 h-11 rounded-xl"
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      className="pl-9 pr-9 h-11 rounded-xl"
                      required
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl gap-2 shadow-lg shadow-rose-600/20"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="w-4 h-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  "Update Password"
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
          <LoaderCircle className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      }
    >
      <ResetPasswordForm />
    </React.Suspense>
  );
}
