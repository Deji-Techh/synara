// FILE: BrandingWizardModal.tsx
// Purpose: Two-step dialog for choosing how to brand a brand-new project: either
//          the agent generates the name/logo/colors, or the user supplies their own
//          name, description, colors, and an optional logo image. Mirrors dyad x
//          caide's BrandingWizardModal so the Flutter Builder Engine receives an
//          identical branding context.
// Layer: Web UI dialog
// Exports: BrandingWizardModal, BrandingWizardValue
// Depends on: ui/dialog, ui/button, ui/input, ui/textarea, ui/label, brandingSetup

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { BrandingData } from "../brandingSetup";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  dialogFieldLabelClassName,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { cn } from "~/lib/utils";
import { CentralIcon } from "~/lib/central-icons";

export type BrandingWizardValue = BrandingData;

// A three-stop beige ramp that pairs well regardless of the app's own palette.
const DEFAULT_PRIMARY = "#7c3aed";
const DEFAULT_SECONDARY = "#3f3f46";
const DEFAULT_ACCENT = "#f59e0b";

export function BrandingWizardModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: BrandingWizardValue) => void;
}) {
  const [step, setStep] = useState<"initial" | "custom">("initial");
  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState(DEFAULT_SECONDARY);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const descriptionId = `${fieldId}-description`;

  const resetState = useCallback(() => {
    setStep("initial");
    setAppName("");
    setAppDescription("");
    setPrimaryColor(DEFAULT_PRIMARY);
    setSecondaryColor(DEFAULT_SECONDARY);
    setAccentColor(DEFAULT_ACCENT);
    setLogoFile(null);
  }, []);

  useEffect(() => {
    // Seed on the closed -> open transition only, mirroring CreateProjectDialog.
    if (props.open) {
      resetState();
    }
  }, [props.open, resetState]);

  const handleOpenChange = (open: boolean) => {
    if (!open) resetState();
    props.onOpenChange(open);
  };

  const handleGenerate = () => {
    const value: BrandingWizardValue = { mode: "generate" };
    handleOpenChange(false);
    props.onSubmit(value);
  };

  const handleCustomSubmit = () => {
    const value: BrandingWizardValue = {
      mode: "custom",
      name: appName,
      description: appDescription,
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        accent: accentColor,
      },
      ...(logoFile ? { logoFile } : {}),
    };
    handleOpenChange(false);
    props.onSubmit(value);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file) setLogoFile(file);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-w-[26rem]">
        {step === "initial" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CentralIcon name="color-palette-2" className="size-4.5" aria-hidden="true" />
                App Branding
              </DialogTitle>
              <DialogDescription>
                Do you have a logo and a name you want to use, or should I generate them for you?
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="flex flex-col gap-3">
                <Button
                  variant="outline"
                  className="flex h-16 flex-col items-center justify-center gap-1"
                  onClick={() => setStep("custom")}
                >
                  <span className="font-medium">I have my own branding</span>
                  <span className="text-xs text-muted-foreground">
                    Upload logo, set name and colors
                  </span>
                </Button>
                <Button
                  variant="default"
                  className="flex h-16 flex-col items-center justify-center gap-1"
                  onClick={handleGenerate}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <CentralIcon
                      name="arrow-rotate-sparkle"
                      className="size-4"
                      aria-hidden="true"
                    />
                    Generate them for me
                  </span>
                  <span className="text-xs opacity-80">AI will pick a name, logo, and colors</span>
                </Button>
              </div>
            </DialogPanel>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Set Custom Branding</DialogTitle>
              <DialogDescription>
                Provide the details below to initialize your app&apos;s brand identity.
              </DialogDescription>
            </DialogHeader>
            <DialogPanel className="space-y-4">
              <div className="grid gap-2">
                <Label>App Logo</Label>
                <div
                  className="relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-foreground/20 px-6 py-6 text-center transition-colors hover:bg-foreground/4 focus-within:border-foreground/40"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    aria-label="Upload logo image"
                    onChange={handleFileChange}
                  />
                  {logoFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg bg-foreground/6">
                        <img
                          src={URL.createObjectURL(logoFile)}
                          alt="Logo preview"
                          className="size-full object-cover"
                        />
                      </div>
                      <span className="text-sm font-medium">{logoFile.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1.5 right-1.5 size-6 rounded-full p-0"
                        aria-label="Remove logo"
                        onClick={(event) => {
                          event.stopPropagation();
                          setLogoFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        <CentralIcon name="x" className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <CentralIcon
                        name="cloud-upload"
                        className="mb-2 size-7 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium">Click to upload logo</p>
                      <p className="text-xs text-muted-foreground">SVG, PNG, JPG (max 2MB)</p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={nameId}>App Name</Label>
                <Input
                  id={nameId}
                  placeholder="e.g. Acme Corp"
                  value={appName}
                  onChange={(event) => setAppName(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={descriptionId}>Description</Label>
                <Textarea
                  id={descriptionId}
                  placeholder="A brief description of what this app does..."
                  value={appDescription}
                  onChange={(event) => setAppDescription(event.target.value)}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldId}-primary`}>Primary</Label>
                  <input
                    id={`${fieldId}-primary`}
                    type="color"
                    value={primaryColor}
                    aria-label="Primary color"
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    className="h-10 w-full cursor-pointer rounded-lg border border-foreground/12 bg-transparent p-1"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldId}-secondary`}>Secondary</Label>
                  <input
                    id={`${fieldId}-secondary`}
                    type="color"
                    value={secondaryColor}
                    aria-label="Secondary color"
                    onChange={(event) => setSecondaryColor(event.target.value)}
                    className="h-10 w-full cursor-pointer rounded-lg border border-foreground/12 bg-transparent p-1"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`${fieldId}-accent`}>Accent</Label>
                  <input
                    id={`${fieldId}-accent`}
                    type="color"
                    value={accentColor}
                    aria-label="Accent color"
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="h-10 w-full cursor-pointer rounded-lg border border-foreground/12 bg-transparent p-1"
                  />
                </div>
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button
                variant="ghost"
                className={cn("p-2", dialogFieldLabelClassName)}
                onClick={() => setStep("initial")}
              >
                Back
              </Button>
              <Button variant="prominent" onClick={handleCustomSubmit}>
                Create App
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
