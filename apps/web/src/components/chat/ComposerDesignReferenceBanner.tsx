// FILE: ComposerDesignReferenceBanner.tsx
// Purpose: Banner that appears above the composer input when a user uploads a new
// design reference, prompting with a tick/confirm button to let the agent know.
// Layer: Chat composer UI

import { Button } from "~/components/ui/button";
import { IconCheck as Check, IconSparkles as Sparkles, IconX as X } from "@tabler/icons-react";

interface ComposerDesignReferenceBannerProps {
  reference: {
    name: string;
    description?: string;
  };
  onInform: () => void;
  onDismiss: () => void;
}

export function ComposerDesignReferenceBanner({
  reference,
  onInform,
  onDismiss,
}: ComposerDesignReferenceBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-primary/10 border-b border-border/70 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles className="size-4 text-primary shrink-0" />
        <div className="min-w-0 flex items-center gap-1 truncate">
          <span className="font-semibold text-foreground">New design reference:</span>
          <span className="font-medium text-primary truncate">"{reference.name}"</span>
          {reference.description ? (
            <span className="text-muted-foreground truncate text-[11px]">
              ({reference.description})
            </span>
          ) : null}
          <span className="text-muted-foreground hidden sm:inline">— Inform agent?</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="xs"
          variant="default"
          className="h-6.5 gap-1 px-2.5 text-[11px] font-medium"
          onClick={onInform}
        >
          <Check className="size-3.5" /> Let Agent Know
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="h-6.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          <X className="size-3.5" /> Dismiss
        </Button>
      </div>
    </div>
  );
}
