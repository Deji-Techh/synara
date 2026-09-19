import Navbar from "@/components/Navbar";
import SiteFooter from "@/components/SiteFooter";
import { SiApple, SiLinux } from "react-icons/si";
import { FaWindows } from "react-icons/fa";
import { Terminal, Download, ArrowRight } from "lucide-react";

export default function InstallPage() {
  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[var(--text-primary)]">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-link)]">
            Installation & Setup
          </p>
          <h1 className="mt-3 text-[2rem] font-medium tracking-[-0.035em] text-[var(--text-primary)] sm:text-[2.5rem]">
            Download Caide for your platform
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[14px] leading-relaxed text-[var(--text-secondary)] sm:text-[15px]">
            Desktop application packages are self-contained and pre-bundled with runtime tools.
            Choose your operating system below.
          </p>
        </div>

        {/* Download Cards Grid */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* macOS */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 shadow-sm">
            <div>
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                <SiApple className="size-6" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">macOS</h3>
              <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
                Supports macOS 12 Monterey and newer. Universal package with Apple Silicon and Intel
                builds.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <a
                href="https://github.com/caideorg/caide/releases"
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--btn-primary-fg)] transition-opacity hover:opacity-90"
              >
                <Download className="size-4" />
                <span>Apple Silicon (.dmg)</span>
              </a>
              <a
                href="https://github.com/caideorg/caide/releases"
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--divide)] px-4 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--mock-row)]"
              >
                <span>Intel x64 (.dmg)</span>
              </a>
            </div>
          </div>

          {/* Linux */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 shadow-sm ring-1 ring-sky-500/30">
            <div>
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                <SiLinux className="size-6" />
              </div>
              <div className="mb-1 text-[11px] font-semibold text-sky-600 uppercase">
                Recommended
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Linux</h3>
              <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
                Portable AppImage and Debian package for Ubuntu, Debian, Fedora, Arch, and
                derivatives.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <a
                href="https://github.com/caideorg/caide/releases"
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--btn-primary-fg)] transition-opacity hover:opacity-90"
              >
                <Download className="size-4" />
                <span>Download AppImage</span>
              </a>
              <a
                href="https://github.com/caideorg/caide/releases"
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--divide)] px-4 py-2 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--mock-row)]"
              >
                <span>Download .deb package</span>
              </a>
            </div>
          </div>

          {/* Windows */}
          <div className="flex flex-col justify-between rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 shadow-sm">
            <div>
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                <FaWindows className="size-6" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Windows</h3>
              <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
                Standard NSIS executable installer for Windows 10 and 11 (64-bit).
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <a
                href="https://github.com/caideorg/caide/releases"
                className="flex items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-[12.5px] font-medium text-[var(--btn-primary-fg)] transition-opacity hover:opacity-90"
              >
                <Download className="size-4" />
                <span>Download Installer (.exe)</span>
              </a>
            </div>
          </div>
        </div>

        {/* Terminal Install Snippet */}
        <div className="mt-12 rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 sm:p-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Terminal className="size-4 text-sky-600" />
            <span>Install via Terminal (macOS & Linux)</span>
          </div>
          <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
            Run the automated installation script to fetch and install the latest binary for your
            architecture:
          </p>
          <div className="mt-4 flex items-center justify-between overflow-x-auto rounded-xl bg-slate-900 px-4 py-3 font-mono text-[13px] text-slate-100">
            <code>curl -fsSL https://caide.dev/install.sh | bash</code>
          </div>
        </div>

        {/* Build From Source */}
        <div className="mt-8 rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-6 sm:p-8">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Build From Source</h3>
          <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
            Caide is completely open source. You can clone the monorepo and run the web or desktop
            app with Bun:
          </p>
          <div className="mt-4 rounded-xl bg-slate-900 p-4 font-mono text-[12.5px] leading-relaxed text-slate-200">
            <div>git clone https://github.com/caideorg/caide.git</div>
            <div>cd caide</div>
            <div>bun install</div>
            <div>bun run dev</div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
