"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  formatSupabaseError,
  getSupabase,
  hasSupabaseConfig,
  logSupabaseError
} from "@/lib/supabase";
import type { BookingMessage } from "@/lib/types";

type BookingChatProps = {
  bookingId: string;
  currentUserId: string;
};

export function BookingChat({ bookingId, currentUserId }: BookingChatProps) {
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }

    let isMounted = true;
    const supabase = getSupabase();

    async function loadMessages() {
      setIsLoading(true);
      setError("");

      const { data, error: loadError } = await supabase
        .from("booking_messages")
        .select("*")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });

      if (!isMounted) {
        return;
      }

      if (loadError) {
        logSupabaseError("Booking chat load failed", loadError);
        setError(formatSupabaseError(loadError, "Could not load chat messages."));
      } else {
        setMessages((data as BookingMessage[]) ?? []);
      }

      setIsLoading(false);
    }

    loadMessages();

    const channel = supabase
      .channel(`room9-booking-chat-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_messages",
          filter: `booking_id=eq.${bookingId}`
        },
        (payload) => {
          const nextMessage = payload.new as BookingMessage;
          setMessages((current) =>
            current.some((message) => message.id === nextMessage.id)
              ? current
              : [...current, nextMessage]
          );
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [bookingId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) {
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const supabase = getSupabase();
      const { data, error: sendError } = await supabase
        .from("booking_messages")
        .insert({
          booking_id: bookingId,
          sender_id: currentUserId,
          message
        })
        .select("*")
        .single();

      if (sendError) {
        logSupabaseError("Booking chat send failed", sendError);
        setError(formatSupabaseError(sendError, "Could not send message."));
        return;
      }

      const savedMessage = data as BookingMessage;
      setMessages((current) =>
        current.some((item) => item.id === savedMessage.id) ? current : [...current, savedMessage]
      );
      setDraft("");
    } catch (caughtError) {
      logSupabaseError("Booking chat unexpected send failure", caughtError);
      setError(formatSupabaseError(caughtError, "Could not send message."));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="flex min-h-[760px] flex-col border border-roomBorder bg-panelBlack">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-roomBorder px-room-3">
        <h2 className="font-display text-lg uppercase text-paperWhite">Log & Chat</h2>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase text-mutedText">
          <span className="h-2 w-2 bg-successGreen" />
          Online
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-room-3">
        {isLoading ? (
          <p className="room-muted">Loading messages...</p>
        ) : messages.length === 0 ? (
          <div className="space-y-room-3">
            <div className="mx-auto w-fit border border-roomBorder bg-voidBlack px-room-2 py-room-1 font-mono text-[10px] uppercase text-mutedText">
              Fee negotiation started
            </div>
            <div className="border border-roomBorder bg-[#151515] p-room-3">
              <p className="font-mono text-[10px] uppercase text-mutedText">System</p>
              <p className="mt-room-2 text-sm leading-6 text-paperWhite">
                No messages yet. Use this log for rider, fee, schedule, and contract decisions.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              const isMine = message.sender_id === currentUserId;

              return (
                <div
                  className={`max-w-[86%] border p-3 ${
                    isMine ? "ml-auto border-[#496000] bg-[#1b2600] text-paperWhite" : "border-roomBorder bg-[#151515] text-paperWhite"
                  }`}
                  key={message.id}
                >
                  <p className="text-sm leading-6">{message.message}</p>
                  <p className={`mt-3 font-mono text-[10px] uppercase ${isMine ? "text-acidGreen" : "text-neutral-500"}`}>
                    {isMine ? "You" : "Contact"} / {new Date(message.created_at).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error ? <p className="mx-room-3 border border-warningOrange p-3 text-sm text-warningOrange">{error}</p> : null}

      <form className="flex gap-2 border-t border-roomBorder p-room-3" onSubmit={sendMessage}>
        <input
          className="h-10 min-w-0 flex-1 border border-roomBorder bg-voidBlack px-room-2 font-mono text-[12px] text-paperWhite outline-none placeholder:text-neutral-700 focus:border-paperWhite"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type message or /command..."
        />
        <button
          className="grid h-10 w-12 place-items-center bg-acidGreen font-display text-lg text-voidBlack transition disabled:cursor-not-allowed disabled:bg-inkPanel disabled:text-mutedText"
          disabled={isSending || !draft.trim()}
          type="submit"
          aria-label="Send message"
        >
          {isSending ? "..." : ">"}
        </button>
      </form>
    </section>
  );
}
