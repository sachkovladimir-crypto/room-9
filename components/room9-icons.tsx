import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.8" viewBox="0 0 24 24" {...props}>
      {children}
    </svg>
  );
}

export function PlayGlyph(props: IconProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function PauseGlyph(props: IconProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

export function HeartGlyph({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.8" viewBox="0 0 24 24" {...props}>
      <path d="M12 20s-7-4.35-9.25-8.3C.7 8.1 2.7 4 6.65 4c2.05 0 3.4 1.1 4.35 2.25C11.95 5.1 13.3 4 15.35 4c3.95 0 5.95 4.1 3.9 7.7C19 15.65 12 20 12 20z" />
    </svg>
  );
}

export function BookmarkGlyph({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="1.8" viewBox="0 0 24 24" {...props}>
      <path d="M6 4h12v17l-6-3.4L6 21z" />
    </svg>
  );
}

export function PlaylistGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M4 12h12M4 17h8" />
      <path d="M18 8h3M19.5 6.5v3" />
    </Icon>
  );
}

export function QueueGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M4 12h12M4 17h8" />
      <path d="M18 16l3 2-3 2z" />
    </Icon>
  );
}

export function ExternalGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 8h8v8M16 8l-9 9" />
      <path d="M5 5h6M5 5v14h14v-6" />
    </Icon>
  );
}

export function CheckGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 13l4 4L19 7" />
    </Icon>
  );
}

export function XGlyph(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function MoreGlyph(props: IconProps) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM22 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    </svg>
  );
}
