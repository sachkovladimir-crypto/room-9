import type { BookingStatus } from "@/lib/types";

type StatusPillProps = {
  status: BookingStatus;
};

const statusText: Record<BookingStatus, string> = {
  pending: "Pending",
  accepted: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
  completed: "Completed",
  paid: "Paid",
  disputed: "Disputed"
};

export function StatusPill({ status }: StatusPillProps) {
  const tone =
    status === "accepted"
      ? "border-bone text-bone"
      : status === "completed" || status === "paid"
        ? "border-bone bg-bone text-black"
      : status === "declined"
        ? "border-neutral-700 text-neutral-500"
        : status === "cancelled" || status === "disputed"
          ? "border-neutral-600 text-neutral-300"
          : "border-line text-ash";

  return (
    <span className={`inline-flex border px-2 py-1 font-mono text-[11px] uppercase ${tone}`}>
      {statusText[status]}
    </span>
  );
}
