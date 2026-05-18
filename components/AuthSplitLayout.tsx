import Link from "next/link";
import type { ReactNode } from "react";

export function AuthSplitLayout({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="-mb-[88px] min-h-screen bg-paperWhite text-black">
      <section className="grid min-h-screen lg:grid-cols-[0.48fr_0.52fr]">
        <aside className="relative hidden overflow-hidden bg-black text-bone lg:block">
          <div className="room-auth-abstract absolute inset-0" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.92)),linear-gradient(90deg,rgba(0,0,0,0.96),rgba(0,0,0,0.38))]" />
          <div className="relative z-10 flex h-full min-h-screen flex-col justify-between p-10 xl:p-14">
            <div className="flex items-start justify-between gap-6">
              <Link className="font-display text-3xl uppercase leading-none tracking-normal" href="/">
                ROOM_9
              </Link>
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-mutedText">
                {eyebrow}
              </p>
            </div>

            <div className="pb-6">
              <h1 className="max-w-[460px] font-display text-[72px] uppercase leading-[0.78] text-paperWhite xl:text-[104px]">
                {title}
              </h1>
              <span className="mt-10 block h-6 w-6 bg-paperWhite" />
            </div>

            <div className="flex items-center justify-between border-t border-line pt-6 font-mono text-[10px] uppercase text-ash">
              <span>© 2026 ROOM_9</span>
              <span>Terms / Privacy</span>
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-[520px]">{children}</div>
        </section>
      </section>
    </main>
  );
}

export function LightField({
  id,
  label,
  children
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-3 block font-mono text-sm font-black uppercase text-neutral-700" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

export const lightInputClass =
  "w-full border-2 border-black bg-paperWhite px-5 py-5 text-xl font-medium text-black outline-none placeholder:text-neutral-500 focus:border-acidGreen";
