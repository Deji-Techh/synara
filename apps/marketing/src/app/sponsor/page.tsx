import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { Heart, Sparkles } from "lucide-react";
import { GITHUB_SPONSORS_URL } from "@/lib/seo";

export default function SponsorPage() {
  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16 text-center">
        <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-pink-600">
          <Heart className="size-4 fill-current" />
          <span>Support Open Source</span>
        </div>
        <h1 className="mt-3 text-[2rem] font-medium tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2.5rem]">
          Back Caide Development
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-[var(--text-secondary)] sm:text-[15px]">
          Caide is 100% free and open source. We refuse Pro tiers, subscriptions, and token markups. Sponsorships directly fund ongoing development, toolchain integrations, and open-source models.
        </p>

        <div className="mt-10">
          <a
            href={GITHUB_SPONSORS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-pink-700"
          >
            <Heart className="size-4 fill-current" />
            <span>Sponsor on GitHub</span>
          </a>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
