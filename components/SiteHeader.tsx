"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ExternalGlyph } from "@/components/room9-icons";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  isMissingAuthSession,
  logSupabaseError
} from "@/lib/supabase";
import { loadRoleAccess } from "@/lib/roleAccess";
import { hasRoleAccess, type Profile, type Role } from "@/lib/types";

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const isImmersivePage =
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/library") ||
    pathname?.startsWith("/track") ||
    pathname?.startsWith("/booking") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/forgot-password") ||
    pathname?.startsWith("/update-password") ||
    pathname?.startsWith("/auth/callback") ||
    pathname?.startsWith("/booking/details");

  useEffect(() => {
    if (isImmersivePage || !hasSupabaseConfig()) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabase();

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) {
          if (isMissingAuthSession(error)) {
            setProfile(null);
            setIsLoading(false);
            return;
          }

          logSupabaseError("Header session load failed", error);
          setProfile(null);
          setIsLoading(false);
          return;
        }

        const sessionUser = data.session?.user;
        if (!sessionUser) {
          setProfile(null);
          setIsLoading(false);
          return;
        }

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionUser.id)
          .maybeSingle();

        if (profileError) {
          logSupabaseError("Header profile load failed", profileError);
        }

        const loadedProfile =
          (profileRow as Profile | null) ??
          ({
            id: sessionUser.id,
            email: sessionUser.email ?? null,
            role: "listener",
            created_at: sessionUser.created_at ?? new Date().toISOString()
          } satisfies Profile);
        setProfile(loadedProfile);
        if (profileError) {
          setActiveRoles(["listener"]);
          setIsLoading(false);
          return;
        }

        try {
          setActiveRoles(await loadRoleAccess(supabase, loadedProfile.id, loadedProfile.role));
        } catch (roleError) {
          logSupabaseError("Header role access load failed", roleError);
          setActiveRoles(["listener"]);
        }
        setIsLoading(false);
      })
      .catch((caughtError) => {
        logSupabaseError(
          "Header unexpected Supabase failure",
          formatSupabaseError(caughtError, "Header could not reach Supabase.")
        );
        setProfile(null);
        setIsLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      router.refresh();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [router, pathname, isImmersivePage]);

  async function handleLogout() {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();
      if (error) {
        logSupabaseError("Logout failed", error);
      }
      setProfile(null);
      setActiveRoles(["listener"]);
      setProfileMenuOpen(false);
      router.push("/");
      router.refresh();
    } catch (caughtError) {
      logSupabaseError("Logout unexpected failure", caughtError);
    }
  }

  if (isImmersivePage) {
    return null;
  }

  function handleGlobalSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    router.push(query ? `/explore?q=${encodeURIComponent(query)}` : "/explore");
  }

  const navClass = "font-mono text-[10px] font-black uppercase text-mutedText transition hover:text-paperWhite";
  const isHome = pathname === "/";
  const isExplore = pathname?.startsWith("/explore");
  const isEvents = pathname?.startsWith("/events");
  const isStreams = pathname?.startsWith("/streams");
  const isLibrary = pathname?.startsWith("/library");
  const profileLabel = profile?.email || "ROOM_9";
  const activeRoleLabel = `${activeRoles.filter((role) => role !== "listener").join(" + ") || "listener"} access`;
  const professionalHref = hasRoleAccess(activeRoles, ["dj", "organizer", "venue", "admin"])
    ? "/dashboard"
    : "/dashboard/settings?unlock=dashboard";
  const bookingHref = hasRoleAccess(activeRoles, ["dj", "organizer", "venue", "admin"])
    ? "/dashboard/bookings"
    : "/dashboard/settings?unlock=bookings";
  const profileInitials =
    profileLabel
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "R9";
  const navLinks = [
    ["Explore", "/explore"],
    ["Events", "/events"],
    ["Streams", "/streams"],
    ["Library", "/library"]
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-roomBorder bg-voidBlack/95 backdrop-blur">
      <div className="mx-auto grid min-h-14 w-full max-w-[1920px] grid-cols-[112px_1fr_auto_auto] items-center gap-3 px-4 py-2 md:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-display text-lg uppercase leading-none text-paperWhite"
        >
          ROOM_9
        </Link>

        <form
          className="hidden min-h-10 min-w-0 items-center border-l border-r border-roomBorder bg-black md:flex"
          onSubmit={handleGlobalSearch}
        >
          <input
            aria-label="Global search"
            className="h-10 min-w-0 flex-1 bg-transparent px-4 font-mono text-[10px] uppercase text-bone outline-none placeholder:text-neutral-700"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tracks, DJs, events, streams..."
            value={search}
          />
          <button className="h-10 border-l border-roomBorder px-4 font-mono text-[10px] font-black uppercase text-mutedText hover:bg-acidGreen hover:text-black" type="submit">
            Search
          </button>
        </form>

        <nav className="hidden items-center gap-5 lg:flex">
          {navLinks.map(([label, href]) => (
            <Link
              key={label}
              className={`${navClass} ${
                (href === "/streams" && isStreams) ||
                (href === "/events" && isEvents) ||
                (href === "/library" && isLibrary) ||
                (href === "/explore" && isExplore)
                  ? "underline underline-offset-8"
                  : ""
              }`}
              href={href}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="relative flex items-center gap-2">
          {!isLoading && profile ? (
            <>
              <NotificationCenter />
              <button
                aria-expanded={profileMenuOpen}
                aria-label="Open profile menu"
                className="grid h-9 w-9 place-items-center border border-roomBorder bg-panelBlack font-mono text-[10px] font-black uppercase text-acidGreen transition hover:border-paperWhite"
                onClick={() => setProfileMenuOpen((current) => !current)}
                type="button"
              >
                {profileInitials}
              </button>
              {profileMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[300px] border border-strongBorder bg-black p-3 shadow-[0_18px_60px_rgba(0,0,0,0.72)]">
                  <div className="border-b border-roomBorder pb-3">
                    <p className="truncate font-display text-base uppercase text-paperWhite" title={profileLabel}>
                      {profileLabel}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase text-successGreen">
                      {activeRoleLabel}
                    </p>
                  </div>
                  <div className="mt-2 grid gap-1">
                    <ProfileMenuLink href={professionalHref} label="Workspace" onClick={() => setProfileMenuOpen(false)} />
                    <ProfileMenuLink href="/library" label="Sound Vault" onClick={() => setProfileMenuOpen(false)} />
                    <ProfileMenuLink href="/dashboard?panel=notifications" label="Notifications" onClick={() => setProfileMenuOpen(false)} />
                    <ProfileMenuLink href="/dashboard/settings" label="Settings" onClick={() => setProfileMenuOpen(false)} />
                    <ProfileMenuLink href={bookingHref} label="Booking CRM" onClick={() => setProfileMenuOpen(false)} />
                  </div>
                  <button
                    className="mt-3 flex w-full items-center justify-between border border-roomBorder px-3 py-2 font-mono text-[10px] font-black uppercase text-mutedText transition hover:border-paperWhite hover:text-paperWhite"
                    onClick={handleLogout}
                    type="button"
                  >
                    Exit account
                    <ExternalGlyph className="h-3.5 w-3.5 rotate-90" />
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Link className={navClass} href="/login">
                Login
              </Link>
              <Link
                className="room-button h-9 min-h-0 px-3 py-2"
                href="/register"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
      {isHome ? (
        <div className="border-t border-roomBorder px-4 py-1 text-center font-mono text-[9px] uppercase text-mutedText">
          Desktop music discovery / live stream / atmosphere briefs / system 2026
        </div>
      ) : null}
    </header>
  );
}

function ProfileMenuLink({
  href,
  label,
  onClick
}: {
  href: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      className="flex items-center justify-between border border-transparent px-3 py-2 font-mono text-[10px] font-black uppercase text-mutedText transition hover:border-roomBorder hover:bg-panelBlack hover:text-paperWhite"
      href={href}
      onClick={onClick}
    >
      {label}
      <span className="text-acidGreen">→</span>
    </Link>
  );
}
