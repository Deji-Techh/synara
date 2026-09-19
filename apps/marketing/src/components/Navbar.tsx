import Image from "next/image";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { GITHUB_REPO_URL } from "@/lib/seo";
import MobileNav from "@/components/MobileNav";

export default function Navbar() {
  return (
    <nav aria-label="Primary navigation" className="relative z-40 w-full px-4 py-4 sm:px-6">
      <div className="mx-auto flex h-9 max-w-6xl items-center justify-between gap-2 sm:gap-6">
        <Link
          href="/"
          aria-label="Caide home"
          className="flex shrink-0 items-center gap-2.5 text-[14px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
        >
          <Image
            src="/icon.png"
            alt="Caide"
            width={24}
            height={24}
            className="rounded-[6px] border border-[var(--divide)] shadow-sm"
          />
          <span className="font-semibold tracking-tight">Caide</span>
        </Link>

        {/* Center Nav Links */}
        <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 text-[13px] font-medium text-[var(--text-secondary)] sm:flex sm:gap-6">
          <a
            href="/#frameworks"
            className="shrink-0 transition-colors hover:text-[var(--text-primary)]"
          >
            Frameworks
          </a>
          <a
            href="/#providers"
            className="shrink-0 transition-colors hover:text-[var(--text-primary)]"
          >
            Models
          </a>
          <a
            href="/#workflow"
            className="shrink-0 transition-colors hover:text-[var(--text-primary)]"
          >
            Workflow
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

        {/* Right CTA Actions */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex sm:gap-3">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Repository"
            className="flex items-center gap-1.5 rounded-full border border-[var(--divide)] bg-white/70 px-3.5 py-1 text-[12.5px] font-medium text-[var(--text-secondary)] backdrop-blur-md transition-all hover:bg-white hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)] sm:gap-1.5 sm:text-[13px]"
          >
            <FaGithub className="size-4 text-[var(--text-primary)]" />
            <span>GitHub</span>
          </a>
          <Link
            href="/install"
            className="rounded-full bg-[var(--btn-primary-bg)] px-4 py-1 text-[12.5px] font-medium text-[var(--btn-primary-fg)] shadow-sm transition-all hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)] sm:text-[13px]"
          >
            Download
          </Link>
        </div>
        <MobileNav />
      </div>
    </nav>
  );
}
