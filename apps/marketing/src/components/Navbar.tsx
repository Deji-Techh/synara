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
          className="flex shrink-0 items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
        >
          <div className="flex size-[26px] items-center justify-center rounded-md bg-gradient-to-tr from-amber-600 to-orange-500 font-bold text-white shadow-sm">
            C
          </div>
          <span className="font-bold tracking-tight">Caide</span>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-4 text-[13px] text-[var(--text-secondary)] sm:flex sm:gap-7">
          <a
            href="/#frameworks"
            className="shrink-0 transition-colors hover:text-[var(--text-primary)]"
          >
            Frameworks
          </a>
          <a
            href="/#features"
            className="shrink-0 transition-colors hover:text-[var(--text-primary)]"
          >
            Features
          </a>
          <Link
            href="/docs"
            className="shrink-0 transition-colors hover:text-[var(--text-primary)]"
          >
            Docs
          </Link>
          <Link
            href="/changelog"
            className="shrink-0 transition-colors hover:text-[var(--text-primary)]"
          >
            Changelog
          </Link>
          <Link
            href="/sponsor"
            className="hidden shrink-0 transition-colors hover:text-[var(--text-primary)] md:inline"
          >
            Sponsor
          </Link>
        </div>

        <div className="hidden shrink-0 items-center gap-2 sm:flex sm:gap-3">
          <ThemeToggle />
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Repository"
            className="flex items-center gap-1.5 rounded-full border border-[var(--divide)] px-3.5 py-1 text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--mock-row)] hover:text-[var(--text-primary)]"
          >
            <FaGithub className="size-3.5 text-[var(--text-primary)]" />
            <span>GitHub</span>
          </a>
          <Link
            href="/install"
            className="rounded-full bg-[var(--btn-primary-bg)] px-4 py-1.5 text-[12.5px] font-medium text-[var(--btn-primary-fg)] shadow-sm transition-opacity hover:opacity-90"
          >
            Download
          </Link>
        </div>
        <MobileNav />
      </div>
    </nav>
  );
}
