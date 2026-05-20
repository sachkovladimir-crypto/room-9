"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ExternalGlyph } from "@/components/room9-icons";
import { cx } from "@/components/room9-ui";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
  }, [pathname]);

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
      setMobileMenuOpen(false);
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
    setMobileMenuOpen(false);
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
    <header className="sticky top-0 z-30 isolate border-b border-roomBorder bg-voidBlack/95 backdrop-blur">
      <div className="relative mx-auto grid min-h-12 w-full max-w-[1920px] grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-1.5 md:grid-cols-[96px_minmax(160px,280px)_1fr_auto] md:gap-3 md:px-5 xl:grid-cols-[112px_minmax(180px,320px)_minmax(360px,1fr)_auto]">
        <Link
          href="/"
          className="relative z-10 flex shrink-0 items-center gap-2 font-display text-base uppercase leading-none text-paperWhite md:text-lg"
        >
          ROOM_9
        </Link>

        <form
          className="relative z-10 hidden min-h-8 min-w-0 items-center border-l border-r border-roomBorder bg-black md:flex"
          onSubmit={handleGlobalSearch}
        >
          <input
            aria-label="Global search"
            className="h-8 min-w-0 flex-1 bg-transparent px-3 font-mono text-[10px] uppercase text-bone outline-none placeholder:text-neutral-700"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tracks, DJs, events, streams..."
            value={search}
          />
          <button className="h-8 border-l border-roomBorder px-2.5 font-mono text-[10px] font-black uppercase text-mutedText hover:bg-acidGreen hover:text-black" type="submit">
            Search
          </button>
        </form>

        <nav className="relative z-20 hidden min-w-0 items-center justify-center gap-7 lg:flex xl:gap-9">
          {navLinks.map(([label, href]) => (
            <Link
              key={label}
              className={`${navClass} relative inline-flex min-h-9 items-center px-1 ${
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

        <div className="relative z-30 flex items-center justify-end gap-2">
          <button
            aria-expanded={mobileMenuOpen}
            aria-label="Open navigation menu"
            className="hidden h-9 w-9 place-items-center border border-roomBorder bg-panelBlack font-mono text-[10px] font-black uppercase text-paperWhite transition hover:border-paperWhite md:grid lg:hidden"
            onClick={() => setMobileMenuOpen((current) => !current)}
            type="button"
          >
            <MenuIcon />
          </button>
          <button
            aria-expanded={mobileMenuOpen}
            aria-label="Open navigation menu"
            className="grid h-10 w-10 place-items-center border border-roomBorder bg-panelBlack text-paperWhite transition hover:border-paperWhite md:hidden"
            onClick={() => setMobileMenuOpen((current) => !current)}
            type="button"
          >
            <MenuIcon />
          </button>
          {!isLoading && profile ? (
            <>
              <div className="hidden sm:block">
                <NotificationCenter />
              </div>
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
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(300px,calc(100vw-24px))] border border-strongBorder bg-black p-3 shadow-[0_18px_60px_rgba(0,0,0,0.72)]">
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
      {mobileMenuOpen ? (
        <div className="border-t border-roomBorder bg-black px-3 py-3 lg:hidden">
          <form className="grid gap-2" onSubmit={handleGlobalSearch}>
            <label>
              <span className="sr-only">Global search</span>
              <input
                aria-label="Global search"
                className="h-11 w-full border border-roomBorder bg-voidBlack px-3 font-mono text-[11px] uppercase text-bone outline-none placeholder:text-neutral-700 focus:border-paperWhite"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tracks, DJs, events..."
                value={search}
              />
            </label>
            <button
              className="min-h-11 border border-acidGreen bg-acidGreen px-4 font-mono text-[10px] font-black uppercase text-black"
              type="submit"
            >
              Search
            </button>
          </form>
          <nav className="mt-3 grid grid-cols-2 gap-2">
            {navLinks.map(([label, href]) => (
              <Link
                className={cx(
                  "border px-3 py-3 font-mono text-[10px] font-black uppercase transition",
                  (href === "/streams" && isStreams) ||
                    (href === "/events" && isEvents) ||
                    (href === "/library" && isLibrary) ||
                    (href === "/explore" && isExplore)
                    ? "border-acidGreen bg-[#142000] text-acidGreen"
                    : "border-roomBorder bg-panelBlack text-mutedText"
                )}
                href={href}
                key={label}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {profile ? (
              <>
                <Link className="room-button min-h-11" href={professionalHref}>
                  Workspace
                </Link>
                <button className="room-button min-h-11" onClick={handleLogout} type="button">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link className="room-button min-h-11" href="/login">
                  Login
                </Link>
                <Link className="room-button-solid min-h-11" href="/register">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
      {isHome ? (
        <div className="border-t border-roomBorder px-4 py-1 text-center font-mono text-[9px] uppercase text-mutedText">
          Desktop music discovery / live stream / atmosphere briefs / system 2026
        </div>
      ) : null}
    </header>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
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
