import React, { useState } from "react";
import { SettingsSection, SettingsRow } from "./SettingsPanelPrimitives";
import { SettingsSelectControl, SettingResetButton } from "./SettingControls";
import { SelectItem } from "../ui/select";

export interface HarnessModelConfig {
  plannerModel: string;
  builderModel: string;
  verifierModel: string;
  tasteModel: string;
}

const DEFAULT_MODELS: HarnessModelConfig = {
  plannerModel: "sonnet-5",
  builderModel: "gpt-5.6-sol",
  verifierModel: "opus-4.8",
  tasteModel: "fable-5",
};

const MODEL_CHOICES = [
  { value: "gpt-5.6-sol", label: "GPT 5.6 Sol (Fast / Bulk / Free)" },
  { value: "sonnet-5", label: "Claude 3.7 Sonnet (Smart / Balanced)" },
  { value: "opus-4.8", label: "Claude 3.8 Opus (High Intelligence / Taste)" },
  { value: "fable-5", label: "Fable 5 (Max Intelligence / Max Taste)" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Large Context)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Ultra Fast)" },
];

export function ModelsSettingsPanel() {
  const [models, setModels] = useState<HarnessModelConfig>(() => {
    try {
      const saved = localStorage.getItem("caide:harness_models");
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_MODELS;
  });

  const updateModel = (key: keyof HarnessModelConfig, value: string) => {
    const updated = { ...models, [key]: value };
    setModels(updated);
    try {
      localStorage.setItem("caide:harness_models", JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const resetAll = () => {
    setModels(DEFAULT_MODELS);
    localStorage.removeItem("caide:harness_models");
  };

  const getLabel = (val: string) => MODEL_CHOICES.find((m) => m.value === val)?.label ?? val;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Harness Model Configuration"
        action={
          JSON.stringify(models) !== JSON.stringify(DEFAULT_MODELS) ? (
            <SettingResetButton label="models" onClick={resetAll} />
          ) : null
        }
      >
        <SettingsRow
          title="Planning model"
          description="Model used by the Planner to construct user flows, specifications, and architecture."
          control={
            <SettingsSelectControl
              value={models.plannerModel}
              onValueChange={(val) => updateModel("plannerModel", val)}
              ariaLabel="Planning model"
              valueContent={getLabel(models.plannerModel)}
            >
              {MODEL_CHOICES.map((m) => (
                <SelectItem hideIndicator key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SettingsSelectControl>
          }
        />

        <SettingsRow
          title="Building model"
          description="Model used by the Builder to write application source code, components, and state."
          control={
            <SettingsSelectControl
              value={models.builderModel}
              onValueChange={(val) => updateModel("builderModel", val)}
              ariaLabel="Building model"
              valueContent={getLabel(models.builderModel)}
            >
              {MODEL_CHOICES.map((m) => (
                <SelectItem hideIndicator key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SettingsSelectControl>
          }
        />

        <SettingsRow
          title="Verification model"
          description="Model used by the Verifier for exact design token audits, layout compliance, and screenshot review."
          control={
            <SettingsSelectControl
              value={models.verifierModel}
              onValueChange={(val) => updateModel("verifierModel", val)}
              ariaLabel="Verification model"
              valueContent={getLabel(models.verifierModel)}
            >
              {MODEL_CHOICES.map((m) => (
                <SelectItem hideIndicator key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SettingsSelectControl>
          }
        />

        <SettingsRow
          title="Taste model"
          description="Model used for aesthetic polish, anti-AI slop evaluation, and motion physics assessment."
          control={
            <SettingsSelectControl
              value={models.tasteModel}
              onValueChange={(val) => updateModel("tasteModel", val)}
              ariaLabel="Taste model"
              valueContent={getLabel(models.tasteModel)}
            >
              {MODEL_CHOICES.map((m) => (
                <SelectItem hideIndicator key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SettingsSelectControl>
          }
        />
      </SettingsSection>
    </div>
  );
}
