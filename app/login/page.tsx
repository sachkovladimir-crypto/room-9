"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthSplitLayout, LightField, lightInputClass } from "@/components/AuthSplitLayout";
import { MissingConfigNotice } from "@/components/AuthNotice";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import { loadRoleAccess } from "@/lib/roleAccess";
import { hasRoleAccess, type Profile, type Role } from "@/lib/types";

function getSafeNextPath() {
  if (typeof window === "undefined") {
    return "";
  }

  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "";
  }

  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registerHref, setRegisterHref] = useState("/register");

  useEffect(() => {
    const nextPath = getSafeNextPath();
    if (nextPath) {
      setRegisterHref(`/register?next=${encodeURIComponent(nextPath)}`);
    }
  }, []);

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabase();
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError || !data.user) {
        logSupabaseError("Login signInWithPassword failed", loginError);
        setError(formatSupabaseError(loginError, "Invalid email or password."));
        setIsSubmitting(false);
        return;
      }

      const { data: profileRowData, error: profileLoadError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileLoadError) {
        logSupabaseError("Login profile load failed", profileLoadError);
        setError(formatSupabaseError(profileLoadError, "Logged in, but profile could not load."));
        setIsSubmitting(false);
        return;
      }

      let profileRow = profileRowData;

      if (!profileRow) {
        const { error: profileCreateError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          email: data.user.email,
          role: "listener"
        });

        if (profileCreateError) {
          logSupabaseError("Login fallback profile upsert failed", profileCreateError);
          setError(
            formatSupabaseError(
              profileCreateError,
              "Logged in, but ROOM_9 could not create the profile row."
            )
          );
          setIsSubmitting(false);
          return;
        }

        const retry = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
        if (retry.error) {
          logSupabaseError("Login fallback profile reload failed", retry.error);
          setError(formatSupabaseError(retry.error, "Profile row was created but could not load."));
          setIsSubmitting(false);
          return;
        }
        profileRow = retry.data;
      }

      const profile = profileRow as Profile | null;
      const activeRoles: Role[] = profile ? await loadRoleAccess(supabase, profile.id, profile.role) : ["listener"];
      const nextPath = getSafeNextPath();
      router.push(nextPath || (hasRoleAccess(activeRoles, ["dj", "organizer", "venue", "admin"]) ? "/dashboard" : "/explore"));
      router.refresh();
    } catch (caughtError) {
      logSupabaseError("Login unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Unable to sign in."));
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout
      eyebrow="Listener system"
      title="RETURN TO ROOM_9."
      subtitle="Access your listening library, booking cases, artist tools, streams, and messages from one account."
    >
      <div>
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-neutral-600">System.01</p>
        <h1 className="mt-3 font-display text-[48px] uppercase leading-none text-black">Login</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-700">
          Access your bookings, tracks, streams and messages.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <LightField id="email" label="Email">
              <input
                className={lightInputClass}
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                placeholder="user@domain.com"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
          </LightField>

          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <label className="block font-mono text-sm font-black uppercase text-neutral-700" htmlFor="password">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500 underline underline-offset-4 hover:text-black"
              >
                Forgot?
              </Link>
            </div>
              <input
                className={lightInputClass}
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                placeholder="Minimum 6 characters"
                onChange={(event) => setPassword(event.target.value)}
                required
              />
          </div>

          {error ? <p className="border border-errorRed p-3 text-sm text-errorRed">{error}</p> : null}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center border border-acidGreen bg-acidGreen px-5 py-3 font-mono text-xs font-black uppercase text-black transition hover:border-black hover:bg-black hover:text-bone disabled:opacity-50"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Entering..." : "Enter System →"}
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-700">
          No account?{" "}
          <Link href={registerHref} className="font-black text-black underline underline-offset-4">
            Register
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
