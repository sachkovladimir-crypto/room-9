"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthSplitLayout, LightField, lightInputClass } from "@/components/AuthSplitLayout";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { buildAuthCallbackUrl } from "@/lib/authFlow";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabase();
      const redirectTo =
        typeof window !== "undefined"
          ? buildAuthCallbackUrl({
              origin: window.location.origin,
              mode: "recovery",
              next: "/update-password"
            })
          : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      });

      if (resetError) {
        logSupabaseError("Password reset email failed", resetError);
        setError(formatSupabaseError(resetError, "Could not send password reset email."));
        setIsSubmitting(false);
        return;
      }

      setMessage("Password reset link sent. Open the latest ROOM_9 recovery email to set a new password.");
    } catch (caughtError) {
      logSupabaseError("Password reset unexpected failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not send password reset email."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSplitLayout
      eyebrow="Recovery"
      title="RESET ROOM_9."
      subtitle="Recover access to your listening archive, bookings, streams and workspace."
    >
      <div>
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-neutral-600">System.03</p>
        <h1 className="mt-3 font-display text-[44px] uppercase leading-none text-black md:text-[58px]">
          Reset Password
        </h1>
        <p className="mt-4 text-sm leading-6 text-neutral-700">
          Enter your account email. Supabase will send a secure recovery link to set a new password.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <LightField id="email" label="Email address">
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

          {error ? <p className="border border-errorRed p-3 text-sm text-errorRed">{error}</p> : null}
          {message ? <p className="border border-black p-3 text-sm text-neutral-700">{message}</p> : null}

          <button
            className="inline-flex min-h-12 w-full items-center justify-center border border-acidGreen bg-acidGreen px-5 py-3 font-mono text-xs font-black uppercase text-black transition hover:border-black hover:bg-black hover:text-bone disabled:opacity-50"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send Recovery Link"}
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-700">
          Remembered it?{" "}
          <Link href="/login" className="font-black text-black underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </AuthSplitLayout>
  );
}
