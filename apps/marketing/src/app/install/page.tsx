"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { SiApple, SiLinux } from "react-icons/si";
import { FaWindows } from "react-icons/fa";
import { ShieldCheck, Cpu, Smartphone, Database, ArrowRight, CheckCircle2 } from "lucide-react";
import { WhitelistModal } from "@/components/WhitelistModal";
import Link from "next/link";

export default function InstallPage() {
  const [whitelistOpen, setWhitelistOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Header / Hero */}
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
            <span className="size-1.5 rounded-full bg-amber-500" />
            <span>Private Staging • Early Access</span>
          </div>

          <h1 className="mt-4 text-[2.25rem] font-medium tracking-[-0.04em] text-[var(--text-primary)] sm:text-[3rem]">
            Caide Desktop is Coming Soon
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[14.5px] leading-relaxed text-[var(--text-secondary)] sm:text-[16px]">
            We are finalizing the native desktop release builds for macOS, Linux, and Windows. Join
            the whitelist to receive your early access download invitation when the next cohort
            unlocks.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setWhitelistOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-6 py-3 text-[13.5px] font-medium text-[var(--btn-primary-fg)] shadow-lg transition-all duration-300 hover:opacity-95 hover:shadow-xl active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
            >
              <span>Join Early Access Whitelist</span>
              <ArrowRight className="size-4" />
            </button>

            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--divide)] bg-[var(--card)] px-5 py-3 text-[13px] font-medium text-[var(--text-primary)] shadow-sm transition-all hover:bg-[var(--mock-row)]"
            >
              <span>Explore Documentation</span>
            </Link>
          </div>
        </div>

        {/* Platform Release Staging Status Grid */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* macOS */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-amber-500/30">
            <div>
              <div className="flex items-center justify-between">
                <div className="inline-flex size-11 items-center justify-center rounded-xl bg-slate-500/10 text-slate-800 dark:text-slate-200">
                  <SiApple className="size-6" />
                </div>
                <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-0.5 text-[10.5px] font-medium text-amber-600">
                  In Staging
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">macOS</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Universal bundle for Apple Silicon (M1/M2/M3/M4) and Intel. Native menu bar,
                keychain credential storage, and notarized security checks.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--divide)]">
              <button
                type="button"
                onClick={() => setWhitelistOpen(true)}
                className="w-full rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] py-2 text-center text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
              >
                Request macOS Invite →
              </button>
            </div>
          </div>

          {/* Linux */}
          <div className="flex flex-col justify-between rounded-2xl border border-sky-500/30 bg-[var(--card)] p-6 shadow-sm ring-1 ring-sky-500/20 transition-all duration-300 hover:shadow-md">
            <div>
              <div className="flex items-center justify-between">
                <div className="inline-flex size-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                  <SiLinux className="size-6" />
                </div>
                <span className="rounded-full border border-sky-500/20 bg-sky-500/5 px-2.5 py-0.5 text-[10.5px] font-medium text-sky-600">
                  Target Priority
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">Linux</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                Self-contained AppImage & Debian package. Tested across Ubuntu, Fedora, Debian, and
                Arch with embedded node-pty terminal runtime.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--divide)]">
              <button
                type="button"
                onClick={() => setWhitelistOpen(true)}
                className="w-full rounded-xl bg-[var(--btn-primary-bg)] py-2 text-center text-[12px] font-medium text-[var(--btn-primary-fg)] transition-opacity hover:opacity-90 shadow-sm"
              >
                Request Linux Invite →
              </button>
            </div>
          </div>

          {/* Windows */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-amber-500/30">
            <div>
              <div className="flex items-center justify-between">
                <div className="inline-flex size-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                  <FaWindows className="size-6" />
                </div>
                <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-0.5 text-[10.5px] font-medium text-amber-600">
                  In Staging
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">Windows</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                NSIS executable installer for Windows 10 & 11 (x64). Full PowerShell, Git bash, and
                WSL 2 subprocess isolation.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-[var(--divide)]">
              <button
                type="button"
                onClick={() => setWhitelistOpen(true)}
                className="w-full rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] py-2 text-center text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
              >
                Request Windows Invite →
              </button>
            </div>
          </div>
        </div>

        {/* Feature Highlights What to Expect */}
        <div className="mt-12 rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 sm:p-8">
          <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
            What to expect when your early access invite arrives:
          </h3>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <h4 className="text-[14px] font-medium text-[var(--text-primary)]">
                  100% Local-First Boundary
                </h4>
                <p className="mt-1 text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                  All SQLite thread history, goal trees, and code modifications stay completely on
                  your machine. Zero hidden telemetry.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                <Cpu className="size-4" />
              </div>
              <div>
                <h4 className="text-[14px] font-medium text-[var(--text-primary)]">
                  Direct BYOK Model Hub
                </h4>
                <p className="mt-1 text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                  Connect Anthropic Claude 3.7, OpenAI GPT-4o, Google Gemini, DeepSeek, or run
                  completely offline with Ollama. Zero subscription fees.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                <Smartphone className="size-4" />
              </div>
              <div>
                <h4 className="text-[14px] font-medium text-[var(--text-primary)]">
                  Native DeviceLab Mobile Previews
                </h4>
                <p className="mt-1 text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                  Hot-reloading live previews across simulated iPhone 16 Pro, Android, Tablet, and
                  Desktop frames with QR code mobile testing.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                <Database className="size-4" />
              </div>
              <div>
                <h4 className="text-[14px] font-medium text-[var(--text-primary)]">
                  Neon Serverless Branching
                </h4>
                <p className="mt-1 text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                  Copy-on-write database branches per thread so your AI agent tests database
                  migrations without affecting staging data.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
      <WhitelistModal isOpen={whitelistOpen} onClose={() => setWhitelistOpen(false)} />
    </div>
  );
}
