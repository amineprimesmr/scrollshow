"use client";

import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" {...stroke} />
      <path d="M8 3.5v3.5M16 3.5v3.5M3.5 10h17" {...stroke} />
    </Svg>
  );
}

export function IconMedia(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" {...stroke} />
      <circle cx="9" cy="10" r="1.4" {...stroke} />
      <path d="M3.8 16.2 9 12.5l3.2 2.4 2.6-2.1 5.4 4.2" {...stroke} />
    </Svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19V6M4 19h16" {...stroke} />
      <path d="M8 15v-4M12 15V8M16 15v-6" {...stroke} />
    </Svg>
  );
}

export function IconPlug(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 8h8v5.5a4 4 0 0 1-8 0V8Z" {...stroke} />
      <path d="M10 3.5V8M14 3.5V8M12 17.5V20.5" {...stroke} />
    </Svg>
  );
}

export function IconCard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="13" rx="3" {...stroke} />
      <path d="M3 10.5h18" {...stroke} />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        {...stroke}
      />
      <circle cx="12" cy="12" r="3" {...stroke} />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" {...stroke} />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 5h3.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5H15M10 8l-4 4 4 4M6 12h10" {...stroke} />
    </Svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.2" {...stroke} />
      <path d="M5.5 19.2c1.2-3.2 3.4-4.8 6.5-4.8s5.3 1.6 6.5 4.8" {...stroke} />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" {...stroke} />
      <path d="M8 11V8.2a4 4 0 0 1 8 0V11" {...stroke} />
    </Svg>
  );
}

export function IconKey(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="14" r="3.2" {...stroke} />
      <path d="M11 14h9v3M17 14v3" {...stroke} />
    </Svg>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.5 3.8 19h16.4L12 4.5Z" {...stroke} />
      <path d="M12 10v4.5M12 16.8v.6" {...stroke} />
    </Svg>
  );
}

export function IconMcp(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" {...stroke} />
      <path d="M7 9.5 9.5 12 7 14.5M12 14.5h5" {...stroke} />
    </Svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" {...stroke} />
    </Svg>
  );
}

export function IconAutomations(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" {...stroke} />
      <circle cx="12" cy="12" r="3.5" {...stroke} />
    </Svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c5 0 9 4 10 7-.4 1.2-1.2 2.6-2.4 3.9M6.5 6.6C4.3 8 2.8 10 2 12c1 3 5 7 10 7 1.4 0 2.7-.3 3.9-.8" {...stroke} />
      <path d="M9.9 10a3 3 0 0 0 4.2 4.2" {...stroke} />
    </Svg>
  );
}

export function IconGift(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="10" width="18" height="10" rx="2" {...stroke} />
      <path d="M12 10v10M3 14h18M8.5 10C7 10 6 8.8 6 7.5S7 5 8.5 5 11 6.2 11 7.5M12.5 10c1.5 0 2.5-1.2 2.5-2.5S14 5 12.5 5 10 6.2 10 7.5" {...stroke} />
    </Svg>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="8" width="18" height="12" rx="2" {...stroke} />
      <path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8M3 13h18" {...stroke} />
    </Svg>
  );
}

export function IconBook(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 4.5h11a2 2 0 0 1 2 2V19.5H7a2 2 0 0 0-2 2V6.5a2 2 0 0 1 2-2Z" {...stroke} />
      <path d="M7 19.5h11" {...stroke} />
    </Svg>
  );
}

export function IconFlame(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 22c4-2.5 6-6 6-10a6 6 0 0 0-10.5-4C8 6 7 8 7 10c0 4 2 7.5 5 12Z" {...stroke} />
    </Svg>
  );
}

export function IconChevron(props: IconProps & { dir?: "left" | "right" | "down" }) {
  const d =
    props.dir === "left"
      ? "M15 6l-6 6 6 6"
      : props.dir === "down"
        ? "M6 9l6 6 6-6"
        : "M9 6l6 6-6 6";
  return (
    <Svg {...props}>
      <path d={d} {...stroke} />
    </Svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" {...stroke} />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5 9.5 17 19 7" {...stroke} />
    </Svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" {...stroke} />
    </Svg>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 13.5 6.5 5h11L20 13.5" {...stroke} />
      <path d="M4 13.5h4.8l1 2.2h4.4l1-2.2H20V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-5.5Z" {...stroke} />
    </Svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 10.5a6 6 0 0 1 12 0v4l1.8 3H4.2l1.8-3v-4Z" {...stroke} />
      <path d="M9.7 19.5a2.3 2.3 0 0 0 4.6 0" {...stroke} />
    </Svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" {...stroke} />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5s1.2-6.2 3.6-8.5Z" {...stroke} />
    </Svg>
  );
}

export function IconDatabase(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="6" rx="7.5" ry="2.8" {...stroke} />
      <path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6" {...stroke} />
      <path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" {...stroke} />
    </Svg>
  );
}

const NAV_ICON_MAP: Record<string, (p: IconProps) => ReactNode> = {
  home: IconHome,
  automations: IconAutomations,
  unshadowban: IconEyeOff,
  media: IconMedia,
  calendar: IconCalendar,
  chart: IconChart,
  warmed: IconFlame,
  gift: IconGift,
  brand: IconBriefcase,
  guide: IconBook,
  plug: IconPlug,
  mcp: IconMcp,
  settings: IconSettings,
};

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = NAV_ICON_MAP[name] || IconHome;
  return <Icon size={size} />;
}
