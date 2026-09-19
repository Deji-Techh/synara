import Link from "next/link";
import DownloadButton from "@/components/DownloadButton";
import { FaGithub } from "react-icons/fa";
import { GITHUB_REPO_URL } from "@/lib/seo";

export default function ClosingCTA() {
  return (
    <section id="download" className="scroll-mt-20 border-t border-[var(--divide)] py-20 sm:py-28">
      <div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-[2rem] font-medium leading-[1.1] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2.75rem]">
          Build your next production app with Caide today.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--text-secondary)] sm:text-[16px]">
          100% Free and open source. Bring your own keys. Choose your framework and ship without losing context.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <DownloadButton />
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--divide)] px-5 py-2.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
          >
            <FaGithub className="size-4 shrink-0" />
            Star on GitHub
          </a>
        </div>

        <div className="mt-6 font-mono text-[12px] text-[var(--text-tertiary)]">
          <span>Or install via terminal: </span>
          <code className="rounded bg-[var(--mock-row-strong)] px-2 py-1 text-[var(--text-primary)]">
            curl -fsSL https://caide.dev/install.sh | bash
          </code>
        </div>
      </div>
    </section>
  );
}
