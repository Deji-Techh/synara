// FILE: ReferenceDockPane.tsx
// Purpose: Right-dock pane for project design & visual references.
//          Users can upload UI inspirations, screenshots, or design guidelines
//          organized in a square-by-square grid with an add tile. Detects
//          multimodal/vision support for the active model.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadId } from "@caide/contracts";
import { isModelVisionCapable } from "@caide/shared/languageModelCatalog";
import { cn } from "~/lib/utils";
import { DockPaneHeader } from "./DockPaneHeader";
import { PanelStateMessage } from "./PanelStateMessage";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { useStore } from "~/store";
import { ensureNativeApi } from "~/nativeApi";
import { toastManager } from "~/components/ui/toast";
import {
  IconEye as Eye,
  IconFileText as FileText,
  IconPhoto as ImageIcon,
  IconPlus as Plus,
  IconSparkles as Sparkles,
  IconTrash as Trash2,
  IconX as X,
} from "@tabler/icons-react";

export interface ReferenceItem {
  id: string;
  name: string;
  description?: string;
  type: "image" | "document";
  dataUrl?: string | undefined;
  filePath?: string | undefined;
  size?: number | undefined;
  addedAt: number;
}

export function ReferenceDockPane(props: {
  threadId: ThreadId;
  workspaceRoot?: string | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPreview, setSelectedPreview] = useState<ReferenceItem | null>(null);
  const [previewDescription, setPreviewDescription] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Read current model to detect vision capability
  const activeModelId = useStore((state) => {
    const shell = state.threadShellById?.[props.threadId];
    return shell?.modelSelection?.model ?? "default";
  });

  // Vision detection: dynamically checks model modalities and multimodal patterns
  const isVisionCapable = isModelVisionCapable(activeModelId);

  // Load persisted references from localStorage + backend RPC
  const storageKey = `caide_references_${props.workspaceRoot || props.threadId}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setItems(JSON.parse(saved));
      }
    } catch {
      // ignore parse error
    }

    void (async () => {
      try {
        const res = await ensureNativeApi().database.invoke({
          threadId: props.threadId,
          channel: "reference:list",
          payload: { workspaceRoot: props.workspaceRoot },
        });
        const data = res.value as { references?: ReferenceItem[] };
        if (Array.isArray(data?.references) && data.references.length > 0) {
          setItems(data.references);
          try {
            localStorage.setItem(storageKey, JSON.stringify(data.references));
          } catch {}
        }
      } catch {
        // local fallback
      } finally {
        setLoading(false);
      }
    })();
  }, [storageKey, props.threadId, props.workspaceRoot]);

  const persistItems = useCallback(
    (next: ReferenceItem[]) => {
      setItems(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // local storage quota fallback
      }
    },
    [storageKey],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith("image/");
      const reader = new FileReader();

      reader.onload = async () => {
        const newItem: ReferenceItem = {
          id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          description: "",
          type: isImage ? "image" : "document",
          dataUrl: typeof reader.result === "string" ? reader.result : undefined,
          size: file.size,
          addedAt: Date.now(),
        };
        const next = [newItem, ...items];
        persistItems(next);

        // Sync with backend
        try {
          await ensureNativeApi().database.invoke({
            threadId: props.threadId,
            channel: "reference:save",
            payload: { workspaceRoot: props.workspaceRoot, item: newItem },
          });
        } catch {}

        // Notify app so composer can offer to inform the agent
        window.dispatchEvent(
          new CustomEvent("caide:design-reference-added", {
            detail: { reference: newItem, threadId: props.threadId },
          }),
        );
      };

      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    persistItems(items.filter((item) => item.id !== id));
    if (selectedPreview?.id === id) {
      setSelectedPreview(null);
    }
    try {
      await ensureNativeApi().database.invoke({
        threadId: props.threadId,
        channel: "reference:delete",
        payload: { workspaceRoot: props.workspaceRoot, id },
      });
    } catch {}
  };

  const updateDescription = async (id: string, description: string) => {
    const updated = items.map((item) => (item.id === id ? { ...item, description } : item));
    persistItems(updated);
    const target = updated.find((i) => i.id === id);
    if (target) {
      setSelectedPreview(target);
      try {
        await ensureNativeApi().database.invoke({
          threadId: props.threadId,
          channel: "reference:save",
          payload: { workspaceRoot: props.workspaceRoot, item: target },
        });
        toastManager.add({ type: "success", title: "Reference description saved" });
      } catch {}
    }
  };

  return (
    <div className="flex h-full flex-col">
      <DockPaneHeader title="Design References" onClose={props.onClose} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3">
          {/* Header guidance card */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                <span>Style & Constraint Anchors</span>
              </div>
              <Badge
                variant={isVisionCapable ? "secondary" : "outline"}
                className={cn(
                  "text-[10px] gap-1 py-0 h-4.5",
                  isVisionCapable && "bg-primary/10 text-primary border-primary/20",
                )}
              >
                {isVisionCapable ? "Vision Capable" : "Text Model"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Upload visual mockups, UI screenshots, or design specs. The agent uses these as
              primary references for theme, colors, and layout patterns.
            </p>
            {!isVisionCapable && (
              <div className="rounded bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
                Current model ({activeModelId}) is text-only. Visual styles and layout tokens will
                be summarized for the model.
              </div>
            )}
          </div>

          {loading ? (
            <PanelStateMessage>Loading references...</PanelStateMessage>
          ) : (
            <>
              {/* Square-by-square Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                {/* Plus Tile in the first empty slot */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border hover:border-primary/60 bg-muted/10 hover:bg-primary/5 transition-all duration-200 cursor-pointer text-center p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted/60 group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary transition-colors">
                    <Plus className="size-4.5 transition-transform group-hover:scale-110" />
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground">
                      Add reference
                    </span>
                    <span className="text-[10px] text-muted-foreground">Image or document</span>
                  </div>
                </button>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.md,.txt,.json,.pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {/* Uploaded Reference Tiles */}
                {items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedPreview(item);
                      setPreviewDescription(item.description || "");
                    }}
                    className="group relative flex aspect-square cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs transition-all hover:border-border/80 hover:shadow-md"
                  >
                    {item.type === "image" && item.dataUrl ? (
                      <img
                        src={item.dataUrl}
                        alt={item.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3 text-center bg-muted/30">
                        <FileText className="size-7 text-muted-foreground/70" />
                        <span className="line-clamp-2 text-[11px] font-medium text-foreground/90 break-all px-1">
                          {item.name}
                        </span>
                      </div>
                    )}

                    {/* Gradient overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => removeItem(item.id, e)}
                          title="Remove reference"
                          className="flex size-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-destructive transition-colors"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                      <div className="flex flex-col text-white text-[10px] min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="truncate max-w-[85px] font-medium">{item.name}</span>
                          <Eye className="size-3 shrink-0 opacity-80" />
                        </div>
                        {item.description ? (
                          <span className="truncate text-[9px] opacity-75">{item.description}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-muted-foreground">
                  <ImageIcon className="size-6 text-muted-foreground/40 mb-2" />
                  <span>No reference materials uploaded yet.</span>
                  <span className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Click the + tile above to add mockups.
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Lightbox / Preview Modal */}
      {selectedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedPreview(null)}
        >
          <div
            className="relative flex max-h-[90vh] max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground truncate max-w-md">
                {selectedPreview.name}
              </span>
              <Button size="icon-xs" variant="ghost" onClick={() => setSelectedPreview(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex items-center justify-center overflow-auto p-4 max-h-[60vh]">
              {selectedPreview.type === "image" && selectedPreview.dataUrl ? (
                <img
                  src={selectedPreview.dataUrl}
                  alt={selectedPreview.name}
                  className="max-h-[55vh] w-auto max-w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 p-6 text-center">
                  <FileText className="size-12 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Document reference attached for context.
                  </span>
                </div>
              )}
            </div>

            {/* Description Editor */}
            <div className="pt-3 border-t border-border flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-foreground/80">
                <span>Description for the agent:</span>
                <span className="text-[10px] text-muted-foreground">Read by check_references</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Login page hero mockup, brand color scheme, primary button style"
                  value={previewDescription}
                  onChange={(e) => setPreviewDescription(e.target.value)}
                  className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  size="xs"
                  onClick={() => updateDescription(selectedPreview.id, previewDescription)}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReferenceDockPane;
