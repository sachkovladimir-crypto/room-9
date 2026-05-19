"use client";

import { useEffect, useState } from "react";
import { StatusBadge, cx } from "@/components/room9-ui";
import { getSupabase, hasSupabaseConfig, isMissingAuthSession, logSupabaseError } from "@/lib/supabase";
import type { Notification } from "@/lib/types";

const demoNotifications: Notification[] = [
  {
    id: "demo-booking-accepted",
    user_id: "demo",
    type: "booking",
    title: "Booking accepted",
    body: "DJ STONIK confirmed your peak-time request.",
    is_read: false,
    created_at: new Date().toISOString()
  },
  {
    id: "demo-new-message",
    user_id: "demo",
    type: "message",
    title: "New message",
    body: "Organizer asked for rider and booth image.",
    is_read: false,
    created_at: new Date().toISOString()
  },
  {
    id: "demo-conflict",
    user_id: "demo",
    type: "event_conflict",
    title: "Event conflict",
    body: "Oct 24 hold overlaps with Berghain booking.",
    is_read: true,
    created_at: new Date().toISOString()
  },
  {
    id: "demo-track-saved",
    user_id: "demo",
    type: "track_saved",
    title: "Track saved",
    body: "Industrial Complex added to your Sound Vault.",
    is_read: true,
    created_at: new Date().toISOString()
  },
  {
    id: "demo-brief-used",
    user_id: "demo",
    type: "saved_moment_used",
    title: "Atmosphere brief attached",
    body: "A saved reference was attached to the Peak slot in Event Desk.",
    is_read: true,
    created_at: new Date().toISOString()
  },
  {
    id: "demo-release-published",
    user_id: "demo",
    type: "release_published",
    title: "Release published",
    body: "VOID PROTOCOL is now available as a public ROOM_9 release.",
    is_read: true,
    created_at: new Date().toISOString()
  }
];

export function NotificationCenter({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(demoNotifications);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    let mounted = true;

    async function loadNotifications() {
      try {
        const supabase = getSupabase();
        const { data: sessionData, error: userError } = await supabase.auth.getSession();
        if (userError) {
          if (!isMissingAuthSession(userError)) {
            logSupabaseError("Notification center auth failed", userError);
          }
          return;
        }

        const user = sessionData.session?.user;
        if (!user) {
          return;
        }
        setUserId(user.id);

        const { data, error } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) {
          logSupabaseError("Notification center load failed", error);
          return;
        }

        const loaded = (data as Notification[] | null) ?? [];
        if (mounted && loaded.length > 0) {
          setNotifications(loaded);
        }
      } catch (error) {
        logSupabaseError("Notification center crashed", error);
      }
    }

    loadNotifications();
    return () => {
      mounted = false;
    };
  }, []);

  const unread = notifications.filter((notification) => !notification.is_read).length;

  async function markAllRead() {
    setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })));
    if (!userId || !hasSupabaseConfig()) {
      return;
    }

    try {
      const { error } = await getSupabase()
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) {
        logSupabaseError("Notification center mark all read failed", error);
      }
    } catch (error) {
      logSupabaseError("Notification center mark all read crashed", error);
    }
  }

  async function markOneRead(notificationId: string) {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, is_read: true } : notification
      )
    );
    if (!userId || !hasSupabaseConfig()) {
      return;
    }

    try {
      const { error } = await getSupabase()
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("id", notificationId);

      if (error) {
        logSupabaseError("Notification center mark read failed", error);
      }
    } catch (error) {
      logSupabaseError("Notification center mark read crashed", error);
    }
  }

  return (
    <div className={cx("relative", className)}>
      <button
        aria-label="Open notification center"
        className={cx(
          "relative grid h-9 w-9 place-items-center border border-roomBorder bg-panelBlack text-paperWhite transition hover:border-acidGreen hover:text-acidGreen",
          open && "border-acidGreen text-acidGreen"
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <BellIcon />
        {unread > 0 ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 bg-acidGreen" /> : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] border border-strongBorder bg-black p-room-2 shadow-[0_18px_70px_rgba(0,0,0,0.65)]">
          <div className="flex items-center justify-between border-b border-roomBorder pb-room-2">
            <p className="font-display text-lg uppercase text-paperWhite">Notifications</p>
            <div className="flex items-center gap-room-1">
              <button
                className="font-mono text-[10px] uppercase text-mutedText underline decoration-roomBorder underline-offset-4 transition hover:text-acidGreen"
                disabled={unread === 0}
                onClick={markAllRead}
                type="button"
              >
                Mark read
              </button>
              <StatusBadge status={unread > 0 ? "live" : "draft"}>{unread} unread</StatusBadge>
            </div>
          </div>
          <div className="mt-room-2 max-h-[420px] space-y-room-1 overflow-y-auto">
            {notifications.map((notification) => (
              <article
                className={cx(
                  "border p-room-2",
                  notification.is_read ? "border-roomBorder bg-panelBlack" : "border-acidGreen bg-[#111a02]"
                )}
                key={notification.id}
                onClick={() => !notification.is_read && markOneRead(notification.id)}
              >
                <div className="flex items-center justify-between gap-room-2">
                  <p className="font-mono text-[10px] uppercase text-mutedText">{notification.type || "system"}</p>
                  <span className={notification.is_read ? "text-mutedText" : "text-acidGreen"}>{notification.is_read ? "read" : "new"}</span>
                </div>
                <h3 className="mt-1 font-display text-base uppercase text-paperWhite">{notification.title || "ROOM_9 update"}</h3>
                <p className="mt-1 text-xs leading-5 text-mutedText">{notification.body || "No details."}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="square" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
      <path d="M10 21h4" />
    </svg>
  );
}
