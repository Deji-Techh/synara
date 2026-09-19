import Image from "next/image";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { GITHUB_REPO_URL } from "@/lib/seo";
import { ThemeToggle } from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";

export default function Navbar() {
  return (
    <nav aria-label="Primary navigation" className="relative z-40 w-full px-4 py-4 sm:px-6">
      <div className="mx-auto flex h-9 max-w-6xl items-center justify-between gap-2 sm:gap-6">
        <Link
          href="/"
          aria-label="Caide home"
          className="flex shrink-0 items-center gap-2.5 text-[14px] font-semibold tracking-[-0.02em] text-stone-900 dark:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)] drop-shadow-sm"
        >
          <Image
            src="/icon.png"
            alt="Caide"
            width={24}
            height={24}
            className="rounded-[6px] border border-black/10 dark:border-white/15 shadow-sm"
          />
          <span className="font-semibold tracking-tight">Caide</span>
        </Link>

        {/* Center Nav Links */}
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 text-[13px] font-medium text-stone-800 dark:text-stone-200 sm:flex sm:gap-6">
          <a
            href="/#frameworks"
            className="shrink-0 transition-colors hover:text-stone-950 dark:hover:text-white drop-shadow-sm"
          >
            Frameworks
          </a>
          <a
            href="/#providers"
            className="shrink-0 transition-colors hover:text-stone-950 dark:hover:text-white drop-shadow-sm"
          >
            Models
          </a>
          <a
            href="/#workflow"
            className="shrink-0 transition-colors hover:text-stone-950 dark:hover:text-white drop-shadow-sm"
          >
            Workflow
          </a>
          <Link
            href="/docs"
            className="shrink-0 transition-colors hover:text-stone-950 dark:hover:text-white drop-shadow-sm"
          >
            Docs
          </Link>
          <Link
            href="/changelog"
            className="shrink-0 transition-colors hover:text-stone-950 dark:hover:text-white drop-shadow-sm"
          >
            Changelog
          </Link>
          <Link
            href="/sponsor"
            className="hidden shrink-0 transition-colors hover:text-stone-950 dark:hover:text-white drop-shadow-sm md:inline"
          >
            Sponsor
          </Link>
        </div>

        {/* Right CTA Actions */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex sm:gap-3">
          <ThemeToggle />
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Repository"
            className="flex items-center gap-1.5 text-[12.5px] font-medium text-stone-800 dark:text-stone-200 transition-colors hover:text-stone-950 dark:hover:text-white drop-shadow-sm sm:gap-1.5 sm:text-[13px]"
          >
            <FaGithub className="size-4 text-stone-900 dark:text-white" />
            <span>GitHub</span>
          </a>
          <Link
            href="/install"
            className="rounded-full border border-black/15 bg-white/80 dark:border-white/20 dark:bg-black/60 backdrop-blur-md px-3.5 py-1 text-[12.5px] font-medium text-stone-900 dark:text-white shadow-sm transition-colors hover:bg-white dark:hover:bg-black sm:text-[13px]"
          >
            Download
          </Link>
        </div>
        <MobileNav />
      </div>
    </nav>
  );
}
