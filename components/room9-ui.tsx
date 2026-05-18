import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ElementType,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import type { BookingStatus } from "@/lib/types";

export const ROOM9_TOKENS = {
  colors: {
    voidBlack: "#050505",
    panelBlack: "#0F0F0F",
    inkPanel: "#171717",
    border: "#252525",
    strongBorder: "#3A3A3A",
    paperWhite: "#F2F0EA",
    mutedText: "#8F8F8B",
    acidGreen: "#BAFF00",
    warningOrange: "#FF5A1F",
    errorRed: "#FF3B30",
    successGreen: "#3DFF88"
  },
  spacing: {
    4: "4px",
    8: "8px",
    16: "16px",
    24: "24px",
    32: "32px",
    40: "40px",
    64: "64px",
    96: "96px"
  },
  layout: {
    targetWidth: "1440px",
    pageMargin: "40px",
    columns: 12,
    playerHeight: "88px",
    workspaceSidebar: "248px"
  }
} as const;

export const room9Text = {
  display: "room-safe-title font-display text-room-hero uppercase text-paperWhite [text-wrap:balance]",
  sectionTitle: "room-safe-title font-display text-room-section uppercase text-paperWhite",
  title: "room-safe-title font-display text-room-title uppercase text-paperWhite",
  uiLabel: "room-safe-text font-mono text-room-label font-black uppercase text-mutedText",
  body: "room-safe-text text-room-body normal-case text-mutedText",
  small: "room-safe-text text-room-small normal-case text-mutedText",
  mono: "room-safe-text font-mono text-room-mono uppercase text-mutedText"
} as const;

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Text({
  as,
  variant = "body",
  className,
  children
}: {
  as?: ElementType;
  variant?: keyof typeof room9Text;
  className?: string;
  children: ReactNode;
}) {
  const Component = as ?? "p";
  return <Component className={cx(room9Text[variant], className)}>{children}</Component>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex max-w-full min-w-0 items-center justify-center gap-2 overflow-hidden border text-center font-mono font-black uppercase leading-tight tracking-normal transition focus:outline-none focus-visible:border-acidGreen disabled:cursor-not-allowed disabled:opacity-45";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-acidGreen bg-acidGreen text-voidBlack hover:border-paperWhite hover:bg-paperWhite active:bg-successGreen",
  secondary: "border-roomBorder bg-panelBlack text-paperWhite hover:border-paperWhite hover:bg-inkPanel active:border-acidGreen",
  ghost: "border-transparent bg-transparent text-mutedText hover:border-roomBorder hover:bg-inkPanel hover:text-paperWhite active:text-acidGreen",
  destructive: "border-errorRed bg-transparent text-errorRed hover:bg-errorRed hover:text-voidBlack active:bg-errorRed",
  danger: "border-errorRed bg-transparent text-errorRed hover:bg-errorRed hover:text-voidBlack active:bg-errorRed"
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-[10px]",
  md: "min-h-10 px-4 text-[10px]",
  lg: "min-h-11 px-6 text-[11px]"
};

export function buttonClassName({
  variant = "secondary",
  size = "md",
  active = false,
  className
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  className?: string;
} = {}) {
  return cx(
    buttonBase,
    buttonVariants[variant],
    buttonSizes[size],
    active && "border-acidGreen text-acidGreen",
    className
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  loading?: boolean;
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  active = false,
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClassName({ variant, size, active, className })}
      disabled={disabled || loading}
      data-state={active ? "active" : "default"}
      {...props}
    >
      {loading ? <span className="h-2 w-2 animate-pulse bg-current" /> : null}
      <span className="room-one-line inline-flex items-center gap-2">{loading ? "Loading" : children}</span>
    </button>
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
};

export function ButtonLink({
  className,
  href,
  variant = "secondary",
  size = "md",
  active = false,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, active, className })} href={href} {...props}>
      <span className="room-one-line inline-flex items-center gap-2">{props.children}</span>
    </Link>
  );
}

type FieldState = "default" | "filled" | "error";

