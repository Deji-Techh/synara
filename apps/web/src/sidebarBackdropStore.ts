import { create } from "zustand";

const STORAGE_KEY = "caide:sidebar-backdrop:custom-image:v1";

interface SidebarBackdropState {
  customImage: string | null;
  setCustomImage: (dataUrl: string | null) => void;
  resetToDefault: () => void;
}

function readPersisted(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useSidebarBackdropStore = create<SidebarBackdropState>((set) => ({
  customImage: readPersisted(),
  setCustomImage: (dataUrl) => {
    if (typeof window !== "undefined") {
      try {
        if (dataUrl) {
          window.localStorage.setItem(STORAGE_KEY, dataUrl);
        } else {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // Ignore quota failures
      }
    }
    set({ customImage: dataUrl });
  },
  resetToDefault: () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    set({ customImage: null });
  },
}));

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      useSidebarBackdropStore.setState({ customImage: event.newValue });
    }
  });
}

/**
 * Resizes and crops any uploaded image to an optimal banner aspect ratio (1200x320)
 * so it fits the sidebar header and blends downwards seamlessly without lag or memory bloat.
 */
export async function processAndResizeBackdropImage(
  file: File,
  targetWidth = 1200,
  targetHeight = 320,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to parse image"));
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(reader.result as string);
            return;
          }

          // Cover crop: calculate scaling to fill canvas
          const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
          const scaledW = img.width * scale;
          const scaledH = img.height * scale;
          const offsetX = (targetWidth - scaledW) / 2;
          const offsetY = 0; // Top-align for header banner

          ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);
          const output = canvas.toDataURL("image/webp", 0.88);
          resolve(output);
        } catch {
          resolve(reader.result as string);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
