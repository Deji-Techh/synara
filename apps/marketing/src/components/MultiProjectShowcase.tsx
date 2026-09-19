import { ScreenshotPlaceholder } from "@/components/ScreenshotPlaceholder";

const sectionHeading =
  "text-[1.35rem] font-medium leading-[1.14] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[1.6rem]";
const sectionBody =
  "mt-3 max-w-xl text-[13.5px] leading-[1.65] text-[var(--text-secondary)] sm:mt-4 sm:text-[14.5px]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export function MultiProjectShowcase() {
  return (
    <section className="border-t border-[var(--divide)] py-14 sm:py-20">
      <div className={container}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center lg:gap-10 xl:gap-14">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
              Workspace Isolation
            </p>
            <h2 className={`mt-2 ${sectionHeading}`}>
              Keep every project, thread, and branch ready to resume.
            </h2>
            <p className={sectionBody}>
              Move seamlessly between mobile apps, web frontends, and database backends without
              rebuilding lost context. Each project maintains its own isolated threads, Neon database
              branches, hot-reloading dev processes, and live inspection states.
            </p>
          </div>

          <div className="relative min-w-0">
            <div className="relative isolate flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl p-3 sm:p-5 ring-1 ring-black/[0.08] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.12)]">
              <div aria-hidden className="shot-card-bg absolute inset-0 -z-10" />
              <div className="w-full sm:w-5/6 lg:w-[82%]">
                <ScreenshotPlaceholder
                  badge="PROJECT THREADS"
                  title="Persistent Project Threads & Branch Switcher"
                  description="Shows Caide left navigation with multiple projects active (Expo App, Flutter Mobile, Next.js Web), collapsible thread trees, and active Neon database branch tags."
                  checklist={[
                    "Multi-project sidebar list with framework badges",
                    "Thread history grouped by active feature branches",
                    "One-click database branch state indicator",
                    "Instant thread resume with full turn memory",
                  ]}
                  specs="3200 × 2000 • 2x Retina"
                  targetPath="/public/screenshots/projects-threads.png"
                  aspectRatio="aspect-[16/10]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
