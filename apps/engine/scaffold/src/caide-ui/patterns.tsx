import type { ReactNode } from "react";
import { clsx } from "clsx";

import { CaideButton, CaideStack } from "./primitives";

export function CaideAppHeader({
  title,
  description,
  leading,
  actions,
  className,
}: {
  title: string;
  description?: string;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={clsx(
        "flex min-w-0 items-start justify-between gap-4 border-b border-[var(--caide-border)] pb-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-bold tracking-[-0.025em]">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[var(--caide-text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function CaideStatePanel({
  title,
  description,
  actionLabel,
  onAction,
  tone = "neutral",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "neutral" | "error";
}) {
  return (
    <CaideStack
      className={clsx(
        "items-start rounded-[var(--caide-radius-lg)] border p-5",
        tone === "error"
          ? "border-[var(--caide-danger)] bg-[var(--caide-surface)]"
          : "border-[var(--caide-border)] bg-[var(--caide-surface)]",
      )}
      gap="3"
      role={tone === "error" ? "alert" : "status"}
    >
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 max-w-[60ch] text-sm leading-6 text-[var(--caide-text-secondary)]">
          {description}
        </p>
      </div>
      {actionLabel && onAction ? (
        <CaideButton variant={tone === "error" ? "danger" : "secondary"} onClick={onAction}>
          {actionLabel}
        </CaideButton>
      ) : null}
    </CaideStack>
  );
}

export function CaideBottomNavigation({
  label,
  items,
}: {
  label: string;
  items: ReadonlyArray<{
    id: string;
    label: string;
    icon: ReactNode;
    active?: boolean;
    onSelect: () => void;
  }>;
}) {
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--caide-border)] bg-[var(--caide-background)] px-[max(0.5rem,var(--caide-safe-left))] pb-[max(0.5rem,var(--caide-safe-bottom))]"
    >
      <ul className="mx-auto grid min-h-16 max-w-xl grid-flow-col auto-cols-fr">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={item.active ? "page" : undefined}
              onClick={item.onSelect}
              data-caide-motion-trigger="navigation"
              className={clsx(
                "caide-motion-pressable",
                "flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-[var(--caide-radius-sm)] px-2",
                "text-xs font-medium outline-none transition-colors duration-[var(--caide-motion-quick)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--caide-focus)]",
                item.active
                  ? "text-[var(--caide-accent)]"
                  : "text-[var(--caide-text-muted)] hover:bg-[var(--caide-surface-hover)]",
              )}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
