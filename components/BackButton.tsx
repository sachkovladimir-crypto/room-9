"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function BackButton({
  fallbackHref = "/dashboard",
  label = "Back"
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  return (
    <button
      className="room-outline-button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      type="button"
    >
      {label}
    </button>
  );
}

export function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <Link className="room-outline-button" href={href}>
      {label}
    </Link>
  );
}
