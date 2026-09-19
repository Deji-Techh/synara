import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { CHANGELOG_ENTRIES } from "@/data/changelog";
import { Tag, Check } from "lucide-react";

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
            Release History
          </p>
          <h1 className="mt-3 text-[2rem] font-medium tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2.5rem]">
            Caide Changelog
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-[var(--text-secondary)] sm:text-[15px]">
            Explore new features, toolchain integrations, preview improvements, and performance
            upgrades.
          </p>
        </div>

        <div className="mt-14 space-y-12">
          {CHANGELOG_ENTRIES.map((entry) => (
            <article
              key={entry.version}
              className="rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 sm:p-8 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--divide)] pb-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 font-mono text-[12px] font-bold text-sky-600">
                    <Tag className="size-3.5" />v{entry.version}
                  </span>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    {entry.title}
                  </h2>
                </div>
                <time className="font-mono text-[12px] text-[var(--text-tertiary)]">
                  {entry.date}
                </time>
              </div>

              <p className="mt-4 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                {entry.description}
              </p>

              <div className="mt-6">
                <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Key Highlights
                </h3>
                <ul className="mt-3 space-y-2 text-[13.5px] text-[var(--text-primary)]">
                  {entry.highlights.map((h, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-sky-600" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
