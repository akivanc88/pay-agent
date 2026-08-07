/**
 * A small, deliberately restrained icon set for the audit trail — one glyph per event kind,
 * all drawn at the same stroke weight as the rest of the app's line art (see the header sprout,
 * the 404 trellis). Each is a bare shape; the timeline row supplies the color via `currentColor`.
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M19 19l-4.3-4.3" />
    </svg>
  );
}

export function IconShieldCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5l7 2.6v5.4c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6.1l7-2.6Z" />
      <path d="M8.7 12.2l2.3 2.3 4.3-4.6" />
    </svg>
  );
}

export function IconShieldAlert({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5l7 2.6v5.4c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6.1l7-2.6Z" />
      <path d="M12 8.3v4.2M12 15.6h.01" />
    </svg>
  );
}

export function IconHourglass({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M7.5 3.5v3.1c0 2.1 1.7 3.6 3.4 4.4.4.2.4.8 0 1l-.8.4C8.6 13.4 7.5 14.9 7.5 17v3.5M16.5 3.5v3.1c0 2.1-1.7 3.6-3.4 4.4-.4.2-.4.8 0 1l.8.4c1.9.8 3 2.3 3 4.4v3.5" />
    </svg>
  );
}

export function IconCheckCircle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 12.3l2.4 2.4 5-5.4" />
    </svg>
  );
}

export function IconXCircle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4" />
    </svg>
  );
}

export function IconPen({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14.2 5.3l4.5 4.5-9.3 9.3-5 .5.5-5 9.3-9.3Z" />
      <path d="M12.6 6.9l4.5 4.5" />
    </svg>
  );
}

export function IconStamp({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="9.5" r="5" />
      <path d="M9.3 8.9l1.9 1.9 3.5-3.9" />
      <path d="M6 20.5c0-2.2 1.4-3.5 3-3.5h6c1.6 0 3 1.3 3 3.5" />
    </svg>
  );
}

export function IconRoute({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="18" cy="18" r="2.2" />
      <path d="M8 7l4 0c2.8 0 3.3 2 2 3.4L10 15.6c-1.3 1.4-.8 3.4 2 3.4h4" strokeDasharray="1 3.4" />
    </svg>
  );
}

export function IconGift({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="9.5" width="16" height="10.5" rx="1.3" />
      <path d="M4 13.2h16M12 9.5v10.5" />
      <path d="M12 9.5c-1.6 0-4-.6-4-2.8C8 4.9 9.5 4 10.6 4.6c1 .6 1.4 2.5 1.4 4.9Zm0 0c1.6 0 4-.6 4-2.8 0-1.8-1.5-2.7-2.6-2.1-1 .6-1.4 2.5-1.4 4.9Z" />
    </svg>
  );
}

export function IconUndo({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 9.5h8a5 5 0 0 1 0 10h-3" />
      <path d="M9 6L5.5 9.5 9 13" />
    </svg>
  );
}

export function IconCard({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="6" width="17" height="12" rx="1.8" />
      <path d="M3.5 10.3h17" />
      <path d="M6.5 14.3h4" />
    </svg>
  );
}

export function IconBanknote({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="7.5" width="18" height="9" rx="1.6" />
      <circle cx="12" cy="12" r="2.3" />
      <path d="M6 9v0M18 15v0" />
    </svg>
  );
}

export function IconDoubleCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 12.5l3.2 3.2L12 9.3" />
      <path d="M9.5 12.5l3.2 3.2L19 9.3" />
    </svg>
  );
}

export function IconAlertTriangle({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4.2l9 15.6H3l9-15.6Z" />
      <path d="M12 10v3.6M12 16.6h.01" />
    </svg>
  );
}

export function IconInfo({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.3M12 7.7h.01" />
    </svg>
  );
}
