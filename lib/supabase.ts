import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDemoSupabase } from "@/lib/demoSupabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const useDemoMode = process.env.NEXT_PUBLIC_ROOM9_DEMO_MODE === "true";

let supabaseClient: SupabaseClient | null = null;

type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
  name?: string;
  status?: number;
  statusCode?: number;
};

export function hasSupabaseConfig() {
  return useDemoMode || Boolean(supabaseUrl && supabaseKey);
}

export function isRoom9DemoMode() {
  return useDemoMode;
}

export function getSupabase() {
  if (useDemoMode) {
    return getDemoSupabase() as unknown as SupabaseClient;
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase config. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart npm run dev."
    );
  }

  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}". Copy the Project URL from Supabase Settings > API.`
    );
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  }

  return supabaseClient;
}

export function logSupabaseError(context: string, error: unknown) {
  const errorLike = toErrorLike(error);
  const readableError =
    errorLike.message || errorLike.code || errorLike.details || errorLike.hint
      ? errorLike
      : typeof error === "object" && error !== null
        ? Object.fromEntries(Object.entries(error as Record<string, unknown>))
        : error;

  console.warn(`[ROOM_9] ${context}`, readableError);
}

export function isMissingAuthSession(error: unknown) {
  const errorLike = toErrorLike(error);
  return (errorLike.message ?? "").toLowerCase().includes("auth session missing");
}

export function isSupabaseNetworkError(error: unknown) {
  const errorLike = toErrorLike(error);
  const message = `${errorLike.message ?? ""} ${errorLike.details ?? ""} ${errorLike.hint ?? ""}`.toLowerCase();

  return (
    errorLike.name === "TypeError" ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("load failed") ||
    message.includes("networkerror") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("timeout")
  );
}

export async function withSupabaseRetry<T>(
  context: string,
  request: () => PromiseLike<T> | Promise<T>,
  attempts = 3
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;

      if (!isSupabaseNetworkError(error) || attempt === attempts) {
        throw error;
      }

      logSupabaseError(`${context} retry ${attempt}/${attempts}`, error);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 350 * attempt));
    }
  }

  throw lastError;
}

export function formatSupabaseError(error: unknown, fallback = "Supabase request failed.") {
  const errorLike = toErrorLike(error);
  const message = errorLike.message ?? (typeof error === "string" ? error : "");
  const lowerMessage = message.toLowerCase();

  if (isSupabaseNetworkError(error)) {
    return [
      "Could not reach Supabase.",
      "The project URL is configured, but the request failed on the network/DNS layer. Refresh the page; if it keeps happening, restart npm run dev and check internet/DNS/VPN.",
      message ? `Original error: ${message}` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (errorLike.code === "over_email_send_rate_limit") {
    return [
      fallback,
      "Supabase email rate limit exceeded.",
      "For the diploma demo, open Supabase Authentication > Providers > Email and turn off Confirm email, then register with a new email.",
      "If you want to keep email confirmation on, wait for the rate limit window to reset or log in with an already confirmed account."
    ].join(" ");
  }

  if (
    errorLike.code === "42P01" ||
    errorLike.code === "PGRST205" ||
    errorLike.code === "PGRST204" ||
    lowerMessage.includes("could not find the table") ||
    lowerMessage.includes("schema cache") ||
    lowerMessage.includes("relation") ||
    lowerMessage.includes("does not exist")
  ) {
    return `${fallback} The database schema is missing. Run supabase/schema.sql in the Supabase SQL Editor. ${message}`;
  }

  if (
    errorLike.code === "42501" ||
    lowerMessage.includes("row-level security") ||
    lowerMessage.includes("permission denied") ||
    lowerMessage.includes("violates row-level security")
  ) {
    return `${fallback} Supabase blocked the request with RLS. Re-run supabase/schema.sql so the demo policies are installed. ${message}`;
  }

  if (lowerMessage.includes("bucket") && lowerMessage.includes("not found")) {
    const bucketName = fallback.toLowerCase().includes("image") ? "images" : "tracks";
    return `${fallback} Storage bucket "${bucketName}" was not found. Create a public Supabase Storage bucket named "${bucketName}" or re-run supabase/schema.sql.`;
  }

  const parts = [
    fallback,
    message,
    errorLike.code ? `Code: ${errorLike.code}.` : "",
    errorLike.details ? `Details: ${errorLike.details}.` : "",
    errorLike.hint ? `Hint: ${errorLike.hint}.` : ""
  ];

  return parts.filter(Boolean).join(" ");
}

export function withSupabaseTimeout<T>(
  promise: Promise<T>,
  context = "Supabase request",
  timeoutMs = 7000
) {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      globalThis.setTimeout(() => {
        reject(new Error(`${context} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
    })
  ]);
}

function toErrorLike(error: unknown): SupabaseErrorLike {
  if (typeof error === "object" && error !== null) {
    return error as SupabaseErrorLike;
  }

  return {};
}
