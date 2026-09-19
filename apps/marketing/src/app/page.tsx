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

      {/* Serene Ethereal Lake & Tree Backdrop at the top */}
      <div
        aria-hidden="true"
        className="page-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 aspect-video min-h-[700px] overflow-hidden sm:min-h-[780px]"
      >
        <img
          src="/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover object-[50%_35%]"
        />
        <div className="page-backdrop-fade absolute inset-0" />
      </div>

      <Navbar />

      <main>
        {/* HERO SECTION */}
        <section
          id="overview"
          aria-labelledby="homepage-title"
          className="hero-section scroll-mt-20 pt-6 pb-14 sm:pt-10 sm:pb-24"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            {/* AI Model & Framework Badges Pill Row with subtle glassmorphic blur and gentle tilt */}
            <div className="mb-8 flex flex-wrap items-center gap-2 sm:mb-10">
              <ProviderMarkRow />
            </div>

            {/* Main Headline */}
            <h1
              id="homepage-title"
              className="max-w-4xl text-[1.75rem] font-medium leading-[1.1] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2.75rem] sm:leading-[1.06]"
            >
              {PRODUCT_HERO_TITLE}
            </h1>

            {/* Subtitle with Calibrated Blue-Slate Contrast */}
            <p
              className="mt-5 max-w-2xl text-[14.5px] leading-[1.65] text-[var(--text-secondary)] sm:text-[16px]"
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
                className="inline-flex items-center gap-2 rounded-full border border-[var(--divide)] bg-white/70 px-5 py-2.5 text-[13px] font-medium text-[var(--text-primary)] backdrop-blur-md transition-all hover:bg-white hover:border-[var(--border-strong)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
              >
                <FaGithub className="size-4 shrink-0" aria-hidden="true" />
                <span>Star on GitHub</span>
              </a>
            </div>

            {/* Trust Pill */}
            <div className="mt-4 flex items-center gap-2 text-[12px] font-medium text-[var(--text-tertiary)]">
              <span className="inline-block size-2 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.7)]" />
              <span>100% Free & Open Source • Bring Your Own Keys • Local-First Architecture</span>
            </div>

            {/* Hero Studio Preview Card Framed with Lake Backdrop */}
            <div className="relative mt-10 sm:mt-14" data-hero-preview>
              <div className="relative isolate flex flex-col items-center justify-center overflow-hidden rounded-2xl p-3 sm:p-6 lg:p-8 ring-1 ring-black/[0.08] shadow-[0_25px_70px_-15px_rgba(15,23,42,0.18)]">
                <div aria-hidden className="shot-card-bg absolute inset-0 -z-10" />
                <div className="w-full sm:w-[90%] lg:w-[84%]">
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
