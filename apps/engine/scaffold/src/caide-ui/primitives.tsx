import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { clsx } from "clsx";

type ElementProps = HTMLAttributes<HTMLElement>;

export function CaideScreen({
  className,
  children,
  ...props
}: ElementProps & { children: ReactNode }) {
  return (
    <main
      className={clsx(
        "min-h-[100dvh] w-full min-w-0 overflow-x-hidden bg-[var(--caide-background)] text-[var(--caide-text)]",
        "px-[max(var(--caide-space-4),var(--caide-safe-left))] pr-[max(var(--caide-space-4),var(--caide-safe-right))]",
        "pt-[max(var(--caide-space-4),var(--caide-safe-top))] pb-[max(var(--caide-space-4),var(--caide-safe-bottom))]",
        className,
      )}
      {...props}
    >
      {children}
    </main>
  );
}

export function CaideSection({
  className,
  children,
  ...props
}: ElementProps & { children: ReactNode }) {
  return (
    <section className={clsx("mx-auto w-full max-w-[68rem] min-w-0", className)} {...props}>
      {children}
    </section>
  );
}

export function CaideStack({
  className,
  children,
  gap = "4",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  gap?: "2" | "3" | "4" | "6" | "8";
}) {
  return (
    <div
      className={clsx(
        "flex min-w-0 flex-col",
        {
          "gap-2": gap === "2",
          "gap-3": gap === "3",
          "gap-4": gap === "4",
          "gap-6": gap === "6",
          "gap-8": gap === "8",
        },
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CaideInline({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={clsx("flex min-w-0 flex-wrap items-center gap-[var(--caide-space-3)]", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const CaideButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "danger" | "quiet";
    busy?: boolean;
    auditSafe?: boolean;
  }
>(function CaideButton(
  {
    className,
    children,
    variant = "primary",
    busy = false,
    auditSafe = false,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      data-caide-motion-trigger="button"
      data-caide-audit-safe={auditSafe || undefined}
      className={clsx(
        "caide-motion-pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--caide-radius-md)] px-4",
        "text-sm font-semibold outline-none transition-[background-color,color,border-color,transform] duration-[var(--caide-motion-quick)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--caide-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--caide-background)]",
        "active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        {
          "bg-[var(--caide-accent)] text-white hover:bg-[var(--caide-accent-hover)]":
            variant === "primary",
          "border border-[var(--caide-border)] bg-[var(--caide-surface-raised)] text-[var(--caide-text)] hover:bg-[var(--caide-surface-hover)]":
            variant === "secondary",
          "bg-[var(--caide-danger)] text-white": variant === "danger",
          "text-[var(--caide-text-secondary)] hover:bg-[var(--caide-surface-hover)]":
            variant === "quiet",
        },
        className,
      )}
      {...props}
    >
      {busy ? <span aria-hidden="true">…</span> : null}
      {children}
    </button>
  );
});

export const CaideIconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    "aria-label": string;
    auditSafe?: boolean;
  }
>(function CaideIconButton(
  { className, children, type = "button", auditSafe = false, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-caide-motion-trigger="icon-button"
      data-caide-audit-safe={auditSafe || undefined}
      className={clsx(
        "caide-motion-pressable inline-flex size-12 shrink-0 items-center justify-center rounded-[var(--caide-radius-md)]",
        "border border-[var(--caide-border)] bg-[var(--caide-surface-raised)] text-[var(--caide-text)]",
        "outline-none transition-colors duration-[var(--caide-motion-quick)] hover:bg-[var(--caide-surface-hover)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--caide-focus)] focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export function CaideSurface({
  className,
  children,
  level = "base",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  level?: "base" | "raised";
}) {
  return (
    <div
      className={clsx(
        "min-w-0 rounded-[var(--caide-radius-lg)] border border-[var(--caide-border)] p-4",
        {
          "bg-[var(--caide-surface)]": level === "base",
          "bg-[var(--caide-surface-raised)] shadow-[var(--caide-shadow-raised)]":
            level === "raised",
        },
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
