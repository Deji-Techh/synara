"use client";

import { useEffect, useState } from "react";
import { scrollToAnchor } from "@/lib/scrollToAnchor";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "frameworks", label: "Frameworks" },
  { id: "providers", label: "Models" },
  { id: "workflow", label: "Workflow" },
  { id: "privacy", label: "Privacy" },
  { id: "faq", label: "FAQ" },
  { id: "download", label: "Download" },
] as const;

const LINE_CLASSES = "w-4 group-hover:w-5 bg-slate-300 group-hover:bg-slate-400";

export default function HomepageRail() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const sections = SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (section): section is HTMLElement => section !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => {
            const distanceA = Math.abs(a.boundingClientRect.top - window.innerHeight * 0.3);
            const distanceB = Math.abs(b.boundingClientRect.top - window.innerHeight * 0.3);
            return distanceA - distanceB;
          });
        const next = visible[0]?.target.id;
        if (next) setActiveId(next);
      },
      {
        rootMargin: "-18% 0px -62% 0px",
        threshold: [0, 0.15, 0.5],
      },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Homepage sections"
      className="fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 [@media(min-width:1200px)]:block"
    >
      <ol className="flex flex-col items-end gap-1">
        {SECTIONS.map(({ id, label }) => {
          const active = activeId === id;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={(event) => {
                  if (scrollToAnchor(id, event)) setActiveId(id);
                }}
                aria-current={active ? "location" : undefined}
                className="group flex h-5 items-center justify-end gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)]"
              >
                <span className="pointer-events-none translate-x-1 whitespace-nowrap rounded-md border border-[var(--divide)] bg-white/90 px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] opacity-0 shadow-sm backdrop-blur-md transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
                  {label}
                </span>
                <span
                  aria-hidden="true"
                  className={`block h-[2px] rounded-sm transition-[width,background-color] duration-200 motion-reduce:transition-none ${
                    active
                      ? "w-8 bg-[var(--accent-link)] shadow-[0_0_6px_rgba(2,132,199,0.5)]"
                      : LINE_CLASSES
                  }`}
                />
                <span className="sr-only">{label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
