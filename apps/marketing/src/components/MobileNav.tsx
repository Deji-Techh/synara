"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { FiX } from "react-icons/fi";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "/#frameworks", label: "Frameworks" },
  { href: "/#features", label: "Features" },
  { href: "/install", label: "Install" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
  { href: "/sponsor", label: "Sponsor" },
  { href: "/privacy", label: "Privacy" },
] as const;

export default function MobileNav() {
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

  return (
    <div className="relative flex items-center gap-1.5 sm:hidden">
      <ThemeToggle />
      <Link
        href="/install"
        className="rounded-full border border-[var(--divide)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
      >
        Download
      </Link>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((current) => !current)}
        className="flex size-8 items-center justify-center rounded-md text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
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
          className="absolute top-12 right-0 z-50 w-56 rounded-2xl border border-[var(--divide)] bg-[var(--card)] p-3 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--mock-row)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
