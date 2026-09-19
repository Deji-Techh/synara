import { SplitShowcase } from "@/components/SplitShowcase";
import { ScrollReveal } from "@/components/ScrollReveal";
import { BlueprintSurveyMockup } from "@/components/showcase/BlueprintSurveyMockup";
import { DatabaseBranchingMockup } from "@/components/showcase/DatabaseBranchingMockup";
import { ToolConsentMockup } from "@/components/showcase/ToolConsentMockup";
import { PublishDeployMockup } from "@/components/showcase/PublishDeployMockup";

const heading =
  "text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]";
const body = "mt-5 max-w-2xl text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:text-[16px]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export default function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-24 border-t border-[var(--divide)] py-14 sm:py-20">
      <div className={container}>
        <ScrollReveal>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent-link)]">
            02 / Autonomous Turn Loop
          </p>
          <h2 className={`${heading} mt-3`}>
            Keep architecture, execution, and verification in the same loop.
          </h2>
          <p className={body}>
            Building real software requires more than a raw chat box. Caide organizes each turn into
            explicit architectural alignment, transparent tool consent gates, instant serverless
            database branching, and live multi-device preview.
          </p>
        </ScrollReveal>

        {/* 01: ARCHITECTURE ALIGNMENT */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="02 / Architecture Alignment"
            title="Review blueprints and surveys before code touches disk"
            description="Before writing complex features or refactoring modules, Caide presents an interactive App Blueprint detailing screens, state models, and route structures. A quick survey aligns on technical tradeoffs early."
            reverse={false}
          >
            <BlueprintSurveyMockup />
          </SplitShowcase>
        </ScrollReveal>

        {/* 02: LIVELAB & DEVICELAB */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="03 / DeviceLab & Live Preview"
            title="Multi-device live preview with hot reloading"
            description="Test your running application across iPhone 16 Pro, Android, Tablet, and Desktop frames. Inspect problems diagnostics, view live console logs, and scan the mobile QR code to test immediately on your physical phone."
            reverse
            prominentMedia
          >
            <div className="overflow-hidden rounded-xl ring-1 ring-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] max-h-[350px] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/screenshots/caide-devicelab-preview.png"
                alt="Caide DeviceLab: Interactive mobile simulator preview with idle diagnostics"
                className="block h-auto w-full object-cover"
                width={748}
                height={1116}
              />
            </div>
          </SplitShowcase>
        </ScrollReveal>

        {/* 03: DATABASE BRANCHING */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="04 / Database Branching"
            title="Neon instant branching & Supabase lifecycle"
            description="Connect Supabase or Neon serverless Postgres. Caide automatically provisions an isolated, copy-on-write database branch for each feature thread, allowing the agent to test schema migrations safely without touching staging."
            reverse={false}
          >
            <DatabaseBranchingMockup />
          </SplitShowcase>
        </ScrollReveal>

        {/* 04: TOOL CONSENT & SAFETY */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="05 / Tool Consent & Safety"
            title="Explicit approvals with protected shell execution"
            description="Never worry about unexpected terminal commands or file wipes. Caide features granular tool approvals, shell command blocklists, and immediate checkpoints so you can review and rollback any step."
            reverse
          >
            <ToolConsentMockup />
          </SplitShowcase>
        </ScrollReveal>

        {/* 05: PUBLISH & NATIVE BUILDS */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="06 / 1-Click Deploy & Native Builds"
            title="Ship to Vercel and export native mobile binaries"
            description="Publish web projects directly to Vercel with automatic Neon database synchronization. For mobile apps, trigger native builds (APK, AAB, IPA) or export standard CAIDEPKG packages directly from the UI."
            reverse={false}
          >
            <PublishDeployMockup />
          </SplitShowcase>
        </ScrollReveal>
      </div>
    </section>
  );
}
