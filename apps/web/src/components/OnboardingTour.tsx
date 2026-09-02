// FILE: OnboardingTour.tsx
// Purpose: 4-step tooltips on first blank app — world-class onboarding.
// Triggers once per homeDir, dismissed via localStorage. No modal, just tooltips.

import { useEffect, useState } from "react";

const KEY = "caide:onboarding-tour:v1";
const STEPS = [
  { id: 1, text: "Create your first app — pick Blank, RN, Flutter, or Website" },
  { id: 2, text: "Type in the composer — / for commands, @ for files" },
  { id: 3, text: "Watch tools stream live — expand any tool for input/output" },
  { id: 4, text: "Preview appears on the right — cmd+k for everything" },
] as const;

export function useOnboardingTour() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(KEY)) return;
    setStep(1);
  }, []);
  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "seen");
    } catch {}
    setStep(null);
  };
  const next = () => setStep((s) => (s !== null && s < 4 ? s + 1 : null));
  return { step, steps: STEPS, next, dismiss, active: step !== null };
}

export function OnboardingTourBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
      <span className="text-muted-foreground">Tip: try the 3 prompts below or type your own.</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto text-xs text-muted-foreground hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );
}
