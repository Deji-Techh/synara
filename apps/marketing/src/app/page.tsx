import Navbar from "@/components/Navbar";
import DownloadButton from "@/components/DownloadButton";
import Features from "@/components/Features";
import Workflow from "@/components/Workflow";
import { MultiProjectShowcase } from "@/components/MultiProjectShowcase";
import PrivacySection from "@/components/PrivacySection";
import FAQ from "@/components/FAQ";
import AskAISection from "@/components/AskAISection";
import Testimonials from "@/components/Testimonials";
import ClosingCTA from "@/components/ClosingCTA";
import SiteFooter from "@/components/SiteFooter";
import HomepageRail from "@/components/HomepageRail";
import ProviderMarkRow from "@/components/ProviderMarkRow";
import { ScreenshotPlaceholder } from "@/components/ScreenshotPlaceholder";
import { FaGithub } from "react-icons/fa";
import { PRODUCT_HERO_DESCRIPTION, PRODUCT_HERO_TITLE } from "@/data/product";
import { FAQ_JSONLD, GITHUB_REPO_URL, jsonLdScript } from "@/lib/seo";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--page-bg)] text-[var(--text-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(FAQ_JSONLD) }}
      />

      {/* TOP HEADER & HERO AREA WITH MODE-SPECIFIC IMAGERY (Light: Alpine Valley, Dark: Desert Sunset) */}
      <div className="top-header-hero relative isolate">
        <div aria-hidden="true" className="top-header-fade" />
        <Navbar />

        <section
          id="overview"
          aria-labelledby="homepage-title"
          className="hero-section relative z-10 scroll-mt-20 pt-6 pb-16 sm:pt-10 sm:pb-28"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            {/* AI Model & Framework Badges Pill Row */}
            <div className="mb-8 flex flex-wrap items-center gap-2 sm:mb-10">
              <ProviderMarkRow />
            </div>

            {/* Main Headline */}
            <h1
              id="homepage-title"
              className="max-w-4xl text-[1.75rem] font-medium leading-[1.1] tracking-[-0.035em] text-stone-950 sm:text-[2.75rem] sm:leading-[1.06] dark:text-stone-100 drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]"
            >
              {PRODUCT_HERO_TITLE}
            </h1>

            {/* Subtitle with Calibrated Contrast */}
            <p
              className="mt-5 max-w-2xl text-[14.5px] leading-[1.65] text-stone-800 sm:text-[16px] dark:text-stone-300 drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)] dark:drop-shadow-[0_1px_5px_rgba(0,0,0,0.75)]"
            >
              {PRODUCT_HERO_DESCRIPTION}
            </p>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DownloadButton />
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white/80 px-5 py-2.5 text-[13px] font-medium text-stone-900 backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)] dark:border-white/15 dark:bg-black/60 dark:text-white dark:hover:bg-black"
              >
                <FaGithub className="size-4 shrink-0" aria-hidden="true" />
                <span>Star on GitHub</span>
              </a>
            </div>

            {/* Trust Pill */}
            <div className="mt-4 flex items-center gap-2 text-[12px] font-medium text-stone-800 dark:text-stone-300 drop-shadow-sm">
              <span className="inline-block size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
              <span>100% Free & Open Source • Bring Your Own Keys • Local-First Architecture</span>
            </div>

            {/* Hero Studio Preview Card Framed by the Hero Backdrop */}
            <div className="relative mt-10 sm:mt-14" data-hero-preview>
              <div className="relative isolate flex flex-col items-center justify-center overflow-hidden rounded-2xl p-2 sm:p-4 lg:p-6 bg-black/[0.04] dark:bg-white/[0.04] backdrop-blur-md ring-1 ring-black/10 dark:ring-white/15 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.3)] dark:shadow-[0_30px_90px_-20px_rgba(0,0,0,0.8)]">
                <div className="w-full sm:w-[92%] lg:w-[86%]">
                  <ScreenshotPlaceholder
                    badge="HERO APP WORKSPACE"
                    title="Caide Unified Studio: React Native Expo Project"
                    description="Complete desktop workspace capture: Left sidebar with active Expo project threads; center turn stream with App Blueprint review card and survey gate; right dock with live Metro dev server rendering in an iPhone 16 Pro device frame."
                    checklist={[
                      "Left Sidebar with project threads & Expo badge",
                      "Center chat with streaming turn and App Blueprint card",
                      "Right Dock with DeviceLab iPhone preview rendering app UI live",
                      "Bottom console status showing hot reload on port 8081",
                    ]}
                    specs="3200 × 2000 (16:10) • 2x Retina"
                    targetPath="/public/screenshots/hero-app-workspace.png"
                    aspectRatio="aspect-[16/10]"
                    windowTitle="caide — expo-react-native-workspace"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <main>
        {/* 01: IMMUTABLE FRAMEWORKS & MODEL HUB */}
        <div id="frameworks" className="scroll-mt-20">
          <Features />
        </div>

        {/* 02: AUTONOMOUS TURN LOOP WORKFLOW */}
        <div id="workflow" className="scroll-mt-20">
          <Workflow />
        </div>

        {/* 03: MULTI-PROJECT SHOWCASE */}
        <MultiProjectShowcase />

        {/* 04: PRIVACY & LOCAL-FIRST BOUNDARY */}
        <div id="privacy" className="scroll-mt-20">
          <PrivacySection />
        </div>

        {/* 05: INTERACTIVE ASK AI */}
        <AskAISection />

        {/* 06: PRODUCT FAQ */}
        <div id="faq" className="scroll-mt-20">
          <FAQ />
        </div>

        {/* 07: TESTIMONIALS */}
        <Testimonials />

        {/* 08: CLOSING CTA */}
        <div id="download" className="scroll-mt-20">
          <ClosingCTA />
        </div>
      </main>

      <SiteFooter />
      <HomepageRail />
    </div>
  );
}
