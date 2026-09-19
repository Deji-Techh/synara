import { ProjectThreadsMockup } from "@/components/showcase/ProjectThreadsMockup";
import { ScrollReveal } from "@/components/ScrollReveal";

const sectionHeading =
  "text-[1.35rem] font-medium leading-[1.14] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[1.6rem]";
const sectionBody =
  "mt-3 max-w-xl text-[13.5px] leading-[1.65] text-[var(--text-secondary)] sm:mt-4 sm:text-[14.5px]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export function MultiProjectShowcase() {
  return (
    <section className="border-t border-[var(--divide)] py-14 sm:py-20">
      <div className={container}>
        <ScrollReveal>
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
                rebuilding lost context. Each project maintains its own isolated threads, Neon
                database branches, hot-reloading dev processes, and live inspection states.
              </p>
            </div>

            <div className="relative min-w-0">
              <div className="w-full">
                <ProjectThreadsMockup />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
