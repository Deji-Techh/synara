import { TESTIMONIALS } from "@/data/testimonials";
import { ScrollReveal } from "@/components/ScrollReveal";

export default function Testimonials() {
  return (
    <section className="border-t border-[var(--divide)] py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <ScrollReveal>
          <div className="text-center">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
              Community Voices
            </p>
            <h2 className="mt-3 text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]">
              Built for developers shipping production software
            </h2>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 shadow-sm transition-all hover:border-[var(--border-strong)] hover:shadow-md"
              >
                <div>
                  <div className="mb-3 text-[12px] font-semibold text-sky-600">{t.highlight}</div>
                  <p className="text-[13.5px] leading-relaxed text-[var(--text-primary)]">
                    "{t.content}"
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-[var(--divide)] pt-4">
                  <img
                    src={t.avatar}
                    alt={t.name}
                    className="size-9 rounded-full object-cover ring-1 ring-[var(--divide)]"
                  />
                  <div>
                    <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {t.name}
                    </h4>
                    <p className="text-[11.5px] text-[var(--text-tertiary)]">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
