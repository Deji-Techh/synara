"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { WhitelistModal } from "@/components/WhitelistModal";

export default function DownloadButton({
  className = "",
  label = "Join Whitelist",
}: {
  className?: string;
  label?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={`group relative inline-flex min-w-[10.5rem] items-center justify-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-5 py-2.5 text-[13px] font-medium text-[var(--btn-primary-fg)] shadow-md transition-all duration-300 hover:opacity-95 hover:shadow-lg active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)] ${className}`}
      >
        <span className="whitespace-nowrap font-medium tracking-tight">{label}</span>
        <ArrowRight className="size-3.5 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
      </button>

      <WhitelistModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
