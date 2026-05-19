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
import { getPasswordChecks, getPasswordError } from "@/lib/password";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    let isMounted = true;
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isMounted) {
        return;
      }

      if (sessionError) {
        logSupabaseError("Password update session load failed", sessionError);
      }

      setHasRecoverySession(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(Boolean(session));
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
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

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = getSupabase();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        logSupabaseError("Password update failed", updateError);
        setError(
          formatSupabaseError(
            updateError,
            "Could not update password. Open this page from the recovery email link."
          )
        );
        setIsSubmitting(false);
        return;
      }

      setMessage("Password updated. Redirecting to login...");
      window.setTimeout(() => {
        router.push("/login");
      }, 900);
    } catch (caughtError) {
      logSupabaseError("Password update unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not update password."));
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout
      eyebrow="Recovery"
      title="NEW ROOM_9 KEY."
      subtitle="Create a stronger password and return to the ROOM_9 workspace."
    >
      <div>
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-neutral-600">System.04</p>
        <h1 className="mt-3 font-display text-[44px] uppercase leading-none text-black md:text-[58px]">
          New Password
        </h1>
        <p className="mt-4 text-sm leading-6 text-neutral-700">
          Use a stronger password before returning to your tracks, saved moments and booking cases.
        </p>

        {!hasRecoverySession ? (
          <p className="mt-6 border border-black p-3 text-sm leading-6 text-neutral-700">
            Waiting for a valid recovery session. If this does not change, open this page from the
            latest password recovery email.
          </p>
        ) : null}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <LightField id="password" label="New password">
            <input
              className={lightInputClass}
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              minLength={8}
              placeholder="Minimum 8 characters"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {getPasswordChecks(password).map((check) => (
                <span
                  className={`border px-3 py-2 font-mono text-[10px] font-black uppercase ${
                    check.ok ? "border-acidGreen bg-acidGreen text-black" : "border-black/30 text-neutral-500"
                  }`}
                  key={check.label}
                >
                  {check.ok ? "OK " : ""}
                  {check.label}
                </span>
              ))}
            </div>
          </LightField>

          <LightField id="confirm-password" label="Confirm password">
            <input
              className={lightInputClass}
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              placeholder="Repeat password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </LightField>

          {error ? <p className="border border-errorRed p-3 text-sm text-errorRed">{error}</p> : null}
          {message ? <p className="border border-black p-3 text-sm text-neutral-700">{message}</p> : null}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center border border-acidGreen bg-acidGreen px-5 py-3 font-mono text-xs font-black uppercase text-black transition hover:border-black hover:bg-black hover:text-bone disabled:opacity-50"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Updating..." : "Update Password"}
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-700">
          Back to{" "}
          <Link href="/login" className="font-black text-black underline underline-offset-4">
            login
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
