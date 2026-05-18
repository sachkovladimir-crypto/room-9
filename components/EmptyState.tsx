import Link from "next/link";

type EmptyStateProps = {
  title: string;
  message: string;
  href?: string;
  action?: string;
};

export function EmptyState({ title, message, href, action }: EmptyStateProps) {
  return (
    <div className="room-card p-8 text-center">
      <h2 className="room-heading text-2xl">{title}</h2>
      <p className="room-muted mx-auto mt-3 max-w-xl">{message}</p>
      {href && action ? (
        <Link href={href} className="room-button mt-6">
          {action}
        </Link>
      ) : null}
    </div>
  );
}