function fieldClassName({
  state = "default",
  className,
  disabled
}: {
  state?: FieldState;
  className?: string;
  disabled?: boolean;
}) {
  return cx(
    "w-full min-w-0 border bg-voidBlack px-room-2 py-3 text-sm text-paperWhite outline-none transition placeholder:text-neutral-700 focus:border-paperWhite",
    state === "default" && "border-roomBorder",
    state === "filled" && "border-strongBorder",
    state === "error" && "border-errorRed text-errorRed",
    disabled && "cursor-not-allowed opacity-50",
    className
  );
}

export function FieldMessage({ children, error = false }: { children?: ReactNode; error?: boolean }) {
  if (!children) {
    return null;
  }

  return <p className={cx("mt-2 text-sm", error ? "text-errorRed" : "text-mutedText")}>{children}</p>;
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  state?: FieldState;
  error?: ReactNode;
};

export function Input({ className, state, error, disabled, value, ...props }: InputProps) {
  const currentState = error ? "error" : state ?? (value ? "filled" : "default");
  return (
    <>
      <input
        className={fieldClassName({ state: currentState, className, disabled })}
        disabled={disabled}
        value={value}
        {...props}
      />
      <FieldMessage error>{error}</FieldMessage>
    </>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  state?: FieldState;
  error?: ReactNode;
};

export function Textarea({ className, state, error, disabled, value, ...props }: TextareaProps) {
  const currentState = error ? "error" : state ?? (value ? "filled" : "default");
  return (
    <>
      <textarea
        className={fieldClassName({
          state: currentState,
          className: cx("min-h-32 leading-6", className),
          disabled
        })}
        disabled={disabled}
        value={value}
        {...props}
      />
      <FieldMessage error>{error}</FieldMessage>
    </>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  state?: FieldState;
  error?: ReactNode;
};

export function Select({ className, state, error, disabled, value, ...props }: SelectProps) {
  const currentState = error ? "error" : state ?? (value ? "filled" : "default");
  return (
    <>
      <select
        className={fieldClassName({ state: currentState, className, disabled })}
        disabled={disabled}
        value={value}
        {...props}
      />
      <FieldMessage error>{error}</FieldMessage>
    </>
  );
}

type BadgeVariant =
  | "live"
  | "pending"
  | "accepted"
  | "declined"
  | "verified"
  | "escrowReady"
  | "blocked"
  | "selected"
  | "draft"
  | "sent"
  | "waiting"
  | "neutral"
  | BookingStatus;

const badgeVariants: Record<string, string> = {
  live: "border-acidGreen text-acidGreen",
  pending: "border-warningOrange text-warningOrange",
  accepted: "border-successGreen text-successGreen",
  declined: "border-errorRed text-errorRed",
  verified: "border-successGreen text-successGreen",
  escrowReady: "border-acidGreen bg-acidGreen text-voidBlack",
  escrow_ready: "border-acidGreen bg-acidGreen text-voidBlack",
  deposit_pending: "border-warningOrange text-warningOrange",
  not_funded: "border-roomBorder text-mutedText",
  released: "border-successGreen bg-successGreen text-voidBlack",
  blocked: "border-errorRed bg-errorRed text-voidBlack",
  selected: "border-acidGreen bg-acidGreen text-voidBlack",
  draft: "border-roomBorder text-mutedText",
  sent: "border-acidGreen text-acidGreen",
  waiting: "border-warningOrange text-warningOrange",
  locked: "border-roomBorder text-mutedText",
  unlocked: "border-acidGreen text-acidGreen",
  complete: "border-successGreen bg-successGreen text-voidBlack",
  done: "border-successGreen text-successGreen",
  current: "border-acidGreen text-acidGreen",
  cancelled: "border-mutedText text-mutedText",
  completed: "border-acidGreen text-acidGreen",
  paid: "border-successGreen text-successGreen",
  disputed: "border-errorRed text-errorRed",
  neutral: "border-roomBorder text-mutedText",
  public: "border-acidGreen text-acidGreen",
  private: "border-mutedText text-mutedText",
  upcoming: "border-warningOrange text-warningOrange",
  archived: "border-roomBorder text-mutedText",
  hold: "border-warningOrange text-warningOrange",
  searching: "border-warningOrange text-warningOrange",
  optional: "border-roomBorder text-mutedText"
};

export function Badge({
  variant = "neutral",
  children,
  className
}: {
  variant?: BadgeVariant | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "room-one-line inline-flex items-center border px-2.5 py-1 font-mono text-[9px] font-black uppercase",
        badgeVariants[variant] ?? badgeVariants.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className,
  children
}: {
  status: BookingStatus | string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Badge className={className} variant={status}>
      {children ?? status}
    </Badge>
  );
}

type CardVariant = "artist" | "track" | "event" | "booking" | "stat" | "action";

const cardVariants: Record<CardVariant, string> = {
  artist: "border-roomBorder bg-panelBlack",
  track: "border-roomBorder bg-panelBlack",
  event: "border-roomBorder bg-voidBlack",
  booking: "border-strongBorder bg-panelBlack",
  stat: "border-roomBorder bg-panelBlack",
  action: "border-roomBorder bg-panelBlack"
};

export function Card({
  variant = "action",
  active = false,
  className,
  children
}: {
  variant?: CardVariant;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cx("room-grid-safe border", cardVariants[variant], active && "border-acidGreen", className)}
    >
      {children}
    </section>
  );
}

export function Panel({
  children,
  className,
  active = false
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <Card active={active} className={className} variant="action">
      {children}
    </Card>
  );
}

export function MetricCard({
  label,
  value,
  note,
  active = false
}: {
  label: string;
  value: string | number;
  note?: string;
  active?: boolean;
}) {
  return (
    <Card active={active} className="relative overflow-hidden p-room-2" variant="stat">
      <p className={cx(room9Text.uiLabel, active ? "text-acidGreen" : "text-mutedText")}>{label}</p>
      <p className={cx("room-safe-title mt-room-2 font-display text-[clamp(1.8rem,3vw,3rem)] uppercase leading-none", active ? "text-acidGreen" : "text-paperWhite")}>
        {value}
      </p>
      {note ? <p className="room-clamp-2 mt-room-1 font-mono text-[9px] uppercase leading-4 text-mutedText">{note}</p> : null}
      <span
        aria-hidden="true"
        className={cx("absolute inset-x-0 bottom-0 h-1", active ? "bg-acidGreen" : "bg-strongBorder")}
      />
    </Card>
  );
}

export function SectionHeader({
  title,
  eyebrow,
  action
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-room-2 border-b border-roomBorder pb-room-2">
      <div className="min-w-0">
        {eyebrow ? <Text variant="uiLabel">{eyebrow}</Text> : null}
        <Text as="h2" className="mt-room-1" variant="sectionTitle">
          {title}
        </Text>
      </div>
      {action ? <div className="max-w-full shrink-0">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  meta,
  action
}: {
  title: string;
  description?: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <header className="border-b border-roomBorder bg-voidBlack px-5 py-room-5 md:px-room-4">
      <div className="mx-auto flex max-w-room-wide flex-wrap items-end justify-between gap-room-5">
        <div className="min-w-0 max-w-5xl">
          {meta ? <Text variant="mono">{meta}</Text> : null}
          <Text as="h1" className="mt-room-2 text-[42px] leading-[0.92] md:text-[64px]" variant="title">
            {title}
          </Text>
          {description ? <Text className="mt-room-3 max-w-2xl" variant="body">{description}</Text> : null}
        </div>
        {action ? <div className="max-w-full shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

export type TrackDisplay = {
  id: string;
  title: string;
  artist: string;
  href?: string;
  coverUrl?: string | null;
  genre?: string | null;
  bpm?: string | null;
  duration?: string | null;
  plays?: number | null;
  saves?: number | null;
};

export function TrackRow({
  track,
  action,
  active = false
}: {
  track: TrackDisplay;
  action?: ReactNode;
  active?: boolean;
}) {
  const content = (
    <>
      <div
        className="h-16 w-16 shrink-0 border border-roomBorder bg-inkPanel bg-cover bg-center"
        style={{ backgroundImage: `url(${track.coverUrl || "/room9-track-placeholder.svg"})` }}
      />
      <div className="min-w-0 flex-1">
        <Text as="h3" className="room-one-line" variant="title">{track.title}</Text>
        <p className="room-one-line mt-room-1 text-sm text-mutedText">
          {[track.artist, track.genre, track.bpm ? `${track.bpm} BPM` : "", track.duration].filter(Boolean).join(" / ")}
        </p>
      </div>
      <p className="hidden font-mono text-[10px] uppercase text-mutedText md:block">
        {track.plays ?? 0} plays / {track.saves ?? 0} saves
      </p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </>
  );

  const className = cx(
    "flex items-center gap-room-2 border p-room-2 transition",
    active ? "border-acidGreen bg-inkPanel" : "border-roomBorder bg-panelBlack",
    track.href && "hover:border-paperWhite"
  );

  if (track.href) {
    return (
      <Link className={className} href={track.href}>
        {content}
      </Link>
    );
  }

  return <article className={className}>{content}</article>;
}

export function TrackCard({
  track,
  action,
  active = false
}: {
  track: TrackDisplay;
  action?: ReactNode;
  active?: boolean;
}) {
  return (
    <Card active={active} className="overflow-hidden" variant="track">
      <Link href={track.href ?? "#"} className="block">
        <div
          className="aspect-square border-b border-roomBorder bg-inkPanel bg-cover bg-center"
          style={{ backgroundImage: `url(${track.coverUrl || "/room9-track-placeholder.svg"})` }}
        />
        <div className="p-room-3">
          <Text as="h3" className="room-clamp-2" variant="title">{track.title}</Text>
          <p className="room-clamp-2 mt-room-2 text-sm text-mutedText">
            {[track.artist, track.genre, track.bpm ? `${track.bpm} BPM` : ""].filter(Boolean).join(" / ")}
          </p>
          <Text className="mt-room-3" variant="mono">
            {track.plays ?? 0} plays / {track.saves ?? 0} saves
          </Text>
        </div>
      </Link>
      {action ? <div className="border-t border-roomBorder p-room-3">{action}</div> : null}
    </Card>
  );
}

export function ArtistCard({
  name,
  href,
  city,
  country,
  genre,
  imageUrl,
  action
}: {
  name: string;
  href: string;
  city?: string | null;
  country?: string | null;
  genre?: string | null;
  imageUrl?: string | null;
  action?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden" variant="artist">
      <Link href={href} className="block">
        <div
          className="aspect-[4/3] border-b border-roomBorder bg-inkPanel bg-cover bg-center grayscale"
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
        />
        <div className="p-room-3">
          <Text as="h3" className="room-clamp-2 text-[clamp(1.5rem,3vw,2.5rem)]" variant="title">{name}</Text>
          <Text className="room-clamp-2 mt-room-2" variant="mono">
            {[genre, city, country].filter(Boolean).join(" / ") || "Artist dossier"}
          </Text>
        </div>
      </Link>
      {action ? <div className="border-t border-roomBorder p-room-3">{action}</div> : null}
    </Card>
  );
}

export function SoundEvidenceBlock({
  title,
  timestamp,
  description,
  meta,
  active = false
}: {
  title: string;
  timestamp: string;
  description?: string;
  meta?: string;
  active?: boolean;
}) {
  return (
    <Panel active={active} className="p-room-3">
      <div className="flex flex-wrap items-start justify-between gap-room-2">
        <div className="min-w-0">
          <Text className={active ? "text-acidGreen" : undefined} variant="uiLabel">
            Atmosphere Brief
          </Text>
          <Text as="h3" className="room-clamp-2 mt-room-1" variant="title">{title}</Text>
          {meta ? <Text className="mt-room-1" variant="mono">{meta}</Text> : null}
        </div>
        <div className={cx("border px-room-2 py-3 text-center", active ? "border-acidGreen" : "border-roomBorder")}>
          <Text variant="uiLabel">Timestamp</Text>
          <p className={cx("mt-room-1 font-display text-4xl leading-none", active ? "text-acidGreen" : "text-paperWhite")}>
            {timestamp}
          </p>
        </div>
      </div>
      {description ? <Text className="mt-room-3" variant="small">{description}</Text> : null}
    </Panel>
  );
}

export type NavigationItem = {
  label: string;
  href: string;
  badge?: string | number;
};

export const publicNavigationItems: NavigationItem[] = [
  { label: "Explore", href: "/explore" },
  { label: "Events", href: "/events" },
  { label: "Streams", href: "/streams" }
];

export const workspaceNavigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Bookings", href: "/dashboard/bookings" },
  { label: "Vault", href: "/library" },
  { label: "Calendar", href: "/dashboard/calendar" },
  { label: "Streams", href: "/dashboard/streams" },
  { label: "Events", href: "/dashboard/events" },
  { label: "Settings", href: "/dashboard/settings" }
];

export function TopNavigation({
  items = publicNavigationItems,
  activeHref,
  isAuthenticated = false,
  className
}: {
  items?: NavigationItem[];
  activeHref?: string;
  isAuthenticated?: boolean;
  className?: string;
}) {
  return (
    <header className={cx("border-b border-roomBorder bg-voidBlack", className)}>
      <div className="mx-auto flex min-h-[72px] max-w-room items-center justify-between gap-room-3 px-room-page">
        <Link className="font-display text-3xl uppercase text-paperWhite" href="/">
          ROOM_9
        </Link>
        <nav className="flex items-center gap-room-4">
          {items.map((item) => (
            <Link
              className={cx(
                room9Text.uiLabel,
                "hover:text-paperWhite",
                activeHref === item.href && "text-acidGreen"
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-room-2">
          <ButtonLink href={isAuthenticated ? "/dashboard" : "/login"} size="sm" variant="ghost">
            {isAuthenticated ? "Workspace" : "Login"}
          </ButtonLink>
          {!isAuthenticated ? (
            <ButtonLink href="/register" size="sm" variant="secondary">
              Sign Up
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export function SidebarNavigation({
  items = workspaceNavigationItems,
  activeHref,
  footer,
  className
}: {
  items?: NavigationItem[];
  activeHref?: string;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cx("flex min-h-screen w-room-sidebar flex-col border-r border-roomBorder bg-voidBlack", className)}>
      <Link className="border-b border-roomBorder px-room-4 py-room-4 font-display text-3xl uppercase text-paperWhite" href="/">
        ROOM_9
      </Link>
      <nav className="flex-1 space-y-room-1 px-room-2 py-room-4">
        {items.map((item) => (
          <Link
            className={cx(
              "flex min-h-11 items-center justify-between border px-room-2 font-mono text-[11px] font-black uppercase",
              activeHref === item.href
                ? "border-acidGreen bg-acidGreen text-voidBlack"
                : "border-transparent text-mutedText hover:border-roomBorder hover:text-paperWhite"
            )}
            href={item.href}
            key={item.href}
          >
            <span>{item.label}</span>
            {item.badge ? <span>{item.badge}</span> : null}
          </Link>
        ))}
      </nav>
      {footer ? <div className="border-t border-roomBorder p-room-3">{footer}</div> : null}
    </aside>
  );
}

export function PageShell({
  children,
  navigation,
  sidebar,
  className
}: {
  children: ReactNode;
  navigation?: ReactNode;
  sidebar?: ReactNode;
  className?: string;
}) {
  if (sidebar) {
    return (
      <div className={cx("min-h-screen bg-voidBlack pb-room-player text-paperWhite lg:grid lg:grid-cols-room-workspace", className)}>
        {sidebar}
        <main className="min-w-0">{children}</main>
      </div>
    );
  }

  return (
    <div className={cx("min-h-screen bg-voidBlack pb-room-player text-paperWhite", className)}>
      {navigation}
      <main>{children}</main>
    </div>
  );
}
