"use client";

import { useEffect, useState, useId, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { FiX, FiCheck, FiArrowRight, FiLoader } from "react-icons/fi";
import { ShieldCheck, Terminal, Cpu } from "lucide-react";

interface WhitelistModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFramework?: string;
}

export function WhitelistModal({
  isOpen,
  onClose,
  defaultFramework = "react-native",
}: WhitelistModalProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [framework, setFramework] = useState(defaultFramework);
  const [role, setRole] = useState("fullstack");
  const [preferredModel, setPreferredModel] = useState("claude");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const titleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Reset status after close animation
      const t = setTimeout(() => {
        setIsSuccess(false);
        setErrorMessage(null);
      }, 300);
      return () => clearTimeout(t);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          framework,
          role,
          preferredModel,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit. Please try again.");
      }

      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      {/* Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 my-auto flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--card)] text-[var(--text-primary)] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.35)] transition-all duration-300 animate-in fade-in zoom-in-95">
        {/* Subtle Decorative Top Gradient */}
        <div className="h-1.5 w-full shrink-0 bg-gradient-to-r from-amber-500 via-sky-500 to-amber-600" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 inline-flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--mock-row)] hover:text-[var(--text-primary)]"
        >
          <FiX className="size-4" />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-7">
          {isSuccess ? (
            <div className="py-3 text-center sm:py-5 animate-in fade-in">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 shadow-inner sm:size-14">
                <FiCheck className="size-6 stroke-[2.5] sm:size-7" />
              </div>

              <h3
                id={titleId}
                className="mt-3 text-lg font-semibold tracking-tight text-[var(--text-primary)] sm:mt-5 sm:text-2xl"
              >
                You’re on the Whitelist!
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)] sm:text-[14px]">
                Thank you, <strong className="text-[var(--text-primary)]">{name}</strong>. We’ve
                reserved your spot for early access. We will email your invite to{" "}
                <strong className="text-[var(--text-primary)]">{email}</strong> as soon as the next
                desktop cohort opens.
              </p>

              <div className="mt-4 rounded-xl border border-[var(--divide)] bg-[var(--block-elevated)] p-3 text-left text-[12px] leading-relaxed text-[var(--text-secondary)] sm:mt-6 sm:p-4 sm:text-[12.5px]">
                <div className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                  <ShieldCheck className="size-4 text-emerald-600" />
                  <span>What happens next?</span>
                </div>
                <p className="mt-1.5">
                  Early whitelist members receive priority AppImage/DMG package builds, direct
                  Discord developer channel access, and first-wave Model Hub updates.
                </p>
              </div>

              <div className="mt-5 flex justify-center sm:mt-8">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-[var(--btn-primary-bg)] px-6 py-2 text-[12.5px] font-medium text-[var(--btn-primary-fg)] transition-all hover:opacity-90 shadow-sm sm:py-2.5 sm:text-[13px]"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="mb-3.5 sm:mb-5">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-600 uppercase tracking-wider sm:text-[11px]">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  <span>Private Early Access</span>
                </div>
                <h3
                  id={titleId}
                  className="mt-2 text-lg font-semibold tracking-tight text-[var(--text-primary)] sm:mt-3 sm:text-2xl"
                >
                  Join the Caide Whitelist
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)] sm:mt-1.5 sm:text-[13.5px]">
                  Get early invitations to test native desktop builds, copy-on-write Neon branching,
                  and the autonomous turn loop.
                </p>
              </div>

              {errorMessage && (
                <div className="mb-3.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[12.5px] text-red-600 dark:text-red-400 sm:mb-4 sm:text-[13px]">
                  {errorMessage}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] sm:text-[12px]">
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Linus Torvalds"
                      className="mt-1 w-full rounded-xl border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all sm:py-2 sm:text-[13.5px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] sm:text-[12px]">
                      Work Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="mt-1 w-full rounded-xl border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all sm:py-2 sm:text-[13.5px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] sm:text-[12px]">
                      Primary Framework
                    </label>
                    <select
                      value={framework}
                      onChange={(e) => setFramework(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all sm:py-2 sm:text-[13px]"
                    >
                      <option value="react-native">React Native (Expo)</option>
                      <option value="flutter">Flutter Mobile</option>
                      <option value="website">Next.js / Website</option>
                      <option value="blank">Blank / Agnostic Node</option>
                      <option value="other">Other Framework</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] sm:text-[12px]">
                      Your Primary Role
                    </label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all sm:py-2 sm:text-[13px]"
                    >
                      <option value="fullstack">Full-Stack Engineer</option>
                      <option value="mobile">Mobile Developer</option>
                      <option value="ai-engineer">AI / Agent Engineer</option>
                      <option value="founder">Founder / Solo Maker</option>
                      <option value="agency">Agency / Enterprise</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] sm:text-[12px]">
                    Preferred AI Provider / Setup
                  </label>
                  <select
                    value={preferredModel}
                    onChange={(e) => setPreferredModel(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all sm:py-2 sm:text-[13px]"
                  >
                    <option value="claude">Anthropic Claude (3.7 Sonnet / Thinking)</option>
                    <option value="openai">OpenAI (GPT-4o / o3-mini)</option>
                    <option value="deepseek">DeepSeek (R1 / V3)</option>
                    <option value="gemini">Google Gemini (2.5 Pro / Flash)</option>
                    <option value="groq">Groq (Llama 3.3 70B fast LPUs)</option>
                    <option value="ollama">Ollama (100% Offline Local Inference)</option>
                    <option value="custom">Custom OpenAI Compatible Server</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] sm:text-[12px]">
                    What are you looking forward to building?{" "}
                    <span className="text-[10.5px] text-[var(--text-tertiary)]">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Cross-platform mobile app with instant live DeviceLab preview..."
                    className="mt-1 w-full rounded-xl border border-[var(--divide)] bg-[var(--card)] px-3 py-1.5 text-[12.5px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all resize-none sm:py-2 sm:text-[13px]"
                  />
                </div>

                <div className="pt-1.5 sm:pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--btn-primary-bg)] px-4 py-2.5 text-[13px] font-medium text-[var(--btn-primary-fg)] transition-all hover:opacity-95 disabled:opacity-60 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-link)] sm:py-3 sm:text-[13.5px]"
                  >
                    {isSubmitting ? (
                      <>
                        <FiLoader className="size-4 animate-spin" />
                        <span>Submitting your reservation...</span>
                      </>
                    ) : (
                      <>
                        <span>Request Early Access</span>
                        <FiArrowRight className="size-4" />
                      </>
                    )}
                  </button>
                </div>

                <p className="text-center text-[10.5px] text-[var(--text-tertiary)] sm:text-[11px]">
                  Zero spam. 100% privacy. We never share your contact details.
                </p>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
