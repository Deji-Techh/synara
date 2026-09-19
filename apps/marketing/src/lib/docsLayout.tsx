import Link from "next/link";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { SiX, SiGithub } from "react-icons/si";
import { CaideIcon } from "@/components/BrandIcons";

export function docsLayoutOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-[var(--text-primary)]">
          <CaideIcon className="h-[18px] w-auto shrink-0" />
          <span className="font-semibold tracking-tight">Caide</span>
        </span>
      ),
      url: "/",
    },
    links: [
      { text: "Home", url: "/" },
      { text: "Changelog", url: "/changelog" },
      {
        type: "icon",
        text: "Follow on X",
        label: "Follow on X",
        icon: <SiX className="size-3.5" />,
        url: "https://x.com/caideorg",
      },
      {
        type: "icon",
        text: "GitHub",
        label: "GitHub",
        icon: <SiGithub className="size-4" />,
        url: "https://github.com/caideorg/caide",
      },
      {
        type: "custom",
        children: (
          <Link
            href="/install"
            className="inline-flex items-center rounded-full bg-[var(--btn-primary-bg)] px-3.5 py-1 text-[12px] font-medium text-[var(--btn-primary-fg)] shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Whitelist
          </Link>
        ),
      },
    ],
    themeSwitch: { enabled: false },
  };
}
