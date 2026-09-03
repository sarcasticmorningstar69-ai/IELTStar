"use client";

import * as React from "react";
import { useAuth, type AuthTab } from "@/lib/auth/auth-context";
import { BandWheelPicker } from "@/components/auth/band-wheel-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StarMark } from "@/components/shared/brand";
import { cn } from "@/lib/utils";
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Laptop,
  ArrowRight,
  Sparkles,
  Calendar,
} from "lucide-react";

const TIMELINE_OPTIONS = [
  { id: "1m", label: "Under 1 Month" },
  { id: "3m", label: "1 – 3 Months" },
  { id: "6m", label: "3 – 6 Months" },
  { id: "flexible", label: "Just Practicing" },
];

export function AuthModal() {
  const {
    authModalOpen,
    authModalTab,
    closeAuthModal,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPassword,
    updateProfile,
    profile,
  } = useAuth();

  const [tab, setTab] = React.useState<AuthTab>("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [targetBand, setTargetBand] = React.useState(7.5);
  const [testTimeline, setTestTimeline] = React.useState("3m");
  const [showPassword, setShowPassword] = React.useState(false);

  const [loading, setLoading] = React.useState(false);
  const [googleLoading, setGoogleLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");

  React.useEffect(() => {
    if (authModalOpen) {
      setTab(authModalTab);
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [authModalOpen, authModalTab]);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (tab === "signin") {
        const { error } = await signInWithEmail(email.trim(), password);
        if (error) {
          if (error.message?.toLowerCase().includes("email not confirmed")) {
            throw new Error(
              "Account registered, but email confirmation is active in your Supabase project. Turn off 'Confirm email' in Supabase Dashboard -> Auth -> Providers -> Email for instant logins."
            );
          }
          throw error;
        }
      } else if (tab === "signup") {
        if (!email.trim() || !password) {
          throw new Error("Please fill in all required fields.");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }
        const { error, needsEmailVerification } = await signUpWithEmail(
          email.trim(),
          password,
          { name: name.trim() || undefined, targetBand: 7.5 }
        );
        if (error) throw error;

        if (needsEmailVerification) {
          setSuccessMsg(
            "Account created! Please check your email to verify your address before signing in."
          );
          return;
        }

        // Transition immediately to the interactive Rotary Target Band step
        setTab("target-band");
      } else if (tab === "forgot") {
        if (!email.trim()) throw new Error("Please enter your email address.");
        const { error } = await resetPassword(email.trim());
        if (error) throw error;
        setSuccessMsg("Password reset link has been sent to your email.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed. Please try again.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTargetBand = async () => {
    setLoading(true);
    try {
      await updateProfile({
        targetBand,
        testDate: testTimeline,
        name: name.trim() || profile?.name,
      });
      closeAuthModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save target score.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg("");
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Google sign-in is not enabled yet in your Supabase dashboard.";
      setErrorMsg(msg);
      setGoogleLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-md animate-in fade-in duration-200"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account Login and Registration"
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-3xl border border-border/80 bg-card p-6 shadow-2xl transition-all sm:p-8",
          tab === "target-band" ? "max-w-[460px]" : "max-w-[440px]"
        )}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={closeAuthModal}
          className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ------------------------------------------------------------- */}
        {/* ROTARY SPINNER TARGET BAND ONBOARDING STEP                    */}
        {/* ------------------------------------------------------------- */}
        {tab === "target-band" ? (
          <div className="flex flex-col items-center animate-in fade-in-50 zoom-in-95 duration-200 text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft shadow-inner">
              <StarMark size={32} />
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-0.5 text-[11px] font-semibold text-brand-bright">
              <Sparkles className="h-3 w-3" />
              <span>Account Active</span>
            </div>

            <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
              Set Your Target IELTS Band
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Rotate the dial or tap a score to set your goal.
            </p>

            {errorMsg && (
              <div className="mt-3 flex w-full items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive text-left">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{errorMsg}</p>
              </div>
            )}

            {/* Rotary Band Wheel Spinner */}
            <div className="mt-4 w-full">
              <BandWheelPicker
                value={targetBand}
                onChange={setTargetBand}
              />
            </div>

            {/* Exam timeline */}
            <div className="mt-4 w-full space-y-1.5">
              <Label className="text-xs font-semibold text-foreground flex items-center justify-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-brand-bright" />
                <span>When is your IELTS exam?</span>
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TIMELINE_OPTIONS.map((opt) => {
                  const active = testTimeline === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTestTimeline(opt.id)}
                      className={cn(
                        "rounded-xl border py-1.5 px-2 text-center text-[11px] font-medium transition-all",
                        active
                          ? "border-brand-bright bg-brand-soft text-brand-bright font-semibold shadow-sm"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save Target Button */}
            <Button
              type="button"
              onClick={handleSaveTargetBand}
              disabled={loading}
              className="mt-5 w-full gap-2 rounded-xl py-5 text-xs font-semibold shadow-md"
            >
              {loading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Save Target & Start Speaking</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        ) : (
          /* ------------------------------------------------------------- */
          /* STANDARD SIGN IN / CREATE ACCOUNT / FORGOT PASSWORD VIEWS    */
          /* ------------------------------------------------------------- */
          <>
            {/* Header Branding */}
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft shadow-inner">
                <StarMark size={32} />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {tab === "signin" && "Welcome back to IELTStar"}
                {tab === "signup" && "Create your IELTStar Account"}
                {tab === "forgot" && "Reset your password"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {tab === "signin" && "Sign in to sync your practice, streak, and recordings across devices."}
                {tab === "signup" && "Save your band scores and practice seamlessly on mobile and desktop."}
                {tab === "forgot" && "Enter your email and we will send you a secure recovery link."}
              </p>
            </div>

            {/* Cross-device sync badge */}
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-brand-bright/20 bg-brand-soft/60 px-3 py-1.5 text-[11px] font-medium text-brand-bright">
              <Laptop className="h-3.5 w-3.5" />
              <span>Desktop</span>
              <ArrowRight className="h-3 w-3 opacity-60" />
              <Smartphone className="h-3.5 w-3.5" />
              <span>Mobile Sync</span>
            </div>

            {/* Tab switchers */}
            {tab !== "forgot" && (
              <div className="mt-5 grid grid-cols-2 rounded-xl border border-border bg-muted/40 p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => { setTab("signin"); setErrorMsg(""); setSuccessMsg(""); }}
                  className={cn(
                    "rounded-lg py-2 transition-all",
                    tab === "signin"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setTab("signup"); setErrorMsg(""); setSuccessMsg(""); }}
                  className={cn(
                    "rounded-lg py-2 transition-all",
                    tab === "signup"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Create Account
                </button>
              </div>
            )}

            {/* Error / Success Alerts */}
            {errorMsg && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{errorMsg}</p>
              </div>
            )}

            {successMsg && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{successMsg}</p>
              </div>
            )}

            {/* Google OAuth Button */}
            {tab !== "forgot" && (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading || loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-border bg-surface py-5 text-xs font-semibold text-foreground transition-all hover:bg-muted"
                >
                  {googleLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  Continue with Google
                </Button>

                <div className="relative my-4 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <span className="relative bg-card px-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    or with email
                  </span>
                </div>
              </div>
            )}

            {/* Email & Password Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {tab === "signup" && (
                <div>
                  <Label className="text-xs font-medium text-foreground">Your Name</Label>
                  <div className="relative mt-1">
                    <UserIcon className="absolute top-3 left-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="e.g. Alex Johnson"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-xl pl-10 text-xs"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs font-medium text-foreground">Email Address</Label>
                <div className="relative mt-1">
                  <Mail className="absolute top-3 left-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl pl-10 text-xs"
                  />
                </div>
              </div>

              {tab !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-foreground">Password</Label>
                    {tab === "signin" && (
                      <button
                        type="button"
                        onClick={() => { setTab("forgot"); setErrorMsg(""); setSuccessMsg(""); }}
                        className="text-[11px] text-brand-bright hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1">
                    <Lock className="absolute top-3 left-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder={tab === "signup" ? "At least 6 characters" : "••••••••"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl pr-10 pl-10 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || googleLoading}
                className="mt-2 w-full gap-2 rounded-xl py-5 text-xs font-semibold shadow-md"
              >
                {loading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {tab === "signin" && "Sign In to IELTStar"}
                    {tab === "signup" && "Create Account"}
                    {tab === "forgot" && "Send Recovery Link"}
                  </>
                )}
              </Button>

              {tab === "forgot" && (
                <button
                  type="button"
                  onClick={() => { setTab("signin"); setErrorMsg(""); setSuccessMsg(""); }}
                  className="mt-2 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  Back to Sign In
                </button>
              )}
            </form>

            <p className="mt-5 text-center text-[10px] text-muted-foreground">
              By continuing, you agree to IELTStar&apos;s Terms of Service and Privacy Policy.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
