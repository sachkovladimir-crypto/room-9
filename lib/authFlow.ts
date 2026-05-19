export type AuthCallbackMode = "signup" | "recovery";

export function getSafeRedirectPath(value: string | null | undefined, fallback = "") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function getSafeNextPathFromLocation(fallback = "") {
  if (typeof window === "undefined") {
    return fallback;
  }

  return getSafeRedirectPath(new URLSearchParams(window.location.search).get("next"), fallback);
}

export function buildAuthCallbackUrl({
  mode,
  next,
  origin
}: {
  mode: AuthCallbackMode;
  next?: string;
  origin: string;
}) {
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("mode", mode);

  const safeNext = getSafeRedirectPath(next);
  if (safeNext) {
    callbackUrl.searchParams.set("next", safeNext);
  }

  return callbackUrl.toString();
}

export function appendQueryFlag(path: string, key: string, value: string) {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  const serialized = params.toString();

  return serialized ? `${pathname}?${serialized}` : pathname;
}
