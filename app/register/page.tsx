"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthSplitLayout, LightField, lightInputClass } from "@/components/AuthSplitLayout";
import { DemoModeNotice, MissingConfigNotice } from "@/components/AuthNotice";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import { getPasswordError, getPasswordChecks } from "@/lib/password";
import { getPostAuthPath } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [requestedAccess, setRequestedAccess] = useState("listener");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRole = params.get("role");

    if (requestedRole === "dj" || requestedRole === "organizer" || requestedRole === "venue") {
      setRequestedAccess(requestedRole);
    }
  }, []);

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const passwordError = getPasswordError(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabase();
      const nextPath = getSafeNextPath();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}/login` : undefined,
          data: { role: "listener", requested_access: requestedAccess, display_name: displayName }
        }
      });

      if (signUpError) {
        logSupabaseError("Register signUp failed", signUpError);
        setError(formatSupabaseError(signUpError, "Could not create account."));
        setIsSubmitting(false);
        return;
      }

      if (!data.user) {
        setError("Supabase did not return a user after sign up. Check Auth email settings.");
        setIsSubmitting(false);
        return;
      }

      if (!data.session) {
        setMessage(
          "Account created, but Supabase email confirmation is enabled. Confirm the email before logging in, or disable email confirmation in Supabase Auth > Providers > Email for the diploma demo."
        );
        setIsSubmitting(false);
        return;
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        email: data.user.email ?? email,
        role: "listener"
      });

      if (profileError) {
        logSupabaseError("Register profile upsert failed", profileError);
        setError(
          formatSupabaseError(
            profileError,
            "Account was created, but ROOM_9 could not save the listener profile."
          )
        );
        setIsSubmitting(false);
        return;
      }

      const postRegisterPath =
        requestedAccess !== "listener"
          ? `/dashboard/settings?unlock=${requestedAccess}&next=${encodeURIComponent(nextPath || "/explore")}`
          : nextPath || getPostAuthPath("listener");
      router.push(postRegisterPath);
      router.refresh();
    } catch (caughtError) {
      logSupabaseError("Register unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not create account."));
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout
      eyebrow="Access request"
      title="JOIN ROOM_9."
      subtitle="Start with listening. Your taste, saved tracks and sound references become the base for professional tools."
    >
      <div>
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-neutral-600">System.02</p>
        <h1 className="mt-3 font-display text-[44px] uppercase leading-none text-black md:text-[58px]">Create Account</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-700">
          Start as a listener. DJ, organizer, and venue tools unlock later through verification.
        </p>
        <DemoModeNotice />

        <form className="mt-8 space-y-7" onSubmit={handleSubmit}>
          <LightField id="email" label="Email address">
              <input
                className={lightInputClass}
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="user@domain.com"
              />
          </LightField>

          <LightField id="display-name" label="Display name">
              <input
                className={lightInputClass}
                id="display-name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="DJ alias or name"
              />
          </LightField>

          <LightField id="password" label="Password">
              <input
                className={lightInputClass}
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                placeholder="Minimum 8 characters"
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {getPasswordChecks(password).map((check) => (
                  <span
                    className={`border px-3 py-2 font-mono text-[10px] font-black uppercase ${
                      check.ok
                        ? "border-acidGreen bg-acidGreen text-black"
                        : "border-black/30 text-neutral-500"
                    }`}
                    key={check.label}
                  >
                    {check.ok ? "OK " : ""}
                    {check.label}
                  </span>
                ))}
              </div>
          </LightField>

          <section className="border-2 border-black bg-paperWhite p-5">
              <p className="font-mono text-base font-black uppercase text-neutral-700">Account model</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[
                  ["Listener", "Default account for listening, saving, streams and events."],
                  ["DJ verification", "Unlock uploads, artist dossier, analytics and booking tools."],
                  ["Organizer tools", "Unlock requests, case files, chat, calendar and escrow preview."],
                  ["Venue tools", "Unlock venue profile, event pages and recurring calendar."]
                ].map(([title, text]) => (
                  <div className="border-2 border-black p-4" key={title}>
                    <p className="font-mono text-base font-black uppercase text-black">{title}</p>
                    <p className="mt-3 text-sm leading-6 text-neutral-700">{text}</p>
                  </div>
                ))}
              </div>
              {requestedAccess !== "listener" ? (
                <p className="mt-4 text-xs font-black leading-5 text-black">
                  Requested access noted: {requestedAccess}. The account still starts as listener.
                </p>
              ) : null}
          </section>

          {error ? <p className="border border-errorRed p-3 text-sm text-errorRed">{error}</p> : null}
            {message ? (
            <p className="border border-black p-3 text-sm text-neutral-700">{message}</p>
            ) : null}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center border border-acidGreen bg-acidGreen px-5 py-3 font-mono text-xs font-black uppercase text-black transition hover:border-black hover:bg-black hover:text-bone disabled:opacity-50"
            type="submit"
            disabled={isSubmitting}
          >
              {isSubmitting ? "Creating..." : "Initialize Account +"}
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-700">
          Already registered?{" "}
          <Link href="/login" className="font-black text-black underline underline-offset-4">
              Log in
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}

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
