"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SiX } from "react-icons/si";
import { CaideIcon } from "@/components/BrandIcons";
import MobileNav from "@/components/MobileNav";
import { scrollToAnchor } from "@/lib/scrollToAnchor";
import { WhitelistModal } from "@/components/WhitelistModal";

export default function Navbar() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [whitelistOpen, setWhitelistOpen] = useState(false);

  const handleSectionClick = (anchor: string) => (e: React.MouseEvent) => {
    if (isHome) {
      scrollToAnchor(anchor, e);
    }
  };

  return (
    <>
      <nav aria-label="Primary navigation" className="relative z-40 w-full px-4 py-4 sm:px-6">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between gap-2 sm:gap-6">
          <Link
            href="/"
            aria-label="Caide home"
            className={`flex shrink-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] transition-colors ${
              isHome ? "text-white" : "text-[var(--text-primary)]"
            } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]`}
          >
            <CaideIcon className="h-5 w-auto shrink-0" />
            <span className="font-semibold tracking-tight">Caide</span>
          </Link>

          {/* Center Nav Links with Smooth Scrolling */}
          <div
            className={`hidden min-w-0 flex-1 items-center justify-center gap-4 text-[13px] font-medium sm:flex sm:gap-7 ${
              isHome ? "text-white/85" : "text-[var(--text-secondary)]"
            }`}
          >
            <a
              href="/#frameworks"
              onClick={handleSectionClick("frameworks")}
              className={`shrink-0 transition-colors ${
                isHome ? "hover:text-white" : "hover:text-[var(--text-primary)]"
              }`}
            >
              Frameworks
            </a>
            <a
              href="/#providers"
              onClick={handleSectionClick("providers")}
              className={`shrink-0 transition-colors ${
                isHome ? "hover:text-white" : "hover:text-[var(--text-primary)]"
              }`}
            >
              Models
            </a>
            <a
              href="/#workflow"
              onClick={handleSectionClick("workflow")}
              className={`shrink-0 transition-colors ${
                isHome ? "hover:text-white" : "hover:text-[var(--text-primary)]"
              }`}
            >
              Workflow
            </a>
            <Link
              href="/docs"
              className={`shrink-0 transition-colors ${
                isHome ? "hover:text-white" : "hover:text-[var(--text-primary)]"
              }`}
            >
              Docs
            </Link>
            <Link
              href="/changelog"
              className={`shrink-0 transition-colors ${
                isHome ? "hover:text-white" : "hover:text-[var(--text-primary)]"
              }`}
            >
              Changelog
            </Link>
          </div>

          {/* Right CTA Actions: Follow on X + Join Whitelist */}
          <div className="hidden shrink-0 items-center gap-2 sm:flex sm:gap-3">
            <a
              href="https://x.com/orgcaide"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow Caide on X"
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-[12.5px] font-medium backdrop-blur-md transition-all sm:text-[13px] ${
                isHome
                  ? "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:border-white/40"
                  : "border-[var(--divide)] bg-white/70 text-[var(--text-secondary)] hover:bg-white hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] hover:shadow-sm"
              } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]`}
            >
              <SiX className="size-3" />
              <span>Follow on X</span>
            </a>
            <button
              type="button"
              onClick={() => setWhitelistOpen(true)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-[12.5px] font-medium shadow-sm transition-all sm:text-[13px] ${
                isHome
                  ? "bg-white text-slate-900 hover:bg-slate-100 hover:shadow-md"
                  : "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] hover:opacity-90"
              } active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]`}
            >
              <span>Join Whitelist</span>
            </button>
          </div>
          <MobileNav isHome={isHome} onOpenWhitelist={() => setWhitelistOpen(true)} />
        </div>
      </nav>

      <WhitelistModal isOpen={whitelistOpen} onClose={() => setWhitelistOpen(false)} />
    </>
  );
}
