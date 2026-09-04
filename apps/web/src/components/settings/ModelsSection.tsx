// FILE: ModelsSection.tsx
// Purpose: Display available routing targets, context windows, and output tokens
// for a provider with custom model additions (Dyad x Caide parity in Caide styling).

import { useState, useMemo, useEffect } from "react";
import {
  getBuiltInModelsForProvider,
  formatContextWindow,
  fetchRemoteCatalogModels,
  type ModelOption,
} from "@caide/shared/languageModelCatalog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { CentralIcon } from "~/lib/central-icons";
import { PlusIcon, TrashIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { toastManager } from "~/components/ui/toast";

const CUSTOM_MODELS_STORAGE_PREFIX = "caide:custom-models:";

export function loadCustomModelsForProvider(providerId: string): ModelOption[] {
  try {
    const raw = localStorage.getItem(`${CUSTOM_MODELS_STORAGE_PREFIX}${providerId}`);
    if (!raw) return [];
    return JSON.parse(raw) as ModelOption[];
  } catch {
    return [];
  }
}

export function saveCustomModelsForProvider(providerId: string, models: ModelOption[]): void {
  try {
    localStorage.setItem(
      `${CUSTOM_MODELS_STORAGE_PREFIX}${providerId}`,
      JSON.stringify(models),
    );
  } catch {
    // ignore
  }
}

interface ModelsSectionProps {
  providerId: string;
  allowCustomModels?: boolean;
}

export function ModelsSection({ providerId, allowCustomModels = true }: ModelsSectionProps) {
  const [remoteModels, setRemoteModels] = useState<ModelOption[]>([]);
  const [customModels, setCustomModels] = useState<ModelOption[]>(() =>
    loadCustomModelsForProvider(providerId),
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [customSlug, setCustomSlug] = useState("");
  const [customName, setCustomName] = useState("");
  const [customContext, setCustomContext] = useState("128000");
  const [customOutput, setCustomOutput] = useState("8192");

  useEffect(() => {
    let active = true;
    fetchRemoteCatalogModels(providerId).then((live) => {
      if (active && live && live.length > 0) {
        setRemoteModels(live);
      }
    });
    return () => {
      active = false;
    };
  }, [providerId]);

  // Re-sync if providerId changes
  const builtInModels = useMemo(() => {
    if (remoteModels.length > 0) return remoteModels;
    return getBuiltInModelsForProvider(providerId);
  }, [providerId, remoteModels]);
  const loadedCustomModels = useMemo(
    () => loadCustomModelsForProvider(providerId),
    [providerId],
  );

  const allModels: ModelOption[] = useMemo(() => {
    return [...builtInModels, ...loadedCustomModels];
  }, [builtInModels, loadedCustomModels]);

  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = customSlug.trim();
    if (!slug) {
      toastManager.add({ type: "error", title: "Please enter a model slug." });
      return;
    }
    const name = customName.trim() || slug;
    const context = parseInt(customContext, 10) || 128_000;
    const output = parseInt(customOutput, 10) || 8_192;

    const newModel: ModelOption = {
      name: slug,
      displayName: name,
      description: "Custom user-added model",
      contextWindow: context,
      maxOutputTokens: output,
      type: "custom",
    };

    const existing = loadCustomModelsForProvider(providerId);
    if (existing.some((m) => m.name === slug)) {
      toastManager.add({ type: "error", title: "Model slug already exists." });
      return;
    }

    const next = [...existing, newModel];
    saveCustomModelsForProvider(providerId, next);
    setCustomModels(next);
    setCustomSlug("");
    setCustomName("");
    setIsAddOpen(false);
    toastManager.add({ type: "success", title: `Custom model "${name}" added` });
  };

  const handleDeleteCustomModel = (slug: string) => {
    const existing = loadCustomModelsForProvider(providerId);
    const next = existing.filter((m) => m.name !== slug);
    saveCustomModelsForProvider(providerId, next);
    setCustomModels(next);
    toastManager.add({ type: "success", title: "Custom model removed" });
  };

  return (
    <div className="mt-6 border-t border-border/50 pt-5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available Models
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Routing targets with verified context and output token limits.
          </p>
        </div>
        <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {allModels.length} models
        </span>
      </div>

      <div className="mt-3 divide-y divide-border/40 rounded-lg border border-border/60 bg-card/40 overflow-hidden">
        {allModels.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No built-in models configured for {providerId}. You can add custom models below.
          </div>
        ) : (
          allModels.map((model) => (
            <div
              key={model.name}
              className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {model.displayName}
                  </span>
                  <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {model.name}
                  </code>
                  {model.type === "custom" ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-primary">
                      CUSTOM
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted/80 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-muted-foreground">
                      BUILT-IN
                    </span>
                  )}
                </div>
                {model.description ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {model.description}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
                {model.contextWindow ? (
                  <span
                    className="rounded bg-muted/50 px-1.5 py-0.5"
                    title={`${model.contextWindow.toLocaleString()} context tokens`}
                  >
                    {formatContextWindow(model.contextWindow)} ctx
                  </span>
                ) : null}
                {model.maxOutputTokens ? (
                  <span
                    className="rounded bg-muted/50 px-1.5 py-0.5"
                    title={`${model.maxOutputTokens.toLocaleString()} max output tokens`}
                  >
                    {formatContextWindow(model.maxOutputTokens)} out
                  </span>
                ) : null}
                {model.type === "custom" ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteCustomModel(model.name)}
                    aria-label={`Remove ${model.displayName}`}
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {allowCustomModels && providerId !== "auto" ? (
        <div className="mt-3">
          {!isAddOpen ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => setIsAddOpen(true)}
              className="gap-1.5 text-xs"
            >
              <PlusIcon className="size-3.5" />
              Add Custom Model
            </Button>
          ) : (
            <form
              onSubmit={handleAddCustomModel}
              className="rounded-lg border border-border/70 bg-card p-3 space-y-2.5"
            >
              <div className="text-xs font-medium text-foreground">Add Custom Model for {providerId}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase font-mono text-muted-foreground">
                    Model Slug / API ID
                  </label>
                  <Input
                    className="h-7 text-xs font-mono"
                    placeholder="e.g. gpt-5-preview"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-muted-foreground">
                    Display Name
                  </label>
                  <Input
                    className="h-7 text-xs"
                    placeholder="e.g. GPT-5 Preview"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-muted-foreground">
                    Context Window (tokens)
                  </label>
                  <Input
                    type="number"
                    className="h-7 text-xs font-mono"
                    value={customContext}
                    onChange={(e) => setCustomContext(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-muted-foreground">
                    Max Output Tokens
                  </label>
                  <Input
                    type="number"
                    className="h-7 text-xs font-mono"
                    value={customOutput}
                    onChange={(e) => setCustomOutput(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button size="xs" type="submit">
                  Save Model
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
