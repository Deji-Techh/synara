import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  processAndResizeBackdropImage,
  useSidebarBackdropStore,
} from "~/sidebarBackdropStore";
import { NightlySkyArt } from "~/components/SidebarStageBackdrop";
import { CaideLogo } from "~/components/CaideLogo";
import { LuUpload, LuUndo2, LuCheck } from "react-icons/lu";

export function SidebarBackdropSettings() {
  const customImage = useSidebarBackdropStore((s) => s.customImage);
  const setCustomImage = useSidebarBackdropStore((s) => s.setCustomImage);
  const resetToDefault = useSidebarBackdropStore((s) => s.resetToDefault);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      setStatusMessage("Resizing and optimizing image...");
      const optimizedDataUrl = await processAndResizeBackdropImage(file, 1200, 320);
      setCustomImage(optimizedDataUrl);
      setStatusMessage("Image resized and applied!");
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Live Preview Card */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-muted/10">
        <div className="relative h-28 w-full select-none overflow-hidden sidebar-stage-backdrop">
          {customImage ? (
            <div
              className="h-full w-full bg-cover bg-top transition-all duration-300"
              style={{ backgroundImage: `url(${customImage})` }}
            />
          ) : (
            <NightlySkyArt />
          )}

          {/* Foreground preview elements mimicking the sidebar header & search */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
            <div className="flex items-center gap-2">
              <CaideLogo className="size-3.5 text-white drop-shadow-sm" />
              <span className="text-xs font-semibold tracking-tight text-white drop-shadow-sm">
                Caide
              </span>
            </div>
            <div className="mt-2 h-6 w-48 rounded-md bg-white/10 border border-white/15 px-2 flex items-center text-[10px] text-white/70">
              Search threads...
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 bg-muted/20 px-3.5 py-2.5">
          <div className="text-xs text-muted-foreground">
            {customImage ? (
              <span className="inline-flex items-center gap-1.5 text-foreground/90 font-medium">
                <LuCheck className="size-3.5 text-emerald-500" />
                Custom backdrop active (auto-scaled to 1200×320)
              </span>
            ) : (
              <span>Default cosmic starry sky</span>
            )}
            {statusMessage && (
              <span className="ml-2 text-xs text-primary">{statusMessage}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="h-7 text-xs gap-1.5"
            >
              <LuUpload className="size-3.5" />
              {customImage ? "Change image" : "Upload image"}
            </Button>

            {customImage && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetToDefault}
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <LuUndo2 className="size-3.5" />
                Reset to default
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/80 leading-relaxed">
        Upload any image for the left sidebar header. The system automatically crops and resizes it to an optimized banner resolution, applying a gentle downward gradient mask that blends naturally into your sidebar.
      </p>
    </div>
  );
}
