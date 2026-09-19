import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { ShieldCheck, Lock, HardDrive, Key } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
            <ShieldCheck className="size-4" />
            <span>Local-First Guarantee</span>
          </div>
          <h1 className="mt-3 text-[2rem] font-medium tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2.5rem]">
            Your Code. Your Keys. Your Machine.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-[var(--text-secondary)] sm:text-[15px]">
            Caide is engineered from the ground up as a private, local-first application. We do not operate intermediary servers that read your prompts or store your source code.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6">
            <HardDrive className="size-6 text-orange-600 mb-3" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Local Storage</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              All project files, SQLite state stores, and chat threads remain on your hard drive. Nothing is uploaded to a Caide cloud.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6">
            <Key className="size-6 text-orange-600 mb-3" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Direct Provider Calls</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Caide calls Anthropic, OpenAI, DeepSeek, Google, and Groq endpoints directly from your local process over secure HTTPS.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6">
            <Lock className="size-6 text-orange-600 mb-3" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Zero Telemetry</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              No tracking pixels, no event telemetry, and no usage profiling. You can run Caide completely offline with Ollama.
            </p>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
