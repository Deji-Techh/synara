// FILE: CaideLogo.tsx
// Purpose: Render the Caide mark from the packaged logo asset as an inline SVG,
// so it follows the caller's sizing while keeping the brand raster intact.
// Layer: Shared app branding primitive

import type { SVGProps } from "react";
import { cn } from "~/lib/utils";

export function CaideLogo({ className, ...props }: SVGProps<SVGSVGElement>) {
  const ariaLabel = props["aria-label"];

  return (
    <svg
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-hidden={ariaLabel ? undefined : true}
      {...props}
      className={cn("shrink-0", className)}
    >
      <image
        href="/caide-logo.png"
        width="1024"
        height="1024"
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  );
}
