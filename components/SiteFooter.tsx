"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const hiddenFooterPrefixes = [
  "/dashboard",
  "/library",
  "/track",
  "/booking",
  "/login",
  "/register",
  "/forgot-password",
  "/update-password",
  "/auth/callback"
];

export function SiteFooter() {
  const pathname = usePathname();
  const hidden = hiddenFooterPrefixes.some((prefix) => pathname?.startsWith(prefix));

  if (hidden) {
    return null;
  }

  return (
    <footer className="border-t border-roomBorder bg-voidBlack px-4 py-4 text-paperWhite md:px-6">
      <div className="mx-auto grid max-w-[1680px] gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-start">
        <div>
          <Link className="font-display text-xl uppercase leading-none" href="/">
            ROOM_9
          </Link>
          <p className="mt-2 max-w-md text-xs leading-5 text-mutedText md:max-w-sm">
            Music-first discovery, saved sound references, live streams and professional booking workflows.
          </p>
        </div>
        <nav className="grid gap-1.5 font-mono text-[10px] uppercase text-mutedText">
          <Link className="hover:text-paperWhite" href="/explore">Explore</Link>
          <Link className="hover:text-paperWhite" href="/events">Events</Link>
          <Link className="hover:text-paperWhite" href="/streams">Streams</Link>
          <Link className="hover:text-paperWhite" href="/library">Sound Vault</Link>
        </nav>
        <div className="font-mono text-[10px] uppercase leading-5 text-mutedText md:text-right">
          <p>System 2026</p>
          <p>Sound leads. Booking follows.</p>
        </div>
      </div>
    </footer>
  );
}
