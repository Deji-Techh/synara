import { SplitShowcase } from "@/components/SplitShowcase";
import { ScreenshotPlaceholder } from "@/components/ScreenshotPlaceholder";
import { ScrollReveal } from "@/components/ScrollReveal";

const heading =
  "text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]";
const body = "mt-5 max-w-2xl text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:text-[16px]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export default function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-24 border-t border-[var(--divide)] py-14 sm:py-20">
      <div className={container}>
        <ScrollReveal>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
            02 / Autonomous Turn Loop
          </p>
          <h2 className={`${heading} mt-3`}>
            Keep architecture, execution, and verification in the same loop.
          </h2>
          <p className={body}>
            Building real software requires more than a raw chat box. Caide organizes each turn into
            explicit architectural alignment, transparent execution gates, instant database
            branching, and live multi-device preview.
          </p>
        </ScrollReveal>

        {/* 01: BLUEPRINTS & SURVEYS */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="03 / Architecture Alignment"
            title="Review blueprints and surveys before code touches disk"
            description="Before writing complex features or refactoring modules, Caide presents an interactive App Blueprint detailing screens, state models, and route structures. A 3-question survey aligns on technical tradeoffs early."
            reverse={false}
            prominentMedia
          >
            <ScreenshotPlaceholder
              badge="APP BLUEPRINT & SURVEY"
              title="Interactive Architecture Blueprint & Survey Prompt"
              description="Shows an active chat turn in Caide where the agent presents an interactive App Blueprint card with expandable route structure alongside a 3-question design survey."
              checklist={[
                "Expandable App Blueprint card with tabs",
                "Interactive 3-question architecture survey",
                "Streaming turn indicator with model badge",
                "File tree impact projection before changes",
              ]}
              specs="3200 × 2000 • 2x Retina"
              targetPath="/public/screenshots/blueprint-survey.png"
              aspectRatio="aspect-[16/10]"
            />
          </SplitShowcase>
        </ScrollReveal>

        {/* 02: LIVELAB & DEVICELAB */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="04 / DeviceLab & Live Preview"
            title="Multi-device live preview with hot reloading"
            description="Test your running application across iPhone 16 Pro, Android, Tablet, and Desktop frames. Inspect problems diagnostics, view live console logs, and scan the mobile QR code to test immediately on your physical phone."
            reverse
            prominentMedia
          >
            <ScreenshotPlaceholder
              badge="LIVELAB & DEVICELAB"
              title="DeviceLab: iPhone 16 Frame & Live Console"
              description="Shows Caide Right Dock running DeviceLab with an interactive iPhone frame displaying the React Native app, mobile QR code badge, live hot-reload console logs, and visual inspection mode."
              checklist={[
                "iPhone frame with realistic bezel & scaling",
                "Active Metro dev server log stream on port 8081",
                "Mobile QR code badge for physical device testing",
                "Problems / diagnostics tab with zero syntax errors",
              ]}
              specs="3200 × 2000 • 2x Retina"
              targetPath="/public/screenshots/devicelab-preview.png"
              aspectRatio="aspect-[16/10]"
            />
          </SplitShowcase>
        </ScrollReveal>

        {/* 03: DATABASE BRANCHING */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="05 / Database Branching"
            title="Neon instant branching & Supabase lifecycle"
            description="Connect Supabase or Neon serverless Postgres. Caide automatically provisions an isolated, copy-on-write database branch for each feature thread, allowing the agent to test schema migrations safely without touching staging."
            reverse={false}
          >
            <ScreenshotPlaceholder
              badge="DATABASE BRANCHING"
              title="Neon Serverless Postgres: Feature Branching"
              description="Shows Caide Database panel with an active Neon connection, schema migration diffs, and an isolated copy-on-write feature branch spun up for the current thread."
              checklist={[
                "Neon project connection with active branch name",
                "Schema migration timeline with SQL previews",
                "Copy-on-write branch indicator with 1-click restore",
                "Supabase Auth and storage status indicators",
              ]}
              specs="3200 × 2000 • 2x Retina"
              targetPath="/public/screenshots/database-branching.png"
              aspectRatio="aspect-[16/10]"
            />
          </SplitShowcase>
        </ScrollReveal>

        {/* 04: TOOL CONSENT & SAFETY */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="06 / Tool Consent & Safety"
            title="Explicit approvals with protected shell execution"
            description="Never worry about unexpected terminal commands or file wipes. Caide features granular tool approvals, shell command blocklists, and immediate checkpoints so you can review and rollback any step."
            reverse
          >
            <ScreenshotPlaceholder
              badge="TOOL CONSENT GATES"
              title="Explicit Tool Approval Gate & Terminal Safety"
              description="Shows the Caide approval card when the agent requests to run a shell command. Displays the exact bash command, safety risk audit, working directory, and Approve / Reject buttons."
              checklist={[
                "Pending tool approval card in chat stream",
                "Highlighted command line with safety audit badge",
                "File diff inspection preview before committing",
                "Checkpoint rollback button in top navigation",
              ]}
              specs="3200 × 2000 • 2x Retina"
              targetPath="/public/screenshots/tool-consent-safety.png"
              aspectRatio="aspect-[16/10]"
            />
          </SplitShowcase>
        </ScrollReveal>

        {/* 05: PUBLISH & NATIVE BUILDS */}
        <ScrollReveal delay={100}>
          <SplitShowcase
            kicker="07 / 1-Click Deploy & Native Builds"
            title="Ship to Vercel and export native mobile binaries"
            description="Publish web projects directly to Vercel with automatic Neon database synchronization. For mobile apps, trigger native builds (APK, AAB, IPA) or export standard CAIDEPKG packages directly from the UI."
            reverse={false}
            prominentMedia
          >
            <ScreenshotPlaceholder
              badge="PUBLISH & NATIVE BUILDS"
              title="Publish Panel: 1-Click Vercel & Mobile Export"
              description="Shows Caide Publish dialog with one-click Vercel deployment synced with Neon Postgres, GitHub repo push status, and native APK/AAB/IPA export action buttons."
              checklist={[
                "Vercel deployment status with live URL preview",
                "Neon database branch synchronization toggle",
                "GitHub commit and push history",
                "Native mobile build options (APK / AAB / IPA)",
              ]}
              specs="3200 × 2000 • 2x Retina"
              targetPath="/public/screenshots/publish-deploy.png"
              aspectRatio="aspect-[16/10]"
            />
          </SplitShowcase>
        </ScrollReveal>
      </div>
    </section>
  );
}
