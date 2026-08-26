import {
  type ApprovalRequestId,
  type ProviderApprovalDecision,
} from "@caide/contracts";
import { type PendingApproval } from "../../pendingInteractionDerivation";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { COMPOSER_INPUT_SURFACE_CLASS_NAME } from "./composerPickerStyles";
import { useEffect, useMemo, useState } from "react";

interface CaideBlueprintApprovalPanelProps {
  approval: PendingApproval;
  isResponding: boolean;
  onRespond: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
    lifecycleGeneration?: string,
    requestKind?: PendingApproval["requestKind"],
    blueprintEdits?: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}

interface BlueprintFields {
  appName: string;
  templateId: string;
  themeId: string;
  designDirection: string;
  primaryColor: string;
}

const TEXT_FIELDS: ReadonlyArray<{
  key: keyof BlueprintFields;
  label: string;
  placeholder: string;
}> = [
  { key: "appName", label: "App name", placeholder: "My app" },
  { key: "designDirection", label: "Design direction", placeholder: "Clean, minimal, campus-friendly" },
  { key: "templateId", label: "Template", placeholder: "Default template" },
  { key: "themeId", label: "Theme", placeholder: "Default theme" },
];

const COLOR_RE = /^#[0-9a-fA-F]{6}$/u;

function readFields(blueprint: Record<string, unknown> | undefined): BlueprintFields {
  const b = blueprint ?? {};
  return {
    appName: (typeof b.appName === "string" ? b.appName : "").trim(),
    templateId: (typeof b.templateId === "string" ? b.templateId : "").trim(),
    themeId: (typeof b.themeId === "string" ? b.themeId : "").trim(),
    designDirection: (typeof b.designDirection === "string" ? b.designDirection : "").trim(),
    primaryColor:
      typeof b.primaryColor === "string" && COLOR_RE.test(b.primaryColor) ? b.primaryColor : "#0284c7",
  };
}

export const CaideBlueprintApprovalPanel = function CaideBlueprintApprovalPanel({
  approval,
  isResponding,
  onRespond,
}: CaideBlueprintApprovalPanelProps) {
  const initial = useMemo(() => readFields(approval.blueprint), [approval.blueprint]);
  const [fields, setFields] = useState<BlueprintFields>(initial);
  const [submitted, setSubmitted] = useState(false);

  // Sync fields when blueprint arrives async (initial is empty on first render
  // because pending derivation pending). Without this, inputs stay empty even
  // though draft appName exists, forcing user to retype and causing edits diff
  // to be computed against wrong initial.
  useEffect(() => {
    setFields(initial);
  }, [initial]);

  const visualCount =
    Array.isArray(approval.blueprint?.visuals) && approval.blueprint?.visuals.length > 0
      ? (approval.blueprint?.visuals as unknown[]).length
      : 0;

  const setField = (key: keyof BlueprintFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const colorValid = COLOR_RE.test(fields.primaryColor.trim());
  const appName = fields.appName.trim();

  const respond = (decision: ProviderApprovalDecision) => {
    setSubmitted(true);
    const edits: Record<string, unknown> = {};
    if (decision === "accept") {
      if (appName !== initial.appName && appName !== "") edits.appName = appName;
      if (fields.designDirection !== initial.designDirection) {
        edits.designDirection = fields.designDirection;
      }
      if (fields.templateId !== initial.templateId) edits.templateId = fields.templateId;
      if (fields.themeId !== initial.themeId) edits.themeId = fields.themeId;
      if (colorValid && fields.primaryColor !== initial.primaryColor) {
        edits.primaryColor = fields.primaryColor.trim();
      }
    }
    void onRespond(
      approval.requestId,
      decision,
      approval.lifecycleGeneration,
      "blueprint",
      decision === "accept" ? edits : undefined,
    );
  };

  return (
    <div className={cn(COMPOSER_INPUT_SURFACE_CLASS_NAME, "overflow-hidden")}>
      <div className="border-b border-border/60 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[12px] font-bold text-primary">
              ✦
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                App Blueprint
              </div>
              <div className="truncate text-[13px] font-semibold text-foreground">
                {appName || "Untitled app"}
              </div>
            </div>
          </div>
          {visualCount > 0 ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
              {visualCount} visual{visualCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-3.5 py-3">
        {TEXT_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`bp-${key}`} className="text-[11px] font-medium text-foreground/80">
              {label}
            </Label>
            <Input
              id={`bp-${key}`}
              value={fields[key]}
              onChange={(event) => setField(key, event.target.value)}
              placeholder={placeholder}
              className="h-8 text-[12.5px]"
              disabled={isResponding}
              autoComplete="off"
            />
          </div>
        ))}

        <div className="space-y-1">
          <Label htmlFor="bp-primaryColor" className="text-[11px] font-medium text-foreground/80">
            Primary color
          </Label>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-8 w-8 shrink-0 rounded-lg border border-border/70 shadow-xs transition-colors",
                !colorValid && "ring-2 ring-rose-500/50",
              )}
              style={{ backgroundColor: colorValid ? fields.primaryColor.trim() : "#0284c7" }}
              aria-hidden
            />
            <Input
              id="bp-primaryColor"
              value={fields.primaryColor}
              onChange={(event) => setField("primaryColor", event.target.value)}
              placeholder="#0284c7"
              className="h-8 font-mono text-[12px]"
              disabled={isResponding}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {!colorValid && (
            <p className="text-[10.5px] text-rose-500/90">Use a 6-digit hex color, e.g. #0284c7.</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/20 px-3.5 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => respond("decline")}
          disabled={isResponding || submitted}
        >
          Decline
        </Button>
        <Button
          size="sm"
          onClick={() => respond("accept")}
          disabled={isResponding || submitted || (appName === "" && initial.appName === "")}
        >
          {submitted ? "Approved ✓" : "Approve & Build"}
        </Button>
      </div>
    </div>
  );
};