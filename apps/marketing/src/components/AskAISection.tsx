"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, Bot } from "lucide-react";

const PROMPTS = [
  {
    q: "Can I build iOS and Android apps with Caide?",
    a: "Yes! Caide provides deep, first-class support for React Native (Expo) and Flutter projects. It boots local dev-servers, frames the app in iPhone & Android simulators in DeviceLab, provides mobile QR code testing, and builds native APK, AAB, and IPA binaries.",
  },
  {
    q: "Is Caide completely free to use?",
    a: "100% free and open source. Caide has zero subscriptions, zero token markups, and zero Pro gates. You bring your own API keys for Anthropic, OpenAI, DeepSeek, Gemini, Groq, or run completely offline with Ollama.",
  },
  {
    q: "How does Neon database branching work?",
    a: "Caide integrates with Neon serverless Postgres to create instant, isolated copy-on-write database branches per thread. Your agent can run database migrations, test seed data, and iterate safely without risking your main database.",
  },
  {
    q: "Where is my source code stored?",
    a: "Your source code and keys stay strictly on your local machine in regular Git repositories. Caide communicates directly with model providers over HTTPS without passing your data through any proprietary intermediary servers.",
  },
];

export default function AskAISection() {
  const [selectedIdx, setSelectedIdx] = useState(0);

  return (
    <section className="border-t border-[var(--divide)] py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
          <Sparkles className="size-3.5" />
          <span>Quick Answers</span>
        </div>
        <h2 className="mt-3 text-[1.65rem] font-medium leading-[1.12] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2rem]">
          Frequently Asked Architecture Questions
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
          <div className="flex flex-col gap-2 lg:col-span-5">
            {PROMPTS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={`flex items-center justify-between rounded-xl border p-4 text-left text-[13px] font-medium transition-all ${
                  selectedIdx === idx
                    ? "border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-primary)] shadow-md"
                    : "border-[var(--divide)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--mock-row)]"
                }`}
              >
                <span>{item.q}</span>
                <ArrowRight className={`size-4 shrink-0 transition-transform ${selectedIdx === idx ? "translate-x-1 text-orange-500" : "opacity-30"}`} />
              </button>
            ))}
          </div>

          <div className="relative flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 sm:p-8 lg:col-span-7 shadow-lg">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400">
                <Bot className="size-3.5" />
                <span>Caide Assistant</span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                {PROMPTS[selectedIdx].q}
              </h3>
              <p className="mt-4 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                {PROMPTS[selectedIdx].a}
              </p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-[var(--divide)] pt-4 text-[12px] text-[var(--text-tertiary)]">
              <span>Read more in our official documentation</span>
              <a href="/docs" className="font-medium text-[var(--accent-link)] hover:underline">
                Explore Docs →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
