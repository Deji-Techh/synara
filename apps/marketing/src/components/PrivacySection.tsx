import Link from "next/link";
import { HardDrive, Plug, ShieldCheck, Lock, ArrowRight } from "lucide-react";
import { ScrollReveal } from "@/components/ScrollReveal";

const heading =
  "text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]";
const body = "mt-5 max-w-2xl text-[15px] leading-[1.7] text-[var(--text-secondary)] sm:text-[16px]";
const container = "mx-auto w-full max-w-6xl px-4 sm:px-6";

const pillars = [
  {
    Icon: HardDrive,
    title: "Workspace state stays on your machine",
    description:
      "All project files, SQLite thread history, goal trees, version checkpoints, and local configs are stored strictly on your local disk—never in an external cloud account.",
  },
  {
    Icon: Plug,
    title: "Direct provider routing with zero proxy",
    description:
      "Your prompts and tool calls stream directly from your machine to Anthropic, OpenAI, or local Ollama. Caide operates zero proxy servers, token markups, or hidden telemetry.",
  },
  {
    Icon: ShieldCheck,
    title: "100% Free & Open Source, zero markups",
    description:
      "Caide operates zero cloud subscription tiers, zero tokens-per-month caps, and zero hidden telemetry. Bring your own keys and build without artificial lock-in.",
  },
  {
    Icon: Lock,
    title: "Explicit consent gates & safe shell",
    description:
      "Every destructive command, package installation, and database migration requires your explicit consent. Blocklists prevent accidental data wipeout.",
  },
];

export default function PrivacySection() {
  return (
    <section className="border-t border-[var(--divide)] py-14 sm:py-20">
      <div className={container}>
        <ScrollReveal>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
            Local-first boundary
          </p>
          <h2 className={`${heading} mt-3`}>Know where every part of the work goes.</h2>
          <p className={body}>
            Caide keeps your code, data, and keys completely under your control. The boundary is
            explicit: local application state stays on your machine, while AI providers receive only
            the context necessary to fulfill your prompt.
          </p>

          <div className="mt-12 grid grid-cols-1 border-t border-[var(--divide)] sm:grid-cols-2">
            {pillars.map(({ Icon, title, description }, idx) => (
              <div
                key={title}
                style={{ transitionDelay: `${idx * 50}ms` }}
                className="group border-b border-[var(--divide)] p-6 transition-all duration-300 hover:bg-[var(--mock-row)] hover:translate-x-1 sm:p-7 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(odd)]:border-[var(--divide)]"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--block-elevated)] text-[var(--text-primary)] shadow-sm transition-transform duration-300 group-hover:scale-110">
                    <Icon className="size-[18px]" />
                  </span>
                  <h3 className="text-[15px] font-medium text-[var(--text-primary)]">{title}</h3>
                </div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
                  {description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-[13px]">
            <Link
              href="/privacy"
              className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-link)] hover:underline"
            >
              <span>Read full Privacy & Security documentation</span>
              <ArrowRight className="size-3.5" />
            </Link>
            <a
              href="https://x.com/caideorg"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Follow project updates on X (@caideorg) →
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
