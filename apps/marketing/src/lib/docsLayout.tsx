import Link from "next/link";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { ThemeToggle } from "@/components/ThemeToggle";

export function docsLayoutOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          <div className="flex size-[20px] items-center justify-center rounded bg-sky-600 font-bold text-white text-[10px]">
            C
          </div>
          Caide
          <span className="rounded-full border border-[var(--divide)] px-2 py-px text-[11px] font-medium tracking-normal text-[var(--text-tertiary)]">
            Docs
          </span>
        </span>
      ),
      url: "/",
      transparentMode: "none",
      children: (
        <div className="ms-auto flex items-center justify-end gap-2">
          <ThemeToggle />
        </div>
      ),
    },
    links: [
      { text: "Install", url: "/install" },
      { text: "Changelog", url: "/changelog" },
      {
        type: "custom",
        children: (
          <Link
            href="/install"
            className="mx-2 mt-1 flex min-h-8 items-center justify-center rounded-lg bg-[var(--btn-primary-bg)] px-3 py-1.5 text-[12px] font-medium text-[var(--btn-primary-fg)] transition-opacity hover:opacity-90"
          >
            Download
          </Link>
        ),
      },
    ],
    themeSwitch: { enabled: false },
  };
}
