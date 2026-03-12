"use client";

import Loading from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppData, user_service } from "@/context/AppContext";
import { getSecureCookieFlag } from "@/lib/auth-token";
import { getApiErrorMessage } from "@/lib/api-error";
import { useGoogleLogin } from "@react-oauth/google";
import axios from "axios";
import Cookies from "js-cookie";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  Mail,
  PenSquare,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  WandSparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";

const LoginPage = () => {
  const { isAuth, setIsAuth, loading, setLoading, setUser, setApiErrorMessage, clearApiError } =
    useAppData();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");

  useEffect(() => {
    if (isAuth) {
      router.replace("/blogs");
    }
  }, [isAuth, router]);

  const responseGoogle = async (authResult: { code?: string }) => {
    const code = authResult?.code;

    if (!code) {
      const message = "Google login did not return a valid code.";
      setApiErrorMessage(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    clearApiError();

    try {
      const result = await axios.post(`${user_service}/api/v1/login`, { code });

      Cookies.set("token", result.data.token, {
        expires: 5,
        secure: getSecureCookieFlag(),
        path: "/",
      });

      toast.success(result.data.message ?? "Logged in successfully");
      setIsAuth(true);
      setUser(result.data.user);
      setApiErrorMessage(null);
      router.replace("/blogs");
    } catch (error) {
      const message = getApiErrorMessage(error, "Login failed. Please try again.");
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: responseGoogle,
    onError: () => responseGoogle({}),
    flow: "auth-code",
    ux_mode: "popup",
    redirect_uri: "postmessage",
  });

  if (loading) {
    return <Loading />;
  }

  const handleEmailAuth = async () => {
    if (!formEmail.trim() || !formPassword.trim() || (mode === "signup" && !formName.trim())) {
      const message =
        mode === "signup"
          ? "Name, email, and password are required."
          : "Email and password are required.";
      setApiErrorMessage(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    clearApiError();

    try {
      const endpoint =
        mode === "signup"
          ? `${user_service}/api/v1/auth/register`
          : `${user_service}/api/v1/auth/login`;

      const payload =
        mode === "signup"
          ? { name: formName.trim(), email: formEmail.trim(), password: formPassword }
          : { email: formEmail.trim(), password: formPassword };

      const result = await axios.post(endpoint, payload);

      Cookies.set("token", result.data.token, {
        expires: 5,
        secure: getSecureCookieFlag(),
        path: "/",
      });

      toast.success(result.data.message ?? "Authenticated successfully");
      setIsAuth(true);
      setUser(result.data.user);
      setApiErrorMessage(null);
      router.replace("/blogs");
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        mode === "signup" ? "Sign up failed. Please try again." : "Login failed. Please try again."
      );
      setApiErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-6xl items-center py-8">
      <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-8 h-64 w-64 rounded-full bg-sky-400/25 blur-3xl" />

      <div className="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="premium-panel animate-fade-up gap-0 overflow-hidden border-0 py-0">
          <div className="bg-gradient-to-r from-slate-900 via-slate-700 to-sky-700 p-6 text-white sm:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">Blogify Workspace</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">
              Publish confidently, scale your writing flow
            </h1>
            <p className="mt-3 max-w-xl text-sm text-white/80 sm:text-base">
              One account connects blog writing, saved posts, profile insights, and comments across your microservices.
            </p>
          </div>

          <CardContent className="space-y-4 p-5 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="premium-panel-soft p-3">
                <PenSquare className="mb-2 size-4 text-ft-accent" />
                <p className="text-sm font-semibold text-foreground">Creator-first editor</p>
                <p className="mt-1 text-xs text-muted-foreground">Draft and publish with full control.</p>
              </div>
              <div className="premium-panel-soft p-3">
                <Users className="mb-2 size-4 text-ft-sky" />
                <p className="text-sm font-semibold text-foreground">Unified identity</p>
                <p className="mt-1 text-xs text-muted-foreground">Consistent profile across all services.</p>
              </div>
              <div className="premium-panel-soft p-3">
                <ShieldCheck className="mb-2 size-4 text-emerald-600" />
                <p className="text-sm font-semibold text-foreground">Secure session</p>
                <p className="mt-1 text-xs text-muted-foreground">Token and account checks on every request.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="panze-pill">Google OAuth</span>
              <span className="panze-pill">Blogify-ready</span>
              <span className="panze-pill">Fast onboarding</span>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-panel animate-fade-up border-0 p-3 [animation-delay:120ms]">
          <CardHeader className="space-y-2">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
              <WandSparkles className="size-3.5" />
              Sign in
            </p>
            <CardTitle className="premium-section-title text-3xl font-semibold text-foreground">
              Continue with Google
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Use your Google account to access writing tools, profile customization, and social actions.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-full border border-ft-border bg-ft-card p-1">
              <button
                type="button"
                className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                  mode === "login"
                    ? "bg-ft-accent text-ft-bg"
                    : "text-ft-muted hover:text-ft-text"
                }`}
                onClick={() => setMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                  mode === "signup"
                    ? "bg-ft-accent text-ft-bg"
                    : "text-ft-muted hover:text-ft-text"
                }`}
                onClick={() => setMode("signup")}
              >
                Sign up
              </button>
            </div>

            <div className="space-y-3">
              {mode === "signup" && (
                <div>
                  <label className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    <UserRound className="size-3.5" /> Name
                  </label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Your name"
                    className="h-11 rounded-xl border-ft-border bg-ft-card text-ft-text"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Mail className="size-3.5" /> Email
                </label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="name@email.com"
                  className="h-11 rounded-xl border-ft-border bg-ft-card text-ft-text"
                />
              </div>
              <div>
                <label className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  <Lock className="size-3.5" /> Password
                </label>
                <Input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 8 characters" : "Your password"}
                  className="h-11 rounded-xl border-ft-border bg-ft-card text-ft-text"
                />
              </div>
            </div>

            <Button
              onClick={handleEmailAuth}
              className="h-12 w-full rounded-xl text-sm font-semibold"
            >
              {mode === "signup" ? "Create account" : "Login with email"}
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px w-full bg-ft-border" />
              <span>or</span>
              <span className="h-px w-full bg-ft-border" />
            </div>

            <Button
              onClick={() => googleLogin()}
              className="h-12 w-full justify-between rounded-xl px-4 text-sm font-semibold"
            >
              <span className="inline-flex items-center gap-2">
                <img src="/google.png" className="h-5 w-5" alt="Google icon" />
                Login with Google
              </span>
              <ArrowRight className="size-4" />
            </Button>

            <div className="premium-panel-soft space-y-2 p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Lock className="size-3.5" />
                Protected Access
              </p>
              <p className="text-sm text-muted-foreground">
                We only use verified account details for authentication and profile ownership mapping.
              </p>
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-600" />
                No password stored in this app
              </p>
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-amber-500" />
                Immediate access after successful sign in
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};

export default LoginPage;
