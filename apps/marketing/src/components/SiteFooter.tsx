import Link from "next/link";
import { GITHUB_REPO_URL } from "@/lib/seo";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--divide)] py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 text-[12px] text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-4 items-center justify-center rounded bg-orange-600 text-[10px] font-bold text-white">
            C
          </div>
          <span>
            Caide — 100% Free, Local-First AI App Builder
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <Link
            href="/docs"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Docs
          </Link>
          <Link
            href="/changelog"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Changelog
          </Link>
          <Link
            href="/install"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Download
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            GitHub
          </a>
          <Link
            href="/sponsor"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Sponsor
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
