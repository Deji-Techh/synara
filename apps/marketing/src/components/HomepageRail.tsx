"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "frameworks", label: "Frameworks" },
  { id: "features", label: "Features" },
  { id: "workflow", label: "Workflow" },
  { id: "faq", label: "FAQ" },
  { id: "download", label: "Download" },
];

export default function HomepageRail() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    function handleScroll() {
      const scrollPosition = window.scrollY + 250;
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActive(section.id);
            break;
          }
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <aside className="fixed right-6 top-1/2 -translate-y-1/2 z-30 hidden xl:flex flex-col gap-3">
      {SECTIONS.map((sec) => (
        <a
          key={sec.id}
          href={`#${sec.id}`}
          aria-label={sec.label}
          className={`size-2 rounded-full transition-all duration-300 ${
            active === sec.id
              ? "bg-[var(--accent-link)] scale-150 ring-4 ring-orange-500/20"
              : "bg-[var(--divide)] hover:bg-[var(--text-tertiary)]"
          }`}
        />
      ))}
    </aside>
  );
}
