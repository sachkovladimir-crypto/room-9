import Link from "next/link";
import { isRoom9DemoMode } from "@/lib/supabase";

export function DemoModeNotice() {
  if (!isRoom9DemoMode()) {
    return null;
  }

  return (
    <p className="mt-4 border border-line p-3 text-sm text-neutral-300">
      Demo mode is active because the current Supabase project URL is not reachable. Data is saved
      in this browser only.
    </p>
  );
}

export function MissingConfigNotice() {
  return (
    <main className="room-page">
      <section className="room-shell py-16">
        <div className="room-card max-w-2xl p-8">
          <p className="font-mono text-xs uppercase text-ash">Configuration required</p>
          <h1 className="room-heading mt-3 text-4xl">Supabase is not connected</h1>
          <p className="room-muted mt-4">
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>, then
            restart the dev server.
          </p>
          <Link href="/" className="room-button mt-6">
            Back Home
          </Link>
        </div>
      </section>
    </main>
  );
}
