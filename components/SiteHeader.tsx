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

type SearchSuggestion = {
  href: string;
  id: string;
  label: string;
  meta: string;
  type: "track" | "artist" | "release" | "event" | "stream";
};

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRoles, setActiveRoles] = useState<Role[]>(["listener"]);
  const [search, setSearch] = useState("");
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
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
    setSearchPanelOpen(false);
  }, [pathname]);

  useEffect(() => {
    const query = search.trim();
    if (isImmersivePage || query.length < 2 || !hasSupabaseConfig()) {
      setSearchSuggestions([]);
      setIsSuggesting(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const supabase = getSupabase();
        const pattern = `%${query}%`;
        const [worksResult, djResult, releasesResult, eventsResult, streamsResult] = await Promise.all([
          supabase
            .from("works")
            .select("id,title,genre,bpm,duration_seconds")
            .eq("visibility", "public")
            .eq("is_deleted", false)
            .ilike("title", pattern)
            .limit(3),
          supabase
            .from("dj_profiles")
            .select("id,stage_name,city,country,genres")
            .ilike("stage_name", pattern)
            .limit(3),
          supabase
            .from("releases")
            .select("id,title,release_type")
            .eq("visibility", "public")
            .ilike("title", pattern)
            .limit(2),
          supabase
            .from("events")
            .select("id,title,city,event_type")
            .neq("status", "archived")
            .ilike("title", pattern)
            .limit(2),
          supabase
            .from("live_streams")
            .select("id,title,artist_name,status")
            .ilike("title", pattern)
            .limit(2)
        ]);

        if (cancelled) {
          return;
        }

        const nextSuggestions: SearchSuggestion[] = [];
        const works = (worksResult.data ?? []) as Array<{
          bpm: string | null;
          duration_seconds: number | null;
          genre: string | null;
          id: string;
          title: string | null;
        }>;
        const djs = (djResult.data ?? []) as Array<{
          city: string | null;
          country: string | null;
          genres: string | null;
          id: string;
          stage_name: string | null;
        }>;
        const releases = (releasesResult.data ?? []) as Array<{
          id: string;
          release_type: string | null;
          title: string | null;
        }>;
        const events = (eventsResult.data ?? []) as Array<{
          city: string | null;
          event_type: string | null;
          id: string;
          title: string | null;
        }>;
        const streams = (streamsResult.data ?? []) as Array<{
          artist_name: string | null;
          id: string;
          status: string | null;
          title: string | null;
        }>;

        works.forEach((work) => {
          nextSuggestions.push({
            href: `/track/${work.id}`,
            id: `track-${work.id}`,
            label: work.title || "Untitled track",
            meta: [work.genre, work.bpm ? `${work.bpm} BPM` : null].filter(Boolean).join(" / ") || "Track",
            type: "track"
          });
        });
        djs.forEach((dj) => {
          nextSuggestions.push({
            href: `/dj/${dj.id}`,
            id: `artist-${dj.id}`,
            label: dj.stage_name || "Unnamed artist",
            meta: [dj.city, dj.country, dj.genres].filter(Boolean).join(" / ") || "Artist dossier",
            type: "artist"
          });
        });
        releases.forEach((release) => {
          nextSuggestions.push({
            href: `/release/${release.id}`,
            id: `release-${release.id}`,
            label: release.title || "Untitled release",
            meta: `${release.release_type || "release"} / album search`,
            type: "release"
          });
        });
        events.forEach((event) => {
          nextSuggestions.push({
            href: `/events/${event.id}`,
            id: `event-${event.id}`,
            label: event.title || "Untitled event",
            meta: [event.city, event.event_type].filter(Boolean).join(" / ") || "Event",
            type: "event"
          });
        });
        streams.forEach((stream) => {
          nextSuggestions.push({
            href: `/streams/${stream.id}`,
            id: `stream-${stream.id}`,
            label: stream.title || "Untitled stream",
            meta: [stream.artist_name, stream.status].filter(Boolean).join(" / ") || "Stream",
            type: "stream"
          });
        });

        setSearchSuggestions(nextSuggestions.slice(0, 8));
      } catch (caughtError) {
        if (!cancelled) {
          logSupabaseError("Header search suggestions failed", caughtError);
          setSearchSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setIsSuggesting(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, isImmersivePage]);

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

  function handleSearchInput(value: string) {
    setSearch(value);
    setSearchPanelOpen(true);
  }

  function handleGlobalSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    setMobileMenuOpen(false);
    setSearchPanelOpen(false);
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
  const showSearchSuggestions = searchPanelOpen && search.trim().length >= 2;

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
            onBlur={() => window.setTimeout(() => setSearchPanelOpen(false), 120)}
            onChange={(event) => handleSearchInput(event.currentTarget.value)}
            onFocus={() => setSearchPanelOpen(true)}
            onInput={(event) => handleSearchInput(event.currentTarget.value)}
            placeholder="Search tracks, DJs, events, streams..."
            value={search}
          />
          <button className="h-8 border-l border-roomBorder px-2.5 font-mono text-[10px] font-black uppercase text-mutedText hover:bg-acidGreen hover:text-black" type="submit">
            Search
          </button>
          {showSearchSuggestions ? (
            <SearchSuggestionsPanel
              isLoading={isSuggesting}
              query={search.trim()}
              suggestions={searchSuggestions}
              onSelect={() => setSearchPanelOpen(false)}
            />
          ) : null}
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
                onChange={(event) => handleSearchInput(event.currentTarget.value)}
                onFocus={() => setSearchPanelOpen(true)}
                onInput={(event) => handleSearchInput(event.currentTarget.value)}
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
          {search.trim().length >= 2 ? (
            <div className="mt-2">
              <SearchSuggestionsPanel
                isInline
                isLoading={isSuggesting}
                query={search.trim()}
                suggestions={searchSuggestions}
                onSelect={() => {
                  setSearchPanelOpen(false);
                  setMobileMenuOpen(false);
                }}
              />
            </div>
          ) : null}
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

function SearchSuggestionsPanel({
  isInline = false,
  isLoading,
  onSelect,
  query,
  suggestions
}: {
  isInline?: boolean;
  isLoading: boolean;
  onSelect: () => void;
  query: string;
  suggestions: SearchSuggestion[];
}) {
  const fullSearchHref = query ? `/explore?q=${encodeURIComponent(query)}` : "/explore";

  return (
    <div
      className={cx(
        "border border-strongBorder bg-black shadow-[0_18px_70px_rgba(0,0,0,0.72)]",
        isInline
          ? "relative w-full"
          : "absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[min(420px,calc(100vh-96px))] overflow-y-auto"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-roomBorder px-3 py-2">
        <span className="min-w-0 truncate font-mono text-[9px] uppercase text-mutedText">
          Closest matches for <span className="text-paperWhite">{query}</span>
        </span>
        <span className="shrink-0 font-mono text-[9px] uppercase text-acidGreen">
          {isLoading ? "Scanning" : `${suggestions.length} found`}
        </span>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {suggestions.length > 0 ? (
          suggestions.map((suggestion) => (
            <Link
              className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-roomBorder px-3 py-2 transition hover:bg-[#162100]"
              href={suggestion.href}
              key={suggestion.id}
              onClick={onSelect}
            >
              <span className="font-mono text-[9px] uppercase text-acidGreen">{suggestion.type}</span>
              <span className="min-w-0">
                <span className="block truncate font-display text-xs uppercase text-paperWhite">
                  {suggestion.label}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[9px] uppercase text-mutedText">
                  {suggestion.meta}
                </span>
              </span>
            </Link>
          ))
        ) : (
          <div className="px-3 py-4">
            <p className="font-mono text-[10px] uppercase text-mutedText">
              {isLoading ? "Looking through ROOM_9 signals..." : "No close object found yet."}
            </p>
          </div>
        )}
      </div>
      <Link
        className="flex items-center justify-between px-3 py-2 font-mono text-[10px] font-black uppercase text-paperWhite transition hover:bg-acidGreen hover:text-black"
        href={fullSearchHref}
        onClick={onSelect}
      >
        Open full search
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
