import Image from "next/image";
import Link from "next/link";
import { GITHUB_REPO_URL } from "@/lib/seo";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--divide)] py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 text-[12px] text-[var(--text-tertiary)] sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:px-6">
        <div className="flex items-center gap-2">
          <Image
            src="/icon.png"
            alt="Caide"
            width={18}
            height={18}
            className="rounded-[4px] border border-[var(--divide)]"
          />
          <span>
            Caide · Free & Open Source Local-First AI App Builder
          </span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href="/docs"
            className="transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
          >
            Docs
          </Link>
          <Link
            href="/changelog"
            className="transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
          >
            Changelog
          </Link>
          <Link
            href="/sponsor"
            className="transition-colors hover:text-[var(--text-primary)]"
          >
            Sponsor
          </Link>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
          >
            GitHub
          </a>
          <Link
            href="/privacy"
            className="transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
          >
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
