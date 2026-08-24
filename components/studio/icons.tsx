import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
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
      <circle cx="12" cy="12" r="3" {...stroke} />
      <path
        d="M12 3.5v2.2M12 18.3V20.5M4.8 6.7l1.6 1.6M17.6 15.7l1.6 1.6M3.5 12h2.2M18.3 12H20.5M4.8 17.3l1.6-1.6M17.6 8.3l1.6-1.6"
        {...stroke}
      />
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
