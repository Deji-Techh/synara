"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { FiX } from "react-icons/fi";
import { SiX } from "react-icons/si";
import { scrollToAnchor } from "@/lib/scrollToAnchor";

const links = [
  { href: "/#frameworks", anchor: "frameworks", label: "Frameworks" },
  { href: "/#providers", anchor: "providers", label: "Models" },
  { href: "/#workflow", anchor: "workflow", label: "Workflow" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
  { href: "/privacy", label: "Privacy" },
] as const;

export default function MobileNav({
  isHome = false,
  onOpenWhitelist,
}: {
  isHome?: boolean;
  onOpenWhitelist?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleLinkClick = (anchor?: string) => (e: React.MouseEvent) => {
    setOpen(false);
    if (isHome && anchor) {
      scrollToAnchor(anchor, e);
    }
  };

  return (
    <div className="relative flex items-center gap-1.5 sm:hidden">
      <a
        href="https://x.com/orgcaide"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Follow on X"
        className={`flex size-8 items-center justify-center rounded-full border shadow-sm ${
          isHome
            ? "border-white/20 bg-white/10 text-white backdrop-blur-md"
            : "border-[var(--divide)] bg-white/80 text-[var(--text-secondary)]"
        }`}
      >
        <SiX className="size-3" />
      </a>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onOpenWhitelist?.();
        }}
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-medium backdrop-blur-md transition-colors ${
          isHome
            ? "border-white/20 bg-white text-slate-900 hover:bg-slate-100"
            : "border-[var(--divide)] bg-white/80 text-[var(--text-primary)] hover:bg-[var(--mock-row)]"
        }`}
      >
        <span>Whitelist</span>
      </button>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((current) => !current)}
        className={`flex size-8 items-center justify-center rounded-md transition-colors ${
          isHome
            ? "text-white hover:bg-white/10"
            : "text-[var(--text-primary)] hover:bg-[var(--mock-row)]"
        }`}
      >
        <span className="relative grid size-[18px] place-items-center">
          <svg
            className={`col-start-1 row-start-1 size-[18px] transition-[opacity,transform] duration-200 ${
              open ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="12" y2="15" />
          </svg>
          <FiX
            className={`col-start-1 row-start-1 size-[18px] transition-[opacity,transform] duration-200 ${
              open ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
            }`}
          />
        </span>
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute top-12 right-0 z-50 w-56 rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-3 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95"
        >
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleLinkClick("anchor" in link ? link.anchor : undefined)}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
              >
                {link.label}
              </a>
            ))}
            <a
              href="https://x.com/orgcaide"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--accent-link)] transition-colors hover:bg-[var(--mock-row)]"
            >
              <SiX className="size-3" />
              <span>Follow on X</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
