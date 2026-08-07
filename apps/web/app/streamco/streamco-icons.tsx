/**
 * A small bespoke icon set for the StreamCo portal — plan benefits, billing history and the
 * continue-watching strip. Stroke-based, single weight, drawn to look like they belong to one
 * system (the "lit by one lamp" note in the brief applies to iconography too, not just color).
 * Pure decoration: every icon is `aria-hidden` and carries no text a scraper could confuse with
 * the bill.
 */
import type { SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function IconScreens(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="4" width="13" height="9.5" rx="1.6" />
      <path d="M6.5 17h5" />
      <path d="M9 13.5V17" />
      <rect x="14.5" y="9" width="7" height="10.5" rx="1.4" />
      <path d="M16.8 17.2h2.4" />
    </svg>
  );
}

export function IconSparkle(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3c.6 3.4 1.9 4.7 5.3 5.3-3.4.6-4.7 1.9-5.3 5.3-.6-3.4-1.9-4.7-5.3-5.3C10.1 7.7 11.4 6.4 12 3Z" />
      <path d="M18.5 15.2c.32 1.72.98 2.38 2.7 2.7-1.72.32-2.38.98-2.7 2.7-.32-1.72-.98-2.38-2.7-2.7 1.72-.32 2.38-.98 2.7-2.7Z" />
    </svg>
  );
}

export function IconDownload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 17.5v1.8c0 .94.76 1.7 1.7 1.7h11.6c.94 0 1.7-.76 1.7-1.7v-1.8" />
    </svg>
  );
}

export function IconAudio(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 13.5v-3" />
      <path d="M8.2 16v-8" />
      <path d="M12.4 19v-14" />
      <path d="M16.6 15v-6" />
      <path d="M20.8 12.6v-1.2" />
    </svg>
  );
}

export function IconCalendar(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3.3" y="5" width="17.4" height="15.5" rx="2.2" />
      <path d="M3.3 9.6h17.4" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </svg>
  );
}

export function IconCard(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2.6" y="5.5" width="18.8" height="13" rx="2.2" />
      <path d="M2.6 9.8h18.8" />
      <path d="M6 15h4" />
    </svg>
  );
}

export function IconReceipt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M5.5 3h13v18l-2.4-1.5L13.7 21l-1.9-1.5L9.9 21l-2.4-1.5L5.5 21Z" />
      <path d="M8.5 8h7" />
      <path d="M8.5 12h7" />
      <path d="M8.5 16h4" />
    </svg>
  );
}

export function IconHelp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.5 2.5 0 1 1 3.6 2.25c-.75.4-1.1.86-1.1 1.75" />
      <path d="M12 17.1v.05" />
    </svg>
  );
}

export function IconPlay(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      {...props}
    >
      <path d="M6.5 4.3a1.3 1.3 0 0 1 1.98-1.1l12.3 7.7a1.3 1.3 0 0 1 0 2.2l-12.3 7.7A1.3 1.3 0 0 1 6.5 19.7Z" />
    </svg>
  );
}

export function IconArrowRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)} strokeWidth={1.9}>
      <path d="M4.5 12h14.5" />
      <path d="M13.5 6.5 19 12l-5.5 5.5" />
    </svg>
  );
}
