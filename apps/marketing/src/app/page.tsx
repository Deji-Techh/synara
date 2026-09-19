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
import { ScrollReveal } from "@/components/ScrollReveal";
import { SiX } from "react-icons/si";
import { PRODUCT_HERO_DESCRIPTION, PRODUCT_HERO_TITLE } from "@/data/product";
import { FAQ_JSONLD, jsonLdScript } from "@/lib/seo";

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-[var(--page-bg)] text-[var(--text-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(FAQ_JSONLD) }}
      />

      {/* Classical Greek Temple Colonnade Backdrop (positioned at z-0, above page-bg, below content) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[760px] sm:h-[900px] lg:h-[1020px] overflow-hidden select-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-bg.jpg"
          alt=""
          className="h-full w-full object-cover object-[50%_30%] opacity-95"
        />
        {/* Soft top gradient to ensure navbar links have pristine contrast */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/40 via-black/10 to-transparent" />
        {/* Bottom smooth fade into page background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent via-55% to-[var(--page-bg)]" />
      </div>

      <Navbar />

      <main className="relative z-10">
        {/* HERO SECTION */}
        <section
          id="overview"
          aria-labelledby="homepage-title"
          className="hero-section scroll-mt-20 pt-6 pb-14 sm:pt-10 sm:pb-24"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            {/* AI Model & Framework Badges Pill Row with subtle glassmorphic blur */}
            <ScrollReveal delay={30}>
              <div className="mb-8 flex flex-wrap items-center gap-2 sm:mb-10">
                <ProviderMarkRow theme="dark" />
              </div>

              {/* Main Headline */}
              <h1
                id="homepage-title"
                className="max-w-4xl text-[1.75rem] font-medium leading-[1.1] tracking-[-0.035em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)] sm:text-[2.75rem] sm:leading-[1.06]"
              >
                {PRODUCT_HERO_TITLE}
              </h1>

              {/* Subtitle with Calibrated Contrast */}
              <p className="mt-5 max-w-2xl text-[14.5px] leading-[1.65] text-blue-100/90 drop-shadow-sm sm:text-[16px]">
                {PRODUCT_HERO_DESCRIPTION}
              </p>

              {/* Action Buttons: Download + Follow on X */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <DownloadButton className="bg-white text-slate-900 hover:bg-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.25)]" />
                <a
                  href="https://x.com/orgcaide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-[13px] font-medium text-white backdrop-blur-md transition-all hover:bg-white/20 hover:border-white/40 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
                >
                  <SiX className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Follow on X</span>
                </a>
              </div>

              {/* Trust Pill */}
              <div className="mt-4 flex items-center gap-2 text-[12px] font-medium text-blue-100/85">
                <span>100% Free & Open Source • Bring Your Own Keys • Local-First Architecture</span>
              </div>
            </ScrollReveal>

            {/* Hero Studio Preview Card Framed by the Greek Temple Backdrop */}
            <ScrollReveal delay={120}>
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
            </ScrollReveal>
          </div>
        </section>

        {/* 01: IMMUTABLE FRAMEWORKS & MODEL HUB */}
        <Features />

        {/* 02: AUTONOMOUS TURN LOOP WORKFLOW */}
        <Workflow />

        {/* 03: MULTI-PROJECT SHOWCASE */}
        <MultiProjectShowcase />

        {/* 04: PRIVACY & LOCAL-FIRST BOUNDARY */}
        <div id="privacy" className="scroll-mt-20">
          <PrivacySection />
        </div>

        {/* 05: INTERACTIVE ASK AI */}
        <AskAISection />

        {/* 06: PRODUCT FAQ */}
        <FAQ />

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
