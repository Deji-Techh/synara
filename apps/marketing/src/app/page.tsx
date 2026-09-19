import Link from "next/link";
import Navbar from "@/components/Navbar";
import DownloadButton from "@/components/DownloadButton";
import Features from "@/components/Features";
import Workflow from "@/components/Workflow";
import FAQ from "@/components/FAQ";
import AskAISection from "@/components/AskAISection";
import Testimonials from "@/components/Testimonials";
import ClosingCTA from "@/components/ClosingCTA";
import SiteFooter from "@/components/SiteFooter";
import HomepageRail from "@/components/HomepageRail";
import { ScreenshotPlaceholder } from "@/components/ScreenshotPlaceholder";
import {
  ClaudeIcon,
  OpenAIIcon,
  DeepSeekIcon,
  GeminiIcon,
  GroqIcon,
  OllamaIcon,
  OpencodeIcon,
  ExpoIcon,
  FlutterIcon,
  NextjsIcon,
} from "@/components/BrandIcons";
import { PRODUCT_HERO_DESCRIPTION, PRODUCT_HERO_TITLE } from "@/data/product";
import { FAQ_JSONLD, GITHUB_REPO_URL, jsonLdScript } from "@/lib/seo";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--page-bg)] text-[var(--text-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(FAQ_JSONLD) }}
      />
      <Navbar />

      <main>
        {/* HERO SECTION WITH DESERT SUNSET BACKDROP */}
        <section
          id="overview"
          aria-labelledby="homepage-title"
          className="hero-section relative isolate scroll-mt-20 pt-8 pb-16 sm:pt-14 sm:pb-24"
        >
          {/* Desert Sunset Backdrop with smooth page blend */}
          <div
            aria-hidden="true"
            className="page-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 aspect-video min-h-[720px] overflow-hidden sm:min-h-[780px]"
          >
            <img
              src="/hero-bg.jpg"
              alt=""
              className="h-full w-full object-cover object-[50%_35%]"
            />
            <div className="page-backdrop-fade absolute inset-0" />
          </div>

          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            {/* Supported AI Model Badges Pill Row */}
            <div className="mb-6 flex flex-wrap items-center gap-2 sm:mb-8">
              <div
                title="Anthropic Claude 3.7 & 3.5 Sonnet"
                className="inline-flex size-[38px] -rotate-[5deg] items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
              >
                <ClaudeIcon className="size-[18px] text-[#D97757]" />
              </div>
              <div
                title="OpenAI GPT-4o & o3-mini"
                className="inline-flex size-[38px] rotate-[4deg] items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
              >
                <OpenAIIcon className="size-[18px] text-[var(--text-primary)]" />
              </div>
              <div
                title="DeepSeek R1 & V3"
                className="inline-flex size-[38px] -rotate-[3deg] items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
              >
                <DeepSeekIcon className="size-[18px] text-blue-500" />
              </div>
              <div
                title="Google Gemini 2.5 Pro & Flash"
                className="inline-flex size-[38px] rotate-[3deg] items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
              >
                <GeminiIcon className="size-[18px] text-amber-500" />
              </div>
              <div
                title="Groq Fast Inference"
                className="inline-flex size-[38px] -rotate-[4deg] items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
              >
                <GroqIcon className="size-[18px] text-orange-500" />
              </div>
              <div
                title="Ollama Offline Local Models"
                className="inline-flex size-[38px] rotate-[5deg] items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
              >
                <OllamaIcon className="size-[18px] text-[var(--text-primary)]" />
              </div>
              <div
                title="OpenCode Zen Free Models"
                className="inline-flex size-[38px] -rotate-[2deg] items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
              >
                <OpencodeIcon className="size-[18px] text-[var(--text-primary)]" />
              </div>
            </div>

            {/* Title & Subtitle */}
            <h1
              id="homepage-title"
              className="max-w-4xl text-[2rem] font-medium leading-[1.08] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[3rem]"
            >
              {PRODUCT_HERO_TITLE}
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-[1.65] text-[var(--text-secondary)] sm:text-[16px]">
              {PRODUCT_HERO_DESCRIPTION}
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DownloadButton />
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--divide)] px-5 py-2.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
              >
                Star on GitHub
              </a>
            </div>

            {/* Trust Pill */}
            <div className="mt-4 flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]">
              <span className="inline-block size-2 rounded-full bg-emerald-500" />
              <span>100% Free & Open Source • Bring Your Own Key • Zero SaaS Markup</span>
            </div>

            {/* Hero App Preview Card with Screenshot Placeholder */}
            <div className="relative mt-12 sm:mt-16" data-hero-preview>
              <div className="relative isolate overflow-hidden rounded-2xl p-2 sm:p-4 shadow-2xl ring-1 ring-black/10 dark:ring-white/10">
                <div aria-hidden className="shot-card-bg absolute inset-0 -z-10" />
                <ScreenshotPlaceholder
                  badge="HERO APP WORKSPACE"
                  title="Caide Unified Studio: React Native Expo Project"
                  description="Complete window capture of Caide in action: Left sidebar showing project threads with active framework badge; center chat transcript showing streaming turn deltas with an App Blueprint review card; right dock displaying the live Metro dev-server preview in an iPhone 16 Pro device frame."
                  checklist={[
                    "Left Sidebar with project threads & React Native framework badge",
                    "Center transcript showing agent turn and interactive App Blueprint card",
                    "Right Dock with DeviceLab iPhone preview rendering app UI live",
                    "Bottom console showing hot reload status on port 8081",
                  ]}
                  specs="3200 × 2000 (16:10) • 2x Retina • Dark & Light Variants"
                  targetPath="/public/screenshots/hero-app-workspace.png"
                  aspectRatio="aspect-[16/10]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES & FRAMEWORKS */}
        <Features />

        {/* WORKFLOW */}
        <Workflow />

        {/* INTERACTIVE ASK AI */}
        <AskAISection />

        {/* FAQ */}
        <FAQ />

        {/* TESTIMONIALS */}
        <Testimonials />

        {/* CLOSING CTA */}
        <ClosingCTA />
      </main>

      <SiteFooter />
      <HomepageRail />
    </div>
  );
}
