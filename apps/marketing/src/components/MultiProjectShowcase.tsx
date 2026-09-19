import { ScrollReveal } from "@/components/ScrollReveal";
import { CaideProjectsSidebarMockup } from "@/components/showcase/CaideProjectsSidebarMockup";

const sectionHeading =
  "text-[1.35rem] font-medium leading-[1.14] tracking-[-0.03em] text-[var(--text-primary)] sm:text-[1.6rem]";
const sectionBody =
  "mt-3 max-w-xl text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:text-[16px]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

export function MultiProjectShowcase() {
  return (
    <section className="border-t border-[var(--divide)] py-14 sm:py-20">
      <div className={container}>
        <ScrollReveal>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center lg:gap-10 xl:gap-14">
            <div className="min-w-0">
              <h2 className={sectionHeading}>Keep every repository ready to resume.</h2>
              <p className={sectionBody}>
                Move between products, client work, and experiments without rebuilding context from
                scattered windows. Each project keeps its own tasks, provider sessions,
                environments, and activity state.
              </p>
            </div>

            <div className="relative min-w-0">
              <div className="relative isolate flex min-h-[300px] sm:min-h-[360px] items-center justify-center overflow-hidden rounded-2xl p-4 sm:p-6 ring-1 ring-black/5 dark:ring-white/10 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.18)]">
                <div aria-hidden className="shot-card-bg absolute inset-0 -z-10" />
                <CaideProjectsSidebarMockup />
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
