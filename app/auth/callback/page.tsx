"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AuthSplitLayout } from "@/components/AuthSplitLayout";
import { MissingConfigNotice } from "@/components/AuthNotice";
import { appendQueryFlag, getSafeRedirectPath } from "@/lib/authFlow";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Completing secure ROOM_9 authentication...");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    let isMounted = true;

    async function completeAuthCallback() {
      const supabase = getSupabase();
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const mode = params.get("mode");
      const safeNext = getSafeRedirectPath(params.get("next"), "/explore");
      const authError = params.get("error_description") || params.get("error");

      if (authError) {
        setError(authError);
        return;
      }

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            logSupabaseError("Auth callback exchange failed", exchangeError);
            setError(formatSupabaseError(exchangeError, "Could not complete authentication."));
            return;
          }
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          logSupabaseError("Auth callback session load failed", sessionError);
          setError(formatSupabaseError(sessionError, "Could not load the confirmed session."));
          return;
        }

        const user = sessionData.session?.user;
        if (user) {
          setStatus("Syncing listener profile...");
          await ensureListenerProfile(user);
        }

        if (!isMounted) {
          return;
        }

        if (mode === "recovery") {
          router.replace("/update-password");
          return;
        }

        router.replace(appendQueryFlag(safeNext, "verified", "1"));
      } catch (caughtError) {
        logSupabaseError("Auth callback unexpected failure", caughtError);
        setError(formatSupabaseError(caughtError, "Could not complete authentication."));
      }
    }

    completeAuthCallback();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (!hasSupabaseConfig()) {
    return <MissingConfigNotice />;
  }

  return (
    <AuthSplitLayout
      eyebrow="Auth callback"
      title="ROOM_9 ACCESS."
      subtitle="Confirming secure access and syncing the listener profile."
    >
      <div>
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-neutral-600">
          System.05
        </p>
        <h1 className="mt-3 font-display text-[44px] uppercase leading-none text-black md:text-[58px]">
          Auth Callback
        </h1>
        <p className="mt-4 text-sm leading-6 text-neutral-700">{status}</p>

        {error ? (
          <div className="mt-8 border-2 border-black p-5">
            <p className="text-sm leading-6 text-errorRed">{error}</p>
            <Link
              className="mt-5 inline-flex min-h-11 items-center justify-center border border-black px-5 py-3 font-mono text-xs font-black uppercase text-black transition hover:border-acidGreen hover:bg-acidGreen"
              href="/login"
            >
              Return to Login
            </Link>
          </div>
        ) : (
          <div className="mt-8 border-2 border-black p-5">
            <div className="h-2 w-full bg-black/10">
              <span className="block h-full w-2/3 animate-pulse bg-acidGreen" />
            </div>
            <p className="mt-4 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
              Do not close this tab.
            </p>
          </div>
        )}
      </div>
    </AuthSplitLayout>
  );
}

async function ensureListenerProfile(user: User) {
  const supabase = getSupabase();
  const { data: existingProfile, error: profileLoadError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileLoadError) {
    logSupabaseError("Auth callback profile lookup failed", profileLoadError);
    throw profileLoadError;
  }

  if (existingProfile) {
    const { error: emailUpdateError } = await supabase
      .from("profiles")
      .update({ email: user.email ?? null })
      .eq("id", user.id);

    if (emailUpdateError) {
      logSupabaseError("Auth callback profile email sync failed", emailUpdateError);
    }
    return;
  }

  const { error: profileCreateError } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? null,
    role: "listener"
  });

  if (profileCreateError) {
    logSupabaseError("Auth callback profile create failed", profileCreateError);
    throw profileCreateError;
  }
}
