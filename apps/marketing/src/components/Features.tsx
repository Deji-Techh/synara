import { SUPPORTED_FRAMEWORKS } from "@/data/product";
import { SplitShowcase } from "@/components/SplitShowcase";
import { ScreenshotPlaceholder } from "@/components/ScreenshotPlaceholder";
import { ExpoIcon, FlutterIcon, NextjsIcon } from "@/components/BrandIcons";
import { Layers, Smartphone, Globe, Box } from "lucide-react";

export default function Features() {
  const iconMap: Record<string, any> = {
    "react-native": Smartphone,
    "flutter": Layers,
    "website": Globe,
    "blank": Box,
  };

  return (
    <section id="frameworks" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
          01 / Immutable Frameworks
        </p>
        <h2 className="mt-3 text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]">
          One framework chosen at creation. Deep native toolchains.
        </h2>
        <p className="mt-4 max-w-2xl text-[14px] leading-[1.7] text-[var(--text-secondary)] sm:text-[15px]">
          Caide enforces strict architectural boundaries. The framework you select sets up dedicated prompts, system tools, dev-servers, and production export pipelines.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORTED_FRAMEWORKS.map((fw) => {
            const IconComponent = iconMap[fw.id] || Box;
            return (
              <div
                key={fw.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 transition-all hover:border-[var(--border-strong)] hover:shadow-lg"
              >
                <div>
                  <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    <IconComponent className="size-5" />
                  </div>
                  <div className="mb-1 text-[11px] font-semibold text-orange-600 uppercase dark:text-orange-400">
                    {fw.badge}
                  </div>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    {fw.name}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    {fw.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <SplitShowcase
          kicker="Framework Scaffolding"
          title="Start with full native toolchain support"
          description="Create a new React Native Expo project, Flutter mobile app, or Next.js web application. Caide configures your local environment, installs dependencies, and boots the live watcher automatically."
          reverse
        >
          <ScreenshotPlaceholder
            badge="FRAMEWORK CREATION"
            title="Create App Dialog: Framework Choice"
            description="Shows the Caide Create App dialog with the 4 immutable framework cards (Blank, React Native Expo, Flutter, Next.js), toolchain health indicators (Node, Bun, Flutter SDK), and starter templates."
            checklist={[
              "Framework cards with badges and icons",
              "Toolchain prerequisite check indicators",
              "Project path selection & template selector",
              "Default port allocation and dev runner preview",
            ]}
            specs="3200 × 2000 • 2x Retina • Light & Dark"
            targetPath="/public/screenshots/framework-creation.png"
          />
        </SplitShowcase>
      </div>
    </section>
  );
}
