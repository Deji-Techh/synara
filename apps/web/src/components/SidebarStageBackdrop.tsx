import { useId } from "react";
import { cn } from "~/lib/utils";
import { useSidebarBackdropStore } from "~/sidebarBackdropStore";

const STAGE_BACKDROP_VIEW_BOX = "0 0 8192 256";

const NIGHTLY_STARS: ReadonlyArray<{
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}> = [
  { cx: 14, cy: 10, r: 0.65, opacity: 0.9 },
  { cx: 38, cy: 22, r: 0.45, opacity: 0.6 },
  { cx: 58, cy: 8, r: 0.55, opacity: 0.75 },
  { cx: 84, cy: 16, r: 0.45, opacity: 0.55 },
  { cx: 104, cy: 7, r: 0.65, opacity: 0.85 },
  { cx: 126, cy: 20, r: 0.45, opacity: 0.6 },
  { cx: 148, cy: 11, r: 0.55, opacity: 0.75 },
  { cx: 170, cy: 24, r: 0.45, opacity: 0.55 },
  { cx: 192, cy: 9, r: 0.65, opacity: 0.85 },
  { cx: 214, cy: 18, r: 0.45, opacity: 0.6 },
  { cx: 236, cy: 8, r: 0.55, opacity: 0.75 },
  { cx: 258, cy: 20, r: 0.5, opacity: 0.65 },
  { cx: 278, cy: 11, r: 0.6, opacity: 0.8 },
  { cx: 26, cy: 34, r: 0.45, opacity: 0.5 },
  { cx: 64, cy: 42, r: 0.5, opacity: 0.55 },
  { cx: 118, cy: 34, r: 0.45, opacity: 0.5 },
  { cx: 156, cy: 46, r: 0.55, opacity: 0.5 },
  { cx: 202, cy: 32, r: 0.45, opacity: 0.55 },
  { cx: 244, cy: 44, r: 0.4, opacity: 0.45 },
  { cx: 268, cy: 34, r: 0.4, opacity: 0.5 },
  { cx: 42, cy: 62, r: 0.4, opacity: 0.4 },
  { cx: 96, cy: 58, r: 0.5, opacity: 0.45 },
  { cx: 138, cy: 72, r: 0.4, opacity: 0.35 },
  { cx: 184, cy: 64, r: 0.45, opacity: 0.4 },
  { cx: 226, cy: 78, r: 0.35, opacity: 0.3 },
  { cx: 72, cy: 92, r: 0.35, opacity: 0.25 },
  { cx: 162, cy: 98, r: 0.4, opacity: 0.25 },
  { cx: 252, cy: 90, r: 0.35, opacity: 0.25 },
  { cx: 80, cy: 130, r: 0.35, opacity: 0.2 },
  { cx: 190, cy: 145, r: 0.4, opacity: 0.2 },
];

const NIGHTLY_SPARKLES: ReadonlyArray<{ x: number; y: number }> = [
  { x: 70, y: 28 },
  { x: 160, y: 36 },
  { x: 246, y: 26 },
  { x: 112, y: 64 },
  { x: 208, y: 56 },
];

export function NightlySkyArt({ compact = false }: { compact?: boolean }) {
  const idPrefix = useId().replaceAll(":", "");
  const skyId = `${idPrefix}-stage-night-sky`;
  const glowId = `${idPrefix}-stage-night-glow`;
  const cloudId = `${idPrefix}-stage-night-cloud`;
  const softId = `${idPrefix}-stage-night-soft`;
  const starsId = `${idPrefix}-stage-night-stars`;
  const glowsId = `${idPrefix}-stage-night-glows`;

  return (
    <svg
      className="stage-art stage-nightly h-full w-full"
      fill="none"
      preserveAspectRatio="xMinYMin slice"
      viewBox={compact ? "96 0 8192 256" : STAGE_BACKDROP_VIEW_BOX}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id={skyId}
          x1="24"
          y1="0"
          x2="264"
          y2="256"
          gradientUnits="userSpaceOnUse"
          spreadMethod="reflect"
        >
          <stop style={{ stopColor: "var(--stage-night-bottom, #1a162b)" }} />
          <stop offset="0.35" style={{ stopColor: "var(--stage-night-mid, #221c3b)" }} />
          <stop offset="0.7" style={{ stopColor: "var(--stage-night-top, #2d214f)" }} />
          <stop offset="1" style={{ stopColor: "var(--stage-night-bottom, #1a162b)" }} />
        </linearGradient>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(216 28) rotate(137) scale(160 120)"
          gradientUnits="userSpaceOnUse"
        >
          <stop style={{ stopColor: "var(--stage-night-glow-highlight, #7c5ce8)" }} stopOpacity="0.45" />
          <stop
            offset="0.5"
            style={{ stopColor: "var(--stage-night-glow-secondary, #43337a)" }}
            stopOpacity="0.2"
          />
          <stop offset="1" style={{ stopColor: "var(--stage-night-bottom, #1a162b)" }} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cloudId} x1="0" y1="40" x2="288" y2="256" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--stage-night-highlight, #9980fa)" }} stopOpacity="0.5" />
          <stop
            offset="0.48"
            style={{ stopColor: "var(--stage-night-secondary, #7555e8)" }}
            stopOpacity="0.55"
          />
          <stop offset="1" style={{ stopColor: "var(--stage-night-tertiary, #5f3dc4)" }} stopOpacity="0" />
        </linearGradient>
        <filter id={softId} x="-24" y="-24" width="336" height="300" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <pattern id={starsId} width="288" height="256" patternUnits="userSpaceOnUse">
          <g style={{ fill: "var(--stage-night-line, #ffffff)" }}>
            {NIGHTLY_STARS.map((star) => (
              <circle
                key={`${star.cx}-${star.cy}`}
                cx={star.cx}
                cy={star.cy}
                r={star.r}
                fillOpacity={star.opacity}
              />
            ))}
          </g>
          <g
            style={{ stroke: "var(--stage-night-sparkle, #dcd6f7)" }}
            strokeLinecap="round"
            strokeOpacity="0.75"
            strokeWidth="0.6"
          >
            {NIGHTLY_SPARKLES.map((sparkle) => (
              <g key={`${sparkle.x}-${sparkle.y}`}>
                <path d={`M${sparkle.x - 1.5} ${sparkle.y}H${sparkle.x + 1.5}`} />
                <path d={`M${sparkle.x} ${sparkle.y - 1.5}V${sparkle.y + 1.5}`} />
              </g>
            ))}
          </g>
        </pattern>
        <pattern id={glowsId} width="640" height="256" patternUnits="userSpaceOnUse">
          <rect width="640" height="256" fill={`url(#${glowId})`} />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill={`url(#${skyId})`} />
      <rect width="100%" height="100%" fill={`url(#${glowsId})`} />
      <rect width="100%" height="100%" fill={`url(#${starsId})`} />
    </svg>
  );
}

export function SidebarStageBackdrop({ className }: { className?: string }) {
  const customImage = useSidebarBackdropStore((s) => s.customImage);

  return (
    <div
      aria-hidden
      className={cn(
        "sidebar-stage-backdrop pointer-events-none absolute inset-x-0 top-0 z-0 h-[88px] select-none overflow-hidden",
        className,
      )}
    >
      {customImage ? (
        <div
          className="h-full w-full bg-cover bg-top"
          style={{ backgroundImage: `url(${customImage})` }}
        />
      ) : (
        <NightlySkyArt />
      )}
    </div>
  );
}
