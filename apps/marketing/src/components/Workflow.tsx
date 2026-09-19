import { SplitShowcase } from "@/components/SplitShowcase";
import { ScreenshotPlaceholder } from "@/components/ScreenshotPlaceholder";

export default function Workflow() {
  return (
    <section id="workflow" className="scroll-mt-20 border-t border-[var(--divide)] py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
          02 / Autonomous Turn Loop
        </p>
        <h2 className="mt-3 text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]">
          From blueprint to live preview in a single focused workspace.
        </h2>
        <p className="mt-4 max-w-2xl text-[14px] leading-[1.7] text-[var(--text-secondary)] sm:text-[15px]">
          Caide's native Dyad x Caide turn loop combines architectural alignment, transparent execution gates, instant database branching, and multi-device preview.
        </p>

        <SplitShowcase
          kicker="01 / App Blueprints & Surveys"
          title="Review architecture before code generation"
          description="Before writing complex features, Caide drafts an interactive App Blueprint detailing screens, state models, and routes. A 3-question survey aligns on technical tradeoffs before code touches disk."
          stacked
          prominentMedia
        >
          <ScreenshotPlaceholder
            badge="APP BLUEPRINTS"
            title="Interactive App Blueprint & Architecture Survey"
            description="Shows an active chat turn in Caide where the agent presents an App Blueprint card with expandable route structure and state diagrams, alongside a 3-question choice prompt."
            checklist={[
              "App Blueprint interactive card with expandable tabs",
              "3-Question architecture alignment choice buttons",
              "Streaming token indicator and model badge",
              "File tree projection before changes are written",
            ]}
            specs="3200 × 2000 • 2x Retina"
            targetPath="/public/screenshots/blueprint-survey.png"
          />
        </SplitShowcase>

        <SplitShowcase
          kicker="02 / LiveLab & DeviceLab"
          title="Multi-device live preview with hot reloading"
          description="Test your running application across iPhone, Android, Tablet, and Desktop frames. Watch live console logs, inspect problems, and scan the mobile QR code to test immediately on your physical phone."
          reverse
        >
          <ScreenshotPlaceholder
            badge="LIVELAB & DEVICELAB"
            title="DeviceLab: Mobile Framing & Console Logs"
            description="Shows Caide's Right Dock running DeviceLab with an interactive iPhone frame displaying the React Native app, mobile QR code badge, live hot-reload console logs, and visual inspection mode."
            checklist={[
              "iPhone frame with realistic bezel and responsive scaling",
              "Active Metro dev server log stream on port 8081",
              "Mobile QR code badge for physical device testing",
              "Problems / diagnostics tab with zero syntax errors",
            ]}
            specs="3200 × 2000 • 2x Retina"
            targetPath="/public/screenshots/devicelab-preview.png"
          />
        </SplitShowcase>

        <SplitShowcase
          kicker="03 / Database Branching"
          title="Neon instant branching & Supabase lifecycle"
          description="Connect Supabase or Neon serverless Postgres. Caide automatically provisions an isolated, copy-on-write database branch for each feature thread, allowing the agent to test schema migrations safely."
          reverse={false}
        >
          <ScreenshotPlaceholder
            badge="DATABASE BRANCHING"
            title="Neon Serverless Postgres: Instant Branching"
            description="Shows Caide's Database settings and dock panel displaying an active Neon connection, schema migration diffs, and an isolated feature branch spun up for the current thread."
            checklist={[
              "Neon project connection with active database branch name",
              "Schema migration timeline with up/down SQL previews",
              "Copy-on-write branch indicator with 1-click restore",
              "Supabase Auth and storage status indicators",
            ]}
            specs="3200 × 2000 • 2x Retina"
            targetPath="/public/screenshots/database-branching.png"
          />
        </SplitShowcase>

        <SplitShowcase
          kicker="04 / Tool Consent & Safety"
          title="Explicit approvals with protected shell execution"
          description="Never worry about unexpected terminal commands or file wipes. Caide features granular tool approvals, shell command blocklists, and immediate checkpoints so you can review every change."
          stacked
          prominentMedia
        >
          <ScreenshotPlaceholder
            badge="TOOL CONSENT & SAFETY"
            title="Explicit Tool Approval Gate & Terminal Safety"
            description="Shows the Caide approval card when the agent requests to run a shell command. Displays the exact bash command, safety risk audit, working directory, and Approve / Reject buttons."
            checklist={[
              "Pending tool approval card in chat stream",
              "Highlighted command line with safety audit badge",
              "File diff inspection preview before committing",
              "Checkpoint rollback button in the top navigation",
            ]}
            specs="3200 × 2000 • 2x Retina"
            targetPath="/public/screenshots/tool-consent-safety.png"
          />
        </SplitShowcase>

        <SplitShowcase
          kicker="05 / 1-Click Deploy & Native Builds"
          title="Ship to Vercel and export native mobile binaries"
          description="Publish web projects directly to Vercel with automatic Neon database synchronization. For mobile apps, trigger native builds (APK, AAB, IPA) or export standard CAIDEPKG packages."
          reverse
        >
          <ScreenshotPlaceholder
            badge="PUBLISH & NATIVE BUILDS"
            title="Publish Panel: 1-Click Vercel & Mobile Export"
            description="Shows Caide's Publish dialog with one-click Vercel deployment synced with Neon Postgres, GitHub repo push status, and native APK/AAB/IPA export action buttons."
            checklist={[
              "Vercel deployment status with live URL preview",
              "Neon database branch synchronization toggle",
              "GitHub commit and push history",
              "Native mobile build options (APK / AAB / IPA)",
            ]}
            specs="3200 × 2000 • 2x Retina"
            targetPath="/public/screenshots/publish-deploy.png"
          />
        </SplitShowcase>
      </div>
    </section>
  );
}
