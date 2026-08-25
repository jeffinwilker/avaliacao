import type { SVGProps } from "react";

export type AppIconName =
  | "dashboard"
  | "star"
  | "gift"
  | "package"
  | "download"
  | "workflow"
  | "receipt"
  | "eye"
  | "settings"
  | "plug"
  | "video"
  | "logout"
  | "menu"
  | "chevron-right"
  | "clock"
  | "check-circle"
  | "trend"
  | "user";

interface AppIconProps extends SVGProps<SVGSVGElement> {
  name: AppIconName;
  size?: number;
}

export function AppIcon({ name, size = 18, ...props }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <IconPaths name={name} />
    </svg>
  );
}

function IconPaths({ name }: { name: AppIconName }) {
  switch (name) {
    case "dashboard":
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
      );
    case "star":
      return (
        <path d="m12 3 2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 17.03l-5.5 2.89 1.05-6.12L3.1 9.47l6.15-.9L12 3Z" />
      );
    case "gift":
      return (
        <>
          <rect x="3" y="9" width="18" height="12" rx="2" />
          <path d="M12 9v12M3 13h18M7.5 9C5.57 9 4 7.88 4 6.5S5.12 4 6.5 4C8.43 4 12 9 12 9M16.5 9C18.43 9 20 7.88 20 6.5S18.88 4 17.5 4C15.57 4 12 9 12 9" />
        </>
      );
    case "package":
      return (
        <>
          <path d="m4 7 8-4 8 4-8 4-8-4Z" />
          <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
          <path d="M12 11v10" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 3v11" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 17v3h14v-3" />
        </>
      );
    case "workflow":
      return (
        <>
          <rect x="3" y="3" width="6" height="6" rx="2" />
          <rect x="15" y="15" width="6" height="6" rx="2" />
          <path d="M9 6h3a3 3 0 0 1 3 3v6M15 18h-3a3 3 0 0 1-3-3v-2" />
        </>
      );
    case "receipt":
      return (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </>
      );
    case "eye":
      return (
        <>
          <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      );
    case "plug":
      return (
        <>
          <path d="m8 12 8-8M14 4l6 6M6 10l8 8M8 20l2-2M4 14l6 6" />
          <path d="m7 11-2 2a4.24 4.24 0 0 0 6 6l2-2" />
        </>
      );
    case "video":
      return (
        <>
          <rect x="4" y="5" width="13" height="14" rx="3" />
          <path d="m17 10 4-2v8l-4-2" />
          <path d="M9 9h3M9 13h2" />
        </>
      );
    case "logout":
      return (
        <>
          <path d="M10 5H5v14h5" />
          <path d="M14 8l4 4-4 4M18 12H9" />
        </>
      );
    case "menu":
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case "chevron-right":
      return <path d="m9 18 6-6-6-6" />;
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case "check-circle":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16 9" />
        </>
      );
    case "trend":
      return (
        <>
          <path d="M4 17 10 11l4 4 6-8" />
          <path d="M15 7h5v5" />
        </>
      );
    case "user":
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      );
  }
}

