// FILE: FrameworkIcon.tsx
// Purpose: Framework-branded glyph for sidebar rows, hover cards, and profile surfaces.
// Each project has one immutable framework (blank | react-native | flutter | website);
// the icon renders the per-framework PNG from /framework-icons with a vector fallback
// for blank/unknown. The PNGs were scaled to 64px and white-bagged removed from the
// user-supplied Downloads originals.
// Layer: web presentation primitive (no I/O, pure rendering)
// Exports: FrameworkIcon, frameworkDisplayName, frameworkIconSrc

import type { ProjectFramework } from "@caide/contracts";
import { FiBox } from "react-icons/fi";

import { cn } from "~/lib/utils";

export function frameworkDisplayName(framework: ProjectFramework): string {
  switch (framework) {
    case "react-native":
      return "React Native";
    case "flutter":
      return "Flutter";
    case "website":
      return "Website";
    case "blank":
      return "Blank";
    default:
      return framework;
  }
}

export function frameworkIconSrc(framework: ProjectFramework): string | null {
  switch (framework) {
    case "flutter":
      return "/framework-icons/flutter.png";
    case "react-native":
      return "/framework-icons/react-native.png";
    case "website":
      return "/framework-icons/website.png";
    case "blank":
      return null;
    default:
      return null;
  }
}

export type FrameworkIconProps = {
  framework: ProjectFramework;
  className?: string;
  size?: number;
};

export function FrameworkIcon({ framework, className, size }: FrameworkIconProps) {
  const src = frameworkIconSrc(framework);
  const label = frameworkDisplayName(framework);
  const dim = size ?? 12;
  if (!src) {
    return (
      <FiBox
        className={cn("shrink-0", className)}
        style={{ width: dim, height: dim }}
        aria-label={label}
      />
    );
  }
  return (
    <img
      src={src}
      alt={label}
      width={dim}
      height={dim}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: dim, height: dim }}
      loading="lazy"
      decoding="async"
    />
  );
}
