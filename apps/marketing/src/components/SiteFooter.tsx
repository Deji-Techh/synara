import Link from "next/link";
import { SiX } from "react-icons/si";
import { CaideIcon } from "@/components/BrandIcons";

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--divide)] py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 text-[12px] text-[var(--text-tertiary)] sm:flex-row sm:items-center sm:justify-between sm:gap-0 sm:px-6">
        <div className="flex items-center gap-2">
          <CaideIcon className="h-4 w-auto text-[var(--text-primary)]" />
          <span className="font-medium text-[var(--text-secondary)]">Caide</span>
          <span>· Free & Open Source Local-First AI App Builder</span>
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
          <a
            href="https://x.com/orgcaide"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
          >
            <SiX className="size-3" />
            <span>@orgcaide</span>
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
