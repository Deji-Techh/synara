import { FAQ_ITEMS } from "@/data/faqs";

export default function FAQ() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-[var(--divide)] py-16 sm:py-24">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
            Common Questions
          </p>
          <h2 className="mt-3 text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]">
            Everything you need to know about Caide
          </h2>
        </div>

        <div className="mt-12 divide-y divide-[var(--divide)]">
          {FAQ_ITEMS.map((item, idx) => (
            <details
              key={idx}
              className="group py-5 transition-colors [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-4 text-left font-medium text-[var(--text-primary)]">
                <span className="text-[15px] sm:text-base">{item.question}</span>
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--divide)] text-[12px] text-[var(--text-tertiary)] transition-transform group-open:rotate-180">
                  ↓
                </span>
              </summary>
              <div className="mt-3 pr-6 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
